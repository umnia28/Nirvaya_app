import sounddevice as sd
import numpy as np
import scipy.io.wavfile as wav
import os
import time

SAMPLE_RATE = 16000
DURATION = 2          # 2 seconds — enough for a two-word phrase
KEYWORD = "sahajyo_koro"
OUTPUT_DIR = f"data/{KEYWORD}"
NOISE_DIR = "data/noise"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(NOISE_DIR, exist_ok=True)

def record_sample(filename, label):
    print(f"  Recording in 1s... say '{label}'")
    time.sleep(1)
    audio = sd.rec(int(DURATION * SAMPLE_RATE), samplerate=SAMPLE_RATE,
                   channels=1, dtype='int16')
    sd.wait()
    wav.write(filename, SAMPLE_RATE, audio)
    print(f"  Saved: {filename}\n")

def record_keyword_samples():
    print("\n=== KEYWORD RECORDING: 'sahajyo koro' ===")
    print("Say the full phrase naturally each time.")
    print("Vary your volume, speed, and distance from mic.\n")

    existing = len(os.listdir(OUTPUT_DIR))
    i = existing

    while True:
        inp = input(f"[{i+1}] Press Enter to record (or type 'q' to stop): ")
        if inp.strip().lower() == 'q':
            break
        record_sample(f"{OUTPUT_DIR}/{i:04d}.wav", "sahajyo koro")
        i += 1

    print(f"\nDone. {i} keyword samples recorded.")

def record_noise_samples():
    print("\n=== NOISE RECORDING ===")
    print("Stay silent, talk normally, or make ambient noise.")
    print("Do NOT say 'sahajyo koro' during this session.\n")

    existing = len(os.listdir(NOISE_DIR))
    i = existing

    while True:
        inp = input(f"[{i+1}] Press Enter to record noise (or type 'q' to stop): ")
        if inp.strip().lower() == 'q':
            break
        record_sample(f"{NOISE_DIR}/{i:04d}.wav", "background noise")
        i += 1

    print(f"\nDone. {i} noise samples recorded.")

print("What do you want to record?")
print("1 - Keyword samples (sahajyo koro)")
print("2 - Noise samples")
choice = input("Enter 1 or 2: ").strip()

if choice == "1":
    record_keyword_samples()
elif choice == "2":
    record_noise_samples()
else:
    print("Invalid choice.")