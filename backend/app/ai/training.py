import csv
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, f1_score

DATASET_DIR = Path(__file__).parent / "datasets"
MODEL_PATH = Path(__file__).parent / "artifacts" / "maestro_condition_model.joblib"
DATASET_FILES = {
    "Data_Normal.csv": 0,
    "Data_Warning.csv": 1,
    "Data_Kritis.csv": 2,
}
CLASS_NAMES = {0: "NORMAL", 1: "WARNING", 2: "CRITICAL"}
FEATURE_NAMES = ("current", "temperature", "rpm", "vibration")
FEATURE_COLUMN_INDEXES = (2, 3, 5, 6)


def load_training_data(
    dataset_dir: Path = DATASET_DIR,
) -> tuple[np.ndarray, np.ndarray, Counter[int], int]:
    features: list[list[float]] = []
    labels: list[int] = []
    class_counts: Counter[int] = Counter()
    skipped_rows = 0

    for filename, label in DATASET_FILES.items():
        dataset_path = dataset_dir / filename
        if not dataset_path.is_file():
            raise FileNotFoundError(f"Training dataset is missing: {dataset_path}")

        with dataset_path.open("r", encoding="utf-8", newline="") as dataset:
            for row in csv.reader(dataset):
                if len(row) <= max(FEATURE_COLUMN_INDEXES):
                    skipped_rows += 1
                    continue

                try:
                    sensor_values = [
                        float(row[index]) for index in FEATURE_COLUMN_INDEXES
                    ]
                except ValueError:
                    skipped_rows += 1
                    continue

                if not all(math.isfinite(value) for value in sensor_values):
                    skipped_rows += 1
                    continue

                features.append(sensor_values)
                labels.append(label)
                class_counts[label] += 1

    if not features:
        raise ValueError(f"No valid sensor rows found in {dataset_dir}")

    missing_classes = [
        CLASS_NAMES[label]
        for label in CLASS_NAMES
        if class_counts[label] < 2
    ]
    if missing_classes:
        raise ValueError(
            "At least two valid rows are required for each class; "
            f"missing or insufficient: {', '.join(missing_classes)}"
        )

    return (
        np.asarray(features, dtype=np.float64),
        np.asarray(labels, dtype=np.int64),
        class_counts,
        skipped_rows,
    )


def train_model(
    dataset_dir: Path = DATASET_DIR,
    model_path: Path = MODEL_PATH,
) -> dict[str, Any]:
    features, labels, class_counts, skipped_rows = load_training_data(dataset_dir)
    train_indexes: list[int] = []
    test_indexes: list[int] = []
    for label in sorted(CLASS_NAMES):
        class_indexes = np.flatnonzero(labels == label)
        split_index = int(len(class_indexes) * 0.8)
        if split_index == 0 or split_index == len(class_indexes):
            raise ValueError(
                f"Not enough {CLASS_NAMES[label]} rows for validation."
            )
        train_indexes.extend(class_indexes[:split_index].tolist())
        test_indexes.extend(class_indexes[split_index:].tolist())

    train_features = features[train_indexes]
    test_features = features[test_indexes]
    train_labels = labels[train_indexes]
    test_labels = labels[test_indexes]

    validation_model = RandomForestClassifier(
        n_estimators=250,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1,
    )
    validation_model.fit(train_features, train_labels)
    validation_predictions = validation_model.predict(test_features)

    metrics = {
        "accuracy": float(accuracy_score(test_labels, validation_predictions)),
        "macro_f1": float(
            f1_score(test_labels, validation_predictions, average="macro")
        ),
        "classification_report": classification_report(
            test_labels,
            validation_predictions,
            labels=sorted(CLASS_NAMES),
            target_names=[CLASS_NAMES[label] for label in sorted(CLASS_NAMES)],
            output_dict=True,
            zero_division=0,
        ),
    }

    model = RandomForestClassifier(
        n_estimators=250,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(features, labels)

    artifact = {
        "model": model,
        "model_name": "RandomForestClassifier",
        "feature_names": FEATURE_NAMES,
        "class_names": CLASS_NAMES,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
    }
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, model_path)

    return {
        "model_path": model_path,
        "sample_count": len(labels),
        "class_counts": {
            CLASS_NAMES[label]: class_counts[label]
            for label in sorted(CLASS_NAMES)
        },
        "skipped_rows": skipped_rows,
        "metrics": metrics,
    }


def main() -> None:
    report = train_model()
    print(f"Model saved to: {report['model_path']}")
    print(f"Training rows: {report['sample_count']}")
    print(f"Rows skipped: {report['skipped_rows']}")
    print(f"Rows by class: {report['class_counts']}")
    print(f"Chronological holdout accuracy: {report['metrics']['accuracy']:.3f}")
    print(f"Chronological holdout macro F1: {report['metrics']['macro_f1']:.3f}")


if __name__ == "__main__":
    main()
