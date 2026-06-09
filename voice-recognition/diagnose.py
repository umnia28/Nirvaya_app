# diagnose.py
import os
import numpy as np
import scipy.io.wavfile as wav
import scipy.signal
import tensorflow as tf

SAMPLE_RATE = 16000
DURATION = 2
N_MFCC = 40
N_FRAMES = 64
KEYWORD = "sahajyo_koro"
FRAME_SIZE = 512
HOP_SIZE = 256
NUM_MEL = 128

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

def hanning_window(size):
    return np.array([0.5 * (1 - np.cos(2 * np.pi * i / (size - 1))) for i in range(size)], dtype=np.float32)

def make_filterbank(num_filters, fft_size, sample_rate):
    mel_min = 0
    mel_max = 2595 * np.log10(1 + sample_rate / 2 / 700)
    mel_points = np.linspace(mel_min, mel_max, num_filters + 2)
    hz_points = 700 * (10 ** (mel_points / 2595) - 1)
    bin_points = np.floor(fft_size * hz_points / sample_rate).astype(int)
    filterbank = np.zeros((num_filters, fft_size // 2 + 1), dtype=np.float32)
    for m in range(1, num_filters + 1):
        for k in range(fft_size // 2 + 1):
            if bin_points[m-1] <= k <= bin_points[m]:
                filterbank[m-1, k] = (k - bin_points[m-1]) / (bin_points[m] - bin_points[m-1] + 1e-10)
            elif bin_points[m] <= k <= bin_points[m+1]:
                filterbank[m-1, k] = (bin_points[m+1] - k) / (bin_points[m+1] - bin_points[m] + 1e-10)
    return filterbank

WINDOW = hanning_window(FRAME_SIZE)
FILTERBANK = make_filterbank(NUM_MEL, FRAME_SIZE, SAMPLE_RATE)

def extract_features(audio):
    frames = []
    for start in range(0, len(audio) - FRAME_SIZE, HOP_SIZE):
        frame = audio[start:start + FRAME_SIZE] * WINDOW
        spectrum = np.fft.rfft(frame)
        power = np.abs(spectrum) ** 2
        mel_energy = np.log(FILTERBANK @ power + 1e-6)
        mfcc = np.array([
            np.sum(mel_energy * np.cos(np.pi * i * (2 * np.arange(NUM_MEL) + 1) / (2 * NUM_MEL)))
            for i in range(N_MFCC)
        ], dtype=np.float32)
        frames.append(mfcc)
        if len(frames) >= N_FRAMES:
            break
    while len(frames) < N_FRAMES:
        frames.append(np.zeros(N_MFCC, dtype=np.float32))
    result = np.array(frames[:N_FRAMES], dtype=np.float32)
    mean = result.mean()
    std = result.std() + 1e-6
    result = (result - mean) / std
    return result

# Load model
model = tf.keras.models.load_model("keyword_model.h5")

# Test on keyword samples
print("\n=== KEYWORD SAMPLES ===")
keyword_files = [f for f in os.listdir(f"data/{KEYWORD}") if f.endswith(".wav")][:5]
for fname in keyword_files:
    audio = load_audio(f"data/{KEYWORD}/{fname}")
    features = extract_features(audio)[np.newaxis, ..., np.newaxis]
    score = model.predict(features, verbose=0)[0][0]
    print(f"  {fname}: score={score:.4f}")

# Test on noise samples
print("\n=== NOISE SAMPLES ===")
noise_files = [f for f in os.listdir("data/noise") if f.endswith(".wav")][:5]
for fname in noise_files:
    audio = load_audio(f"data/noise/{fname}")
    features = extract_features(audio)[np.newaxis, ..., np.newaxis]
    score = model.predict(features, verbose=0)[0][0]
    print(f"  {fname}: score={score:.4f}")