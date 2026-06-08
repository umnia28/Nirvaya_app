import tensorflow as tf
import numpy as np
import librosa
import os

SAMPLE_RATE = 16000
DURATION = 2
N_MFCC = 40
KEYWORD = "sahajyo_koro"

model = tf.keras.models.load_model("keyword_model.h5")
print("Model loaded successfully")

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

def representative_data_gen():
    keyword_dir = f"data/{KEYWORD}"
    files = [f for f in os.listdir(keyword_dir) if f.endswith(".wav")][:50]
    for fname in files:
        try:
            audio = load_audio(os.path.join(keyword_dir, fname))
            mfcc = extract_mfcc(audio)
            mfcc = mfcc[np.newaxis, ..., np.newaxis].astype(np.float32)
            yield [mfcc]
        except Exception as e:
            print(f"Skipping {fname}: {e}")

converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.representative_dataset = representative_data_gen
converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
converter.inference_input_type = tf.float32
converter.inference_output_type = tf.float32

print("Converting to TFLite...")
tflite_model = converter.convert()

with open("keyword_model.tflite", "wb") as f:
    f.write(tflite_model)

size_kb = len(tflite_model) / 1024
print(f"Saved keyword_model.tflite ({size_kb:.1f} KB)")
print("Done!")