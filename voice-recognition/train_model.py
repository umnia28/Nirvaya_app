import os
import numpy as np
import scipy.io.wavfile as wav
import scipy.signal
import tensorflow as tf
from sklearn.model_selection import train_test_split

SAMPLE_RATE = 16000
DURATION = 2
N_MFCC = 40
N_FRAMES = 64
KEYWORD = "sahajyo_koro"

def load_audio(path):
    rate, data = wav.read(path)
    if len(data.shape) > 1:
        data = data[:, 0]
    if data.dtype == np.int16:
        data = data.astype(np.float32) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float32) / 2147483648.0
    target_len = SAMPLE_RATE * DURATION
    if len(data) < target_len:
        data = np.pad(data, (0, target_len - len(data)))
    else:
        data = data[:target_len]
    if rate != SAMPLE_RATE:
        data = scipy.signal.resample(data, SAMPLE_RATE * DURATION)
    return data.astype(np.float32)

def hanning_window(size):
    return 0.5 * (1 - np.cos(2 * np.pi * np.arange(size) / (size - 1)))

def mel_filterbank(num_filters, fft_size, sample_rate):
    mel_min = 0
    mel_max = 2595 * np.log10(1 + sample_rate / 2 / 700)
    mel_points = np.linspace(mel_min, mel_max, num_filters + 2)
    hz_points = 700 * (10 ** (mel_points / 2595) - 1)
    bin_points = np.floor(fft_size * hz_points / sample_rate).astype(int)
    filterbank = np.zeros((num_filters, fft_size // 2 + 1))
    for m in range(1, num_filters + 1):
        for k in range(fft_size // 2 + 1):
            if bin_points[m-1] <= k <= bin_points[m]:
                filterbank[m-1, k] = (k - bin_points[m-1]) / (bin_points[m] - bin_points[m-1] + 1e-10)
            elif bin_points[m] <= k <= bin_points[m+1]:
                filterbank[m-1, k] = (bin_points[m+1] - k) / (bin_points[m+1] - bin_points[m] + 1e-10)
    return filterbank

FRAME_SIZE = 512
HOP_SIZE = 256
NUM_MEL = 128
WINDOW = hanning_window(FRAME_SIZE)
FILTERBANK = mel_filterbank(NUM_MEL, FRAME_SIZE, SAMPLE_RATE)

def extract_features(audio):
    frames = []
    for start in range(0, len(audio) - FRAME_SIZE, HOP_SIZE):
        frame = audio[start:start + FRAME_SIZE] * WINDOW
        spectrum = np.fft.rfft(frame)
        power = np.abs(spectrum) ** 2
        mel_energy = np.log(FILTERBANK @ power + 1e-6)
        mfcc = np.zeros(N_MFCC)
        for i in range(N_MFCC):
            mfcc[i] = np.sum(mel_energy * np.cos(np.pi * i * (2 * np.arange(NUM_MEL) + 1) / (2 * NUM_MEL)))
        frames.append(mfcc)
        if len(frames) >= N_FRAMES:
            break
    while len(frames) < N_FRAMES:
        frames.append(np.zeros(N_MFCC))
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
    print(f"Dataset: {len(X)} samples ({y.sum()} keyword, {(y==0).sum()} noise)")
    return X, y

def build_model(input_shape):
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=input_shape),
        tf.keras.layers.Conv2D(32, (3, 3), activation='relu'),
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
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model

X, y = load_dataset()
X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

model = build_model(X_train.shape[1:])
model.summary()

model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=50,
    batch_size=16,
    callbacks=[
        tf.keras.callbacks.EarlyStopping(patience=8, restore_best_weights=True, monitor='val_accuracy'),
        tf.keras.callbacks.ModelCheckpoint("keyword_model.h5", save_best_only=True, monitor='val_accuracy'),
        tf.keras.callbacks.ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=3, min_lr=1e-6),
    ]
)

val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
print(f"\nFinal validation accuracy: {val_acc * 100:.1f}%")
print("Model saved to keyword_model.h5")