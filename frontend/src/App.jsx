
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:5000";

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
        <p>Apriori-Based Exercise Recommendation System</p>
      </header>

      <main className="container">
        <section className="hero">
          <span className="eyebrow">YOUR WORKOUT COMPANION</span>
          <h1>Find exercises that work together.</h1>
          <p>
            Select exercises and discover related movements based on
            association patterns found in real workout programs.
          </p>
        </section>

        <section className="panel">
          <h2>1. Choose your exercises</h2>
          <p className="muted">
            Search and select one or more exercises to get started.
          </p>

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
            {loading ? "Finding exercises..." : "Get Recommendations →"}
          </button>
        </section>

        <section className="panel">
          <h2>2. Your recommendations</h2>
          <p className="muted">
            Recommendations are ranked using association-rule confidence.
          </p>

          {error && <p className="error">{error}</p>}

          {recommendations.length > 0 ? (
            <div className="recommendation-list">
              {recommendations.map((item, index) => (
                <div className="recommendation" key={item.exercise}>
                  <div className="recommendation-info">
                    <span className="rank">#{index + 1}</span>
                    <div>
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
