import os
import numpy as np
import librosa
import tensorflow as tf
from sklearn.model_selection import train_test_split

SAMPLE_RATE = 16000
DURATION = 2
N_MFCC = 40
KEYWORD = "sahajyo_koro"

def load_audio(path):
    audio, _ = librosa.load(path, sr=SAMPLE_RATE, duration=DURATION, mono=True)
    target_len = SAMPLE_RATE * DURATION
    if len(audio) < target_len:
        audio = np.pad(audio, (0, target_len - len(audio)))
    else:
        audio = audio[:target_len]
    return audio

def extract_mfcc(audio):
    mfcc = librosa.feature.mfcc(y=audio, sr=SAMPLE_RATE, n_mfcc=N_MFCC)
    mfcc = librosa.util.fix_length(mfcc, size=64, axis=1)
    return mfcc.T  # (64, 40)

def load_dataset():
    X, y = [], []

    print("Loading keyword samples...")
    keyword_dir = f"data/{KEYWORD}"
    for fname in sorted(os.listdir(keyword_dir)):
        if fname.endswith(".wav"):
            try:
                audio = load_audio(os.path.join(keyword_dir, fname))
                X.append(extract_mfcc(audio))
                y.append(1)
            except Exception as e:
                print(f"  Skipping {fname}: {e}")

    print("Loading noise samples...")
    noise_dir = "data/noise"
    for fname in sorted(os.listdir(noise_dir)):
        if fname.endswith(".wav"):
            try:
                audio = load_audio(os.path.join(noise_dir, fname))
                X.append(extract_mfcc(audio))
                y.append(0)
            except Exception as e:
                print(f"  Skipping {fname}: {e}")

    X = np.array(X)[..., np.newaxis]  # (N, 64, 40, 1)
    y = np.array(y)
    print(f"\nDataset loaded: {len(X)} samples ({y.sum()} keyword, {(y==0).sum()} noise)")
    return X, y

def build_model(input_shape):
    model = tf.keras.Sequential([
        tf.keras.layers.Conv2D(32, (3, 3), activation='relu', input_shape=input_shape),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Conv2D(64, (3, 3), activation='relu'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Conv2D(128, (3, 3), activation='relu'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Flatten(),
        tf.keras.layers.Dense(128, activation='relu'),
        tf.keras.layers.Dropout(0.4),
        tf.keras.layers.Dense(64, activation='relu'),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(1, activation='sigmoid'),
    ])

    model.compile(
        optimizer='adam',
        loss='binary_crossentropy',
        metrics=['accuracy']
    )
    return model

X, y = load_dataset()

X_train, X_val, y_train, y_val = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"Train: {len(X_train)}, Val: {len(X_val)}")

model = build_model(X_train.shape[1:])
model.summary()

callbacks = [
    tf.keras.callbacks.EarlyStopping(
        patience=8,
        restore_best_weights=True,
        monitor='val_accuracy'
    ),
    tf.keras.callbacks.ModelCheckpoint(
        "keyword_model.h5",
        save_best_only=True,
        monitor='val_accuracy'
    ),
    tf.keras.callbacks.ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.5,
        patience=3,
        min_lr=1e-6
    )
]

print("\nStarting training...\n")
history = model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=50,
    batch_size=16,
    callbacks=callbacks
)

val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
print(f"\nFinal validation accuracy: {val_acc * 100:.1f}%")
print("Model saved to keyword_model.h5")