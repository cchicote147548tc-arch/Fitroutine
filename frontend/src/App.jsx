
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:5000";

// Use exercise-specific reference photos from the public Free Exercise DB.
// The database is downloaded once and each recommendation is matched by name;
// this avoids showing unrelated/random photos for different exercises.
const EXERCISE_DB_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const EXERCISE_IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
let exerciseDatabasePromise;

function normalizeExerciseName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^\([^)]*\)\s*/, "") // Remove dataset labels such as "(legs)".
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getExerciseDatabase() {
  if (!exerciseDatabasePromise) {
    exerciseDatabasePromise = fetch(EXERCISE_DB_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Exercise image database unavailable");
        return response.json();
      })
      .catch(() => []);
  }
  return exerciseDatabasePromise;
}

function findExerciseImage(exercise, database) {
  if (!Array.isArray(database) || database.length === 0) return "";

  const wanted = normalizeExerciseName(exercise);
  const entries = database.filter((entry) => Array.isArray(entry.images) && entry.images.length);
  const exact = entries.find((entry) => normalizeExerciseName(entry.name) === wanted);
  if (exact) return EXERCISE_IMAGE_BASE + exact.images[0];

  // Use the closest exercise-name match when datasets use slightly different names.
  const wantedTokens = wanted.split(" ").filter((token) => token.length > 1);
  let bestEntry = null;
  let bestScore = 0;
  for (const entry of entries) {
    const candidate = normalizeExerciseName(entry.name);
    const candidateTokens = candidate.split(" ").filter((token) => token.length > 1);
    const shared = wantedTokens.filter((token) => candidateTokens.includes(token)).length;
    const score = shared / Math.max(wantedTokens.length, candidateTokens.length, 1);
    const relatedPhrase = candidate.includes(wanted) || wanted.includes(candidate);
    const finalScore = relatedPhrase ? Math.max(score, 0.75) : score;
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestEntry = entry;
    }
  }

  // Avoid displaying a clearly unrelated exercise image.
  if (!bestEntry || bestScore < 0.45) return "";
  return EXERCISE_IMAGE_BASE + bestEntry.images[0];
}

function ExerciseImage({ exercise }) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    getExerciseDatabase().then((database) => {
      if (!cancelled) setImageUrl(findExerciseImage(exercise, database));
    });
    return () => { cancelled = true; };
  }, [exercise]);

  if (!imageUrl) {
    return (
      <div className="exercise-image exercise-image-placeholder" role="img" aria-label={`${exercise} image unavailable`}>
        <span>Workout</span>
      </div>
    );
  }

  return (
    <img
      className="exercise-image"
      src={imageUrl}
      alt={`${exercise} workout demonstration`}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  );
}

function App() {
  const [exercises, setExercises] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/exercises`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load exercises.");
        }
        return response.json();
      })
      .then((data) => setExercises(data))
      .catch(() => setError("Cannot connect to Flask. Check that your backend is running."));
  }, []);

  const filteredExercises = search.trim()
    ? exercises
        .filter(
          (exercise) =>
            exercise.toLowerCase().includes(search.toLowerCase()) &&
            !selected.includes(exercise)
        )
        .slice(0, 10)
    : [];

  function addExercise(exercise) {
    setSelected((previous) => [...previous, exercise]);
    setSearch("");
    setRecommendations([]);
    setHasSearched(false);
  }

  function removeExercise(exercise) {
    setSelected((previous) =>
      previous.filter((item) => item !== exercise)
    );
    setRecommendations([]);
    setHasSearched(false);
  }

  async function getRecommendations() {
    if (selected.length === 0) {
      setError("Please select at least one exercise.");
      return;
    }

    setLoading(true);
    setError("");
    setHasSearched(false);

    try {
      const response = await fetch(`${API_URL}/api/recommend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ exercises: selected }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Recommendation request failed.");
      }

      setRecommendations(data.recommendations);
      setHasSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">Fit<span>Routine</span></div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>Find exercises that work together.</h1>
        </section>

        <section className="panel">
          <h2>Choose exercise</h2>

          <div className="search-area">
            <input
              type="text"
              placeholder="Search exercises (e.g. leg curl)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {filteredExercises.length > 0 && (
              <div className="search-results">
                {filteredExercises.map((exercise) => (
                  <button
                    type="button"
                    key={exercise}
                    onClick={() => addExercise(exercise)}
                  >
                    + {exercise}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="selected">
            {selected.length === 0 ? (
              <p className="muted">No exercises selected yet.</p>
            ) : (
              selected.map((exercise) => (
                <button
                  type="button"
                  className="chip"
                  key={exercise}
                  onClick={() => removeExercise(exercise)}
                  title="Remove exercise"
                >
                  {exercise} ×
                </button>
              ))
            )}
          </div>

          <button
            className="primary-button"
            onClick={getRecommendations}
            disabled={loading || selected.length === 0}
          >
            {loading ? "Finding exercises..." : "Get Recommendations"}
          </button>
        </section>

        <section className="panel">
          <h2>Exercise Recommendations</h2>

          {error && <p className="error">{error}</p>}

          {recommendations.length > 0 ? (
            <div className="recommendation-list">
              {recommendations.map((item, index) => (
                <div className="recommendation" key={item.exercise}>
                  <div className="recommendation-info">
                    <span className="rank">#{index + 1}</span>
                    <ExerciseImage exercise={item.exercise} />
                    <div className="exercise-title">
                      <h3>{item.exercise}</h3>
                      <p>
                        Lift: {item.lift.toFixed(2)} · Support:{" "}
                        {(item.support * 100).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                  <div className="confidence">
                    {(item.confidence * 100).toFixed(1)}%
                    <small>confidence</small>
                  </div>
                </div>
              ))}
            </div>
          ) : hasSearched ? (
            <p className="muted">
              No matching association rules were found. Try selecting
              different exercises.
            </p>
          ) : (
            <p className="muted">
              Your recommended exercises will appear here.
            </p>
          )}
        </section>

        <footer>
          FitRoutine uses Apriori association rules to identify exercise
          co-occurrence. Recommendations do not establish exercise safety
          or effectiveness.
        </footer>
      </main>
    </div>
  );
}

export default App;
