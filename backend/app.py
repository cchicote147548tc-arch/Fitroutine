
from flask import Flask, jsonify, request
from flask_cors import CORS
from pathlib import Path
import json
import joblib

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
# Alternative exercise names used in the dataset
EXERCISE_ALIASES = {
    "(chest) decline barbell bench press": "decline bench press (barbell)"
}

# Load supervised muscle-region classifier
muscle_region_model = joblib.load(
    BASE_DIR / "fitroutine_muscle_region_classifier.joblib"
)

# Load classifier information
with open(
    BASE_DIR / "fitroutine_classifier_info.json",
    encoding="utf-8"
) as f:
    classifier_info = json.load(f)
    
def resolve_exercise_name(name):
    normalized = name.strip().lower()
    return EXERCISE_ALIASES.get(normalized, normalized)

# Load Apriori association rules
with open(BASE_DIR / "fitroutine_rules.json", encoding="utf-8") as f:
    rules = json.load(f)

# Load exercise names
with open(BASE_DIR / "fitroutine_exercises.json", encoding="utf-8") as f:
    exercises = json.load(f)

# Load observed exercise pairs (fallback)
with open(BASE_DIR / "fitroutine_exercise_pairs.json", encoding="utf-8") as f:
    exercise_pairs = json.load(f)


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
        "total_exercises": len(exercises),
        "exercises_with_observed_pairs": len(exercise_pairs)
    })


@app.route("/api/exercises", methods=["GET"])
def get_exercises():
    return jsonify(exercises)

EXERCISE_VARIATIONS = {
    "(back) cable pullover": [
        "rope cable pullovers",
        "standing pullover (cable)",
        "lying pullover (cable)",
        "lateral pullover, rope"
    ]
}


@app.route("/api/variations", methods=["POST"])
def get_variations():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON"}), 400

    exercise = data.get("exercise", "")

    if not isinstance(exercise, str) or not exercise.strip():
        return jsonify({"error": "Exercise name is required"}), 400

    name = exercise.strip().lower()

    variations = [
        item
        for item in EXERCISE_VARIATIONS.get(name, [])
        if item in exercise_pairs
    ]

    return jsonify({
        "exercise": name,
        "variations": variations
    })
@app.route("/api/recommend", methods=["POST"])
def recommend():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required."
        }), 400

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
        resolve_exercise_name(exercise)
        for exercise in selected_exercises
        if exercise.strip()
    }

    if not selected:
        return jsonify({
            "error": "Select at least one exercise."
        }), 400


    recommendations = {}

    # =========================================
    # METHOD 1: APRIORI ASSOCIATION RULES
    # =========================================

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
                "support": rule["support"],
                "source": "apriori"
            }

            previous = recommendations.get(exercise)

            if previous is None or (
                candidate["confidence"],
                candidate["lift"]
            ) > (
                previous["confidence"],
                previous["lift"]
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

    # =========================================
    # METHOD 2: OBSERVED EXERCISE PAIRS
    # Fills the remaining slots (up to 5) after Apriori.
    # Partners are ranked by damped cosine similarity, not by raw counts,
    # so very popular exercises do not dominate every list.
    # =========================================

    MAX_RESULTS = 5
    top_recommendations = ranked[:MAX_RESULTS]
    apriori_count = len(top_recommendations)

    if apriori_count < MAX_RESULTS:
        already = selected | {
            item["exercise"] for item in top_recommendations
        }
        pair_scores = {}
        pair_days = {}

        for selected_exercise in selected:
            partners = exercise_pairs.get(selected_exercise, [])

            for partner_data in partners:
                partner = partner_data["exercise"].strip().lower()
                days = partner_data["shared_workout_days"]

                if partner in already:
                    continue

                # For multiple selected exercises, add the scores up.
                score = partner_data.get("similarity", days)
                pair_scores[partner] = pair_scores.get(partner, 0) + score
                pair_days[partner] = pair_days.get(partner, 0) + days

        ranked_pairs = sorted(
            pair_scores.items(),
            key=lambda x: (-x[1], x[0])
        )

        for partner, _ in ranked_pairs[:MAX_RESULTS - apriori_count]:
            top_recommendations.append({
                "exercise": partner,
                "confidence": None,
                "lift": None,
                "support": None,
                "shared_workout_days": pair_days[partner],
                "source": "observed_pairs"
            })

    if not top_recommendations:
        method = "apriori"
    elif apriori_count == 0:
        method = "observed_pairs"
    elif len(top_recommendations) > apriori_count:
        method = "hybrid"
    else:
        method = "apriori"

    # =========================================
    # RETURN RECOMMENDATIONS
    # =========================================

    return jsonify({
        "selected_exercises": sorted(selected),
        "recommendations": top_recommendations,
        "total_recommendations": len(top_recommendations),
        "method": method
    })

@app.route("/api/classify-muscle", methods=["POST"])
def classify_muscle():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    name = data.get("name", "")
    instructions = data.get("instructions", "")

    if not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Exercise name is required."}), 400

    if not isinstance(instructions, str):
        return jsonify({"error": "Instructions must be text."}), 400

    # Match the text format used during model training
    exercise_text = name.strip() + " " + instructions.strip()

    predicted_region = muscle_region_model.predict(
        [exercise_text]
    )[0]

    probabilities = muscle_region_model.predict_proba(
        [exercise_text]
    )[0]

    confidence = float(max(probabilities))

    CONFIDENCE_THRESHOLD = 0.40

    classification_status = (
        "accepted"
        if confidence >= CONFIDENCE_THRESHOLD
        else "uncertain"
    )

    region_probabilities = {
        str(region): round(float(probability), 4)
        for region, probability in zip(
            muscle_region_model.classes_,
            probabilities
        )
    }

    return jsonify({
        "classification_status": classification_status,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "region_probabilities": region_probabilities,
        "exercise": name.strip(),
        "predicted_muscle_region": str(predicted_region),
        "confidence": round(confidence, 4),
        "model": "TF-IDF + Logistic Regression"
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)
