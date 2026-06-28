from pathlib import Path
import json
import shutil

import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix


BASE_DIR = Path(__file__).resolve().parent.parent

DATA_PATH = BASE_DIR / "data" / "processed" / "area_risk_training_data.csv"

MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = MODEL_DIR / "risk_model.pkl"
META_PATH = MODEL_DIR / "risk_model_meta.json"

# Useful if your FastAPI loads: joblib.load("risk_model.pkl")
ROOT_MODEL_COPY_PATH = BASE_DIR / "risk_model.pkl"


FEATURE_COLUMNS = [
    "latitude",
    "longitude",
    "district",
    "hour",
    "day_of_week",
]

TARGET_COLUMN = "risk_level"

CLASS_LABELS = ["low", "medium", "high"]


def clean_training_data(df):
    df = df.copy()

    required_columns = FEATURE_COLUMNS + [TARGET_COLUMN]

    missing = [col for col in required_columns if col not in df.columns]

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df["hour"] = pd.to_numeric(df["hour"], errors="coerce")
    df["day_of_week"] = pd.to_numeric(df["day_of_week"], errors="coerce")

    df["district"] = df["district"].astype(str).str.strip()
    df["risk_level"] = df["risk_level"].astype(str).str.strip().str.lower()

    df = df.dropna(subset=required_columns).copy()

    df = df[
        df["latitude"].between(-90, 90)
        & df["longitude"].between(-180, 180)
    ].copy()

    df = df[df["hour"].between(0, 23)].copy()
    df = df[df["day_of_week"].between(0, 6)].copy()

    df = df[df["risk_level"].isin(CLASS_LABELS)].copy()

    if "sample_weight" in df.columns:
        df["sample_weight"] = pd.to_numeric(df["sample_weight"], errors="coerce")
        df["sample_weight"] = df["sample_weight"].fillna(1).clip(1, 10)
    else:
        df["sample_weight"] = 1.0

    if df["risk_level"].nunique() < 2:
        raise ValueError("Need at least 2 risk classes to train the model.")

    return df


def balance_training_only(train_df):
    """
    Balance only the training split.
    Do not balance before train-test split.
    """

    print("\nTraining class counts before balancing:")
    print(train_df["risk_level"].value_counts())

    max_count = train_df["risk_level"].value_counts().max()

    parts = []

    for label, group in train_df.groupby("risk_level"):
        sampled = group.sample(
            n=max_count,
            replace=True,
            random_state=42,
        )
        parts.append(sampled)

    balanced = pd.concat(parts, ignore_index=True)
    balanced = balanced.sample(frac=1, random_state=42).reset_index(drop=True)

    print("\nTraining class counts after balancing:")
    print(balanced["risk_level"].value_counts())

    return balanced


def save_metadata(model, accuracy):
    meta = {
        "feature_columns": FEATURE_COLUMNS,
        "target_column": TARGET_COLUMN,
        "class_labels": CLASS_LABELS,
        "model_classes": list(model.classes_),
        "accuracy": float(accuracy),
        "note": (
            "Environmental features are baked into the generated risk_level labels. "
            "The model input remains latitude, longitude, district, hour, day_of_week "
            "so the FastAPI does not need to change."
        ),
    }

    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)


def main():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Missing training data: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)

    print("Raw rows:", len(df))

    df = clean_training_data(df)

    print("Clean rows:", len(df))

    print("\nOverall class counts:")
    print(df["risk_level"].value_counts())

    print("\nHour distribution:")
    print(df["hour"].value_counts().sort_index())

    print("\nDay-of-week distribution:")
    print(df["day_of_week"].value_counts().sort_index())

    if "risk_score" in df.columns:
        print("\nRisk score summary:")
        print(df["risk_score"].describe())

    if "incident_risk_score" in df.columns:
        print("\nIncident risk score summary:")
        print(df["incident_risk_score"].describe())

    if "environmental_risk_score" in df.columns:
        print("\nEnvironmental risk score summary:")
        print(df["environmental_risk_score"].describe())

    train_df, test_df = train_test_split(
        df,
        test_size=0.2,
        random_state=42,
        stratify=df["risk_level"],
    )

    train_df = balance_training_only(train_df)

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[TARGET_COLUMN]
    weight_train = train_df["sample_weight"]

    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df[TARGET_COLUMN]

    numeric_features = [
        "latitude",
        "longitude",
        "hour",
        "day_of_week",
    ]

    categorical_features = [
        "district",
    ]

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", "passthrough", numeric_features),
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
        ]
    )

    model = RandomForestClassifier(
        n_estimators=500,
        max_depth=None,
        min_samples_split=2,
        min_samples_leaf=1,
        random_state=42,
        class_weight=None,
        n_jobs=-1,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )

    pipeline.fit(
        X_train,
        y_train,
        model__sample_weight=weight_train,
    )

    y_pred = pipeline.predict(X_test)

    accuracy = accuracy_score(y_test, y_pred)

    print("\nAccuracy:")
    print(accuracy)

    print("\nClassification report:")
    print(classification_report(y_test, y_pred, labels=CLASS_LABELS))

    print("\nConfusion matrix:")
    print(confusion_matrix(y_test, y_pred, labels=CLASS_LABELS))

    print("\nConfusion matrix labels:")
    print(CLASS_LABELS)

    print("\nModel classes:")
    print(list(pipeline.classes_))

    joblib.dump(pipeline, MODEL_PATH)
    shutil.copyfile(MODEL_PATH, ROOT_MODEL_COPY_PATH)

    save_metadata(pipeline, accuracy)

    print("\nModel saved to:")
    print(MODEL_PATH)

    print("\nModel also copied to:")
    print(ROOT_MODEL_COPY_PATH)

    print("\nMetadata saved to:")
    print(META_PATH)

    print("\nTraining feature order:")
    print(FEATURE_COLUMNS)


if __name__ == "__main__":
    main()