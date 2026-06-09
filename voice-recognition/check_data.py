# check_data.py
import os
import scipy.io.wavfile as wav
import numpy as np

KEYWORD = "sahajyo_koro"

print("=== KEYWORD SAMPLES (first 5) ===")
for fname in sorted(os.listdir(f"data/{KEYWORD}"))[:5]:
    if fname.endswith(".wav"):
        rate, data = wav.read(f"data/{KEYWORD}/{fname}")
        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        print(f"  {fname}: rate={rate}, duration={len(data)/rate:.2f}s, max={np.max(np.abs(data)):.4f}, mean={np.mean(np.abs(data)):.4f}")

print("\n=== NOISE SAMPLES (first 5) ===")
for fname in sorted(os.listdir("data/noise"))[:5]:
    if fname.endswith(".wav"):
        rate, data = wav.read(f"data/noise/{fname}")
        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        print(f"  {fname}: rate={rate}, duration={len(data)/rate:.2f}s, max={np.max(np.abs(data)):.4f}, mean={np.mean(np.abs(data)):.4f}")