import tensorflow as tf
import json, os, numpy as np

print("TF version:", tf.__version__)
print("Loading model...")

model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(64, 40, 1)),

    tf.keras.layers.Conv2D(16, (3, 3), activation='relu', padding='same'),
    tf.keras.layers.MaxPooling2D((2, 2)),

    tf.keras.layers.Conv2D(32, (3, 3), activation='relu', padding='same'),
    tf.keras.layers.MaxPooling2D((2, 2)),

    tf.keras.layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
    tf.keras.layers.MaxPooling2D((2, 2)),

    tf.keras.layers.Flatten(),
    tf.keras.layers.Dense(64, activation='relu'),
    tf.keras.layers.Dropout(0.5),
    tf.keras.layers.Dense(1, activation='sigmoid'),
])

model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
model.load_weights("keyword_model.h5")
print("Weights loaded successfully.")

os.makedirs("keyword_model_tfjs", exist_ok=True)

weight_data = b""
weight_manifest = []

for layer in model.layers:
    weights = layer.get_weights()
    for i, w in enumerate(weights):
        w_flat = w.flatten().astype(np.float32)
        weight_data += w_flat.tobytes()
        weight_manifest.append({
            "name": f"{layer.name}/weight_{i}",
            "shape": list(w.shape),
            "dtype": "float32",
            "byteLength": w_flat.nbytes
        })

with open("keyword_model_tfjs/group1-shard1of1.bin", "wb") as f:
    f.write(weight_data)

model_config = json.loads(model.to_json())
manifest = {
    "format": "layers-model",
    "generatedBy": "manual",
    "convertedBy": "manual",
    "modelTopology": model_config,
    "weightsManifest": [{
        "paths": ["group1-shard1of1.bin"],
        "weights": weight_manifest
    }]
}

with open("keyword_model_tfjs/model.json", "w") as f:
    json.dump(manifest, f)

size_kb = len(weight_data) / 1024
print(f"Done! Files created:")
print(f"  keyword_model_tfjs/model.json")
print(f"  keyword_model_tfjs/group1-shard1of1.bin ({size_kb:.1f} KB)")