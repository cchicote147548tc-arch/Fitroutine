from flask import Flask, jsonify, request
from flask_cors import CORS
from pathlib import Path
import json

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent

# Load Apriori association rules
with open(BASE_DIR / "fitroutine_rules.json", encoding="utf-8") as f:
    rules = json.load(f)

# Load exercise names
with open(BASE_DIR / "fitroutine_exercises.json", encoding="utf-8") as f:
    exercises = json.load(f)


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "Welcome to FitRoutine API!",
        "status": "running"
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "total_rules": len(rules),
        "total_exercises": len(exercises)
    })


@app.route("/api/exercises", methods=["GET"])
def get_exercises():
    return jsonify(exercises)


@app.route("/api/recommend", methods=["POST"])
def recommend():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    selected_exercises = data.get("exercises")

    if (
        not isinstance(selected_exercises, list)
        or not selected_exercises
        or not all(isinstance(e, str) for e in selected_exercises)
    ):
        return jsonify({
            "error": "Provide a non-empty list of exercise names."
        }), 400

    selected = {
        exercise.strip().lower()
        for exercise in selected_exercises
        if exercise.strip()
    }

    if not selected:
        return jsonify({
            "error": "Select at least one exercise."
        }), 400

    recommendations = {}

    for rule in rules:
        antecedents = set(rule["antecedents"])
        consequents = set(rule["consequents"])

        if not antecedents.issubset(selected):
            continue

        for exercise in consequents:
            if exercise in selected:
                continue

            candidate = {
                "exercise": exercise,
                "confidence": rule["confidence"],
                "lift": rule["lift"],
                "support": rule["support"]
            }

            previous = recommendations.get(exercise)

            if previous is None or (
                candidate["confidence"], candidate["lift"]
            ) > (
                previous["confidence"], previous["lift"]
            ):
                recommendations[exercise] = candidate

    ranked = sorted(
        recommendations.values(),
        key=lambda x: (
            -x["confidence"],
            -x["lift"],
            x["exercise"]
        )
    )

    return jsonify({
        "selected_exercises": sorted(selected),
        "recommendations": ranked[:5],
        "total_recommendations": min(len(ranked), 5)
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)