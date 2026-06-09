import json

with open("keyword_model_tfjs/model.json", "r") as f:
    original = json.load(f)

weights_manifest = original["weightsManifest"]

weight_name_map = {
    "conv2d/weight_0": "conv2d/kernel",
    "conv2d/weight_1": "conv2d/bias",
    "conv2d_1/weight_0": "conv2d_1/kernel",
    "conv2d_1/weight_1": "conv2d_1/bias",
    "conv2d_2/weight_0": "conv2d_2/kernel",
    "conv2d_2/weight_1": "conv2d_2/bias",
    "dense/weight_0": "dense/kernel",
    "dense/weight_1": "dense/bias",
    "dense_1/weight_0": "dense_1/kernel",
    "dense_1/weight_1": "dense_1/bias",
}

for manifest in weights_manifest:
    for w in manifest["weights"]:
        if w["name"] in weight_name_map:
            w["name"] = weight_name_map[w["name"]]

tfjs_model = {
    "modelTopology": {
        "keras_version": "2.15.0",
        "backend": "tensorflow",
        "model_config": {
            "class_name": "Sequential",
            "config": {
                "name": "sequential",
                "layers": [
                    {
                        "class_name": "Conv2D",
                        "config": {
                            "name": "conv2d",
                            "trainable": True,
                            "batch_input_shape": [None, 64, 40, 1],
                            "dtype": "float32",
                            "filters": 16,
                            "kernel_size": [3, 3],
                            "strides": [1, 1],
                            "padding": "same",
                            "data_format": "channels_last",
                            "dilation_rate": [1, 1],
                            "activation": "relu",
                            "use_bias": True,
                        }
                    },
                    {
                        "class_name": "MaxPooling2D",
                        "config": {
                            "name": "max_pooling2d",
                            "trainable": True,
                            "dtype": "float32",
                            "pool_size": [2, 2],
                            "padding": "valid",
                            "strides": [2, 2],
                            "data_format": "channels_last",
                        }
                    },
                    {
                        "class_name": "Conv2D",
                        "config": {
                            "name": "conv2d_1",
                            "trainable": True,
                            "dtype": "float32",
                            "filters": 32,
                            "kernel_size": [3, 3],
                            "strides": [1, 1],
                            "padding": "same",
                            "data_format": "channels_last",
                            "dilation_rate": [1, 1],
                            "activation": "relu",
                            "use_bias": True,
                        }
                    },
                    {
                        "class_name": "MaxPooling2D",
                        "config": {
                            "name": "max_pooling2d_1",
                            "trainable": True,
                            "dtype": "float32",
                            "pool_size": [2, 2],
                            "padding": "valid",
                            "strides": [2, 2],
                            "data_format": "channels_last",
                        }
                    },
                    {
                        "class_name": "Conv2D",
                        "config": {
                            "name": "conv2d_2",
                            "trainable": True,
                            "dtype": "float32",
                            "filters": 64,
                            "kernel_size": [3, 3],
                            "strides": [1, 1],
                            "padding": "same",
                            "data_format": "channels_last",
                            "dilation_rate": [1, 1],
                            "activation": "relu",
                            "use_bias": True,
                        }
                    },
                    {
                        "class_name": "MaxPooling2D",
                        "config": {
                            "name": "max_pooling2d_2",
                            "trainable": True,
                            "dtype": "float32",
                            "pool_size": [2, 2],
                            "padding": "valid",
                            "strides": [2, 2],
                            "data_format": "channels_last",
                        }
                    },
                    {
                        "class_name": "Flatten",
                        "config": {
                            "name": "flatten",
                            "trainable": True,
                            "dtype": "float32",
                            "data_format": "channels_last",
                        }
                    },
                    {
                        "class_name": "Dense",
                        "config": {
                            "name": "dense",
                            "trainable": True,
                            "dtype": "float32",
                            "units": 64,
                            "activation": "relu",
                            "use_bias": True,
                        }
                    },
                    {
                        "class_name": "Dropout",
                        "config": {
                            "name": "dropout",
                            "trainable": True,
                            "dtype": "float32",
                            "rate": 0.5,
                        }
                    },
                    {
                        "class_name": "Dense",
                        "config": {
                            "name": "dense_1",
                            "trainable": True,
                            "dtype": "float32",
                            "units": 1,
                            "activation": "sigmoid",
                            "use_bias": True,
                        }
                    },
                ]
            }
        }
    },
    "weightsManifest": weights_manifest
}

with open("keyword_model_tfjs/model.json", "w") as f:
    json.dump(tfjs_model, f)

print("model.json fixed successfully.")