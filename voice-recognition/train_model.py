# train_model.py
import os
import numpy as np
import scipy.io.wavfile as wav
import scipy.signal
import tensorflow as tf
from sklearn.model_selection import train_test_split

SAMPLE_RATE = 16000
DURATION = 2
N_FRAMES = 64
N_MELS = 40
KEYWORD = "sahajyo_koro"
FRAME_SIZE = 512
HOP_SIZE = 256

def load_audio(path):
    rate, data = wav.read(path)
    if len(data.shape) > 1:
        data = data[:, 0]
    if data.dtype == np.int16:
        data = data.astype(np.float32) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float32) / 2147483648.0
    else:
        data = data.astype(np.float32)
    target_len = SAMPLE_RATE * DURATION
    if len(data) < target_len:
        data = np.pad(data, (0, target_len - len(data)))
    else:
        data = data[:target_len]
    if rate != SAMPLE_RATE:
        data = scipy.signal.resample(data, target_len)
    return data.astype(np.float32)

def make_mel_filterbank(n_mels, fft_size, sample_rate):
    mel_min = 2595 * np.log10(1 + 80 / 700)
    mel_max = 2595 * np.log10(1 + sample_rate / 2 / 700)
    mel_points = np.linspace(mel_min, mel_max, n_mels + 2)
    hz_points = 700 * (10 ** (mel_points / 2595) - 1)
    bin_points = np.floor((fft_size + 1) * hz_points / sample_rate).astype(int)
    fb = np.zeros((n_mels, fft_size // 2 + 1), dtype=np.float32)
    for m in range(1, n_mels + 1):
        for k in range(bin_points[m-1], bin_points[m]):
            if bin_points[m] - bin_points[m-1] > 0:
                fb[m-1, k] = (k - bin_points[m-1]) / (bin_points[m] - bin_points[m-1])
        for k in range(bin_points[m], bin_points[m+1]):
            if bin_points[m+1] - bin_points[m] > 0:
                fb[m-1, k] = (bin_points[m+1] - k) / (bin_points[m+1] - bin_points[m])
    return fb

WINDOW = np.hanning(FRAME_SIZE).astype(np.float32)
MEL_FB = make_mel_filterbank(N_MELS, FRAME_SIZE, SAMPLE_RATE)

def extract_features(audio):
    frames = []
    for start in range(0, len(audio) - FRAME_SIZE, HOP_SIZE):
        frame = audio[start:start + FRAME_SIZE] * WINDOW
        power = np.abs(np.fft.rfft(frame)) ** 2
        mel = np.dot(MEL_FB, power)
        log_mel = np.log(mel + 1e-8)
        frames.append(log_mel)
        if len(frames) >= N_FRAMES:
            break
    while len(frames) < N_FRAMES:
        frames.append(np.full(N_MELS, -18.0, dtype=np.float32))
    return np.array(frames[:N_FRAMES], dtype=np.float32)

def load_dataset():
    X, y = [], []

    print("Loading keyword samples...")
    for fname in sorted(os.listdir(f"data/{KEYWORD}")):
        if fname.endswith(".wav"):
            try:
                audio = load_audio(f"data/{KEYWORD}/{fname}")
                X.append(extract_features(audio))
                y.append(1)
            except Exception as e:
                print(f"  Skipping {fname}: {e}")

    print("Loading noise samples...")
    for fname in sorted(os.listdir("data/noise")):
        if fname.endswith(".wav"):
            try:
                audio = load_audio(f"data/noise/{fname}")
                X.append(extract_features(audio))
                y.append(0)
            except Exception as e:
                print(f"  Skipping {fname}: {e}")

    X = np.array(X)[..., np.newaxis]
    y = np.array(y)

    # Print feature stats so browser can match exactly
    print(f"Feature min: {X.min():.4f}, max: {X.max():.4f}, mean: {X.mean():.4f}, std: {X.std():.4f}")
    print(f"Dataset: {len(X)} samples ({y.sum()} keyword, {(y==0).sum()} noise)")
    return X, y

def build_model(input_shape):
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=input_shape),

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
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0005),
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

model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=50,
    batch_size=8,
    callbacks=[
        tf.keras.callbacks.EarlyStopping(
            patience=10, restore_best_weights=True, monitor='val_accuracy'
        ),
        tf.keras.callbacks.ModelCheckpoint(
            "keyword_model.h5", save_best_only=True, monitor='val_accuracy'
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss', factor=0.5, patience=4, min_lr=1e-6
        ),
    ]
)

val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
print(f"\nFinal validation accuracy: {val_acc * 100:.1f}%")
print(f"Feature stats: min={X.min():.4f}, max={X.max():.4f}, mean={X.mean():.4f}, std={X.std():.4f}")
print("Model saved to keyword_model.h5")