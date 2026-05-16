import json
import os
import pickle
import sys

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


try:
    import numpy as np
    from tensorflow.keras.models import load_model
    from tensorflow.keras.preprocessing.sequence import pad_sequences
except Exception as exc:
    fail(
        "Local ML dependencies are missing. Install TensorFlow/Keras for Python, "
        f"then restart the backend. Details: {exc}"
    )


MODEL_PATH = os.environ.get("MODEL_PATH")
TOKENIZER_PATH = os.environ.get("TOKENIZER_PATH")
MODEL_LABELS = [
    label.strip()
    for label in os.environ.get(
        "MODEL_LABELS",
        "anxious,depressed,lonely,overwhelmed,panicked"
    ).split(",")
    if label.strip()
]
STRESS_LABELS = [
    label.strip()
    for label in os.environ.get("STRESS_LABELS", "low,medium,high").split(",")
    if label.strip()
]


if not MODEL_PATH or not os.path.exists(MODEL_PATH):
    fail(f"Model file not found: {MODEL_PATH}")

if not TOKENIZER_PATH or not os.path.exists(TOKENIZER_PATH):
    fail(f"Tokenizer file not found: {TOKENIZER_PATH}")


def model_max_length(model):
    configured = os.environ.get("MODEL_MAX_LEN")
    if configured:
        return int(configured)

    input_shape = getattr(model, "input_shape", None)
    if isinstance(input_shape, list):
        input_shape = input_shape[0]

    if input_shape and len(input_shape) >= 2 and input_shape[1]:
        return int(input_shape[1])

    return 100


def normalize_vector(raw_prediction, labels):
    values = np.asarray(raw_prediction).reshape(-1).astype(float)
    if values.size == 0:
        return "unknown", 0.0, values

    if values.size == 1:
        score = float(values[0])
        label = "high" if score >= 0.66 else "medium" if score >= 0.33 else "low"
        return label, score, values

    index = int(np.argmax(values))
    label = labels[index] if index < len(labels) else f"class_{index}"
    confidence = float(values[index])
    return label, confidence, values


def stress_percent_from_vector(stress_values, stress_label, stress_confidence):
    values = np.asarray(stress_values).reshape(-1).astype(float)
    if values.size == 3:
        anchors = np.array([15.0, 50.0, 85.0])
        return round(float(np.dot(values, anchors)), 2)

    if stress_label == "high":
        return round(max(66.0, stress_confidence * 100.0), 2)
    if stress_label == "medium":
        return round(max(33.0, min(65.0, stress_confidence * 100.0)), 2)
    return round(min(32.0, stress_confidence * 100.0), 2)


def split_predictions(prediction, output_names):
    if not isinstance(prediction, (list, tuple)):
        label, confidence, values = normalize_vector(prediction, MODEL_LABELS)
        return ("medium", 50.0, 0.5), (label, confidence, values)

    outputs = {name: prediction[index] for index, name in enumerate(output_names or [])}
    stress_prediction = outputs["stress_output"] if "stress_output" in outputs else prediction[0]
    emotion_prediction = outputs["emotion_output"] if "emotion_output" in outputs else prediction[-1]

    stress_label, stress_confidence, stress_values = normalize_vector(stress_prediction, STRESS_LABELS)
    emotion_label, emotion_confidence, emotion_values = normalize_vector(emotion_prediction, MODEL_LABELS)

    return (
        (stress_label, stress_percent_from_vector(stress_values, stress_label, stress_confidence), stress_confidence),
        (emotion_label, emotion_confidence, emotion_values)
    )


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    text = str(payload.get("text", "")).strip()
    if not text:
        fail("Text is required")

    with open(TOKENIZER_PATH, "rb") as file:
        tokenizer = pickle.load(file)

    model = load_model(MODEL_PATH)
    max_len = model_max_length(model)
    sequence = tokenizer.texts_to_sequences([text])
    padded = pad_sequences(sequence, maxlen=max_len, padding="post", truncating="post")
    prediction = model.predict(padded, verbose=0)

    (stress_label, stress_percent, stress_confidence), (emotion_label, emotion_confidence, _emotion_values) = split_predictions(
        prediction,
        getattr(model, "output_names", [])
    )

    response = {
        "predicted_stress": {
            "label": stress_label,
            "confidence": round(stress_confidence, 4)
        },
        "predicted_emotion": {
            "label": emotion_label,
            "confidence": round(emotion_confidence, 4)
        },
        "stress_level": {
            "stress_level": stress_percent
        },
        "analysis": (
            "Saran: Ambil jeda singkat, tarik napas perlahan, dan tuliskan satu langkah kecil "
            "yang bisa dilakukan setelah ini."
        ),
        "recommended_videos": {
            "recommendations": []
        }
    }

    print(json.dumps(response))


if __name__ == "__main__":
    main()
