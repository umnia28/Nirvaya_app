# fix_model_json.py
import json

with open("keyword_model_tfjs/model.json", "r") as f:
    original = json.load(f)

layers = original["modelTopology"]["config"]["layers"]

# Remove InputLayer — TF.js handles input shape differently
layers = [l for l in layers if l["class_name"] != "InputLayer"]

# Fix BatchNormalization axis format (TF.js expects int not list)
for layer in layers:
    if layer["class_name"] == "BatchNormalization":
        axis = layer["config"].get("axis", [3])
        if isinstance(axis, list):
            layer["config"]["axis"] = axis[0]
        # Remove keys TF.js doesn't recognize
        for key in ["module", "registered_name", "build_config"]:
            layer.pop(key, None)
    else:
        for key in ["module", "registered_name", "build_config"]:
            layer.pop(key, None)

# Rebuild in TF.js expected format
tfjs_model = {
    "modelTopology": {
        "keras_version": "2.15.0",
        "backend": "tensorflow",
        "model_config": {
            "class_name": "Sequential",
            "config": {
                "name": "sequential",
                "layers": layers
            }
        }
    },
    "weightsManifest": original["weightsManifest"]
}

# Fix weight names — TF.js expects kernel/bias not weight_0/weight_1
weight_name_map = {
    "conv2d/weight_0": "conv2d/kernel",
    "conv2d/weight_1": "conv2d/bias",
    "conv2d_1/weight_0": "conv2d_1/kernel",
    "conv2d_1/weight_1": "conv2d_1/bias",
    "conv2d_2/weight_0": "conv2d_2/kernel",
    "conv2d_2/weight_1": "conv2d_2/bias",
    "batch_normalization/weight_0": "batch_normalization/gamma",
    "batch_normalization/weight_1": "batch_normalization/beta",
    "batch_normalization/weight_2": "batch_normalization/moving_mean",
    "batch_normalization/weight_3": "batch_normalization/moving_variance",
    "batch_normalization_1/weight_0": "batch_normalization_1/gamma",
    "batch_normalization_1/weight_1": "batch_normalization_1/beta",
    "batch_normalization_1/weight_2": "batch_normalization_1/moving_mean",
    "batch_normalization_1/weight_3": "batch_normalization_1/moving_variance",
    "batch_normalization_2/weight_0": "batch_normalization_2/gamma",
    "batch_normalization_2/weight_1": "batch_normalization_2/beta",
    "batch_normalization_2/weight_2": "batch_normalization_2/moving_mean",
    "batch_normalization_2/weight_3": "batch_normalization_2/moving_variance",
    "dense/weight_0": "dense/kernel",
    "dense/weight_1": "dense/bias",
    "dense_1/weight_0": "dense_1/kernel",
    "dense_1/weight_1": "dense_1/bias",
    "dense_2/weight_0": "dense_2/kernel",
    "dense_2/weight_1": "dense_2/bias",
}

for manifest in tfjs_model["weightsManifest"]:
    for w in manifest["weights"]:
        if w["name"] in weight_name_map:
            w["name"] = weight_name_map[w["name"]]

with open("keyword_model_tfjs/model.json", "w") as f:
    json.dump(tfjs_model, f)

print("model.json fixed and saved.")