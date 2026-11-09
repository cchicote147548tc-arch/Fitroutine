

    import { useEffect, useState } from "react";

    import "./App.css";

    const API_URL = "http://127.0.0.1:5000";

    const EXERCISE_DB_URL =

      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

    const EXERCISE_IMAGE_BASE =

      "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

    let exerciseDatabasePromise;

    function normalizeExerciseName(value) {

      return String(value || "")

        .toLowerCase()

        .replace(/^\([^)]*\)\s*/, "")

        .replace(/&/g, " and ")

        .replace(/[^a-z0-9]+/g, " ")

        .trim()

        .replace(/\s+/g, " ");

    }

    function getExerciseDatabase() {

      if (!exerciseDatabasePromise) {

        exerciseDatabasePromise = fetch(EXERCISE_DB_URL)

          .then((response) => {

            if (!response.ok) {

              throw new Error("Exercise image database unavailable");

            }

            return response.json();

          })

          .catch(() => []);

      }

      return exerciseDatabasePromise;

    }

    function findExerciseDetails(exercise, database) {

      if (!Array.isArray(database)) {

        return null;

      }

      const wanted = normalizeExerciseName(exercise);

      // First, try an exact match

      const exactMatch = database.find(

        (entry) => normalizeExerciseName(entry.name) === wanted

      );

      if (exactMatch) {

        return {

          name: exactMatch.name,

          instructions: Array.isArray(exactMatch.instructions)

            ? exactMatch.instructions.join(" ")

            : "",

        };

      }

      // Match common equipment-name variations

      const exerciseAliases = {

        "bench press barbell": "barbell bench press",

        "incline bench press barbell": "barbell incline bench press",

        "decline bench press barbell": "decline barbell bench press",

        "chest fly cable": "cable crossover", "hammer bar curl": "hammer curls", "barbell rdl": "romanian deadlift",  "barbell row": "bent over barbell row", "close grip lat pulldown": "close grip front lat pulldown",

"close grip cable row": "seated cable rows",

"single arm supported dumbbell row": "one arm dumbbell row",

      };

    const alias = exerciseAliases[wanted];

  if (!alias) {

    return null;

  }

  // First, look for an exact alias match

  const exactAliasMatch = database.find(

    (entry) => normalizeExerciseName(entry.name) === alias

  );

  // If no exact match exists, look for variations

  const matches = exactAliasMatch

    ? [exactAliasMatch]

    : database.filter((entry) =>

        normalizeExerciseName(entry.name).startsWith(alias)

      );

  // Avoid guessing when multiple exercises match

  if (matches.length !== 1) {

    return null;

  }

      const match = matches[0];

      return {

        name: match.name,

        instructions: Array.isArray(match.instructions)

          ? match.instructions.join(" ")

          : "",

      };

    }

async function classifyExerciseMuscle(exercise) {
  const database = await getExerciseDatabase();
  const details = findExerciseDetails(exercise, database);

  // Classify by exercise name when the external database has no match.
  const name = details ? details.name : exercise;
  const instructions = details ? details.instructions : "";

  const response = await fetch(`${API_URL}/api/classify-muscle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, instructions }),
  });

  if (!response.ok) {
    throw new Error("Unable to classify exercise muscle region.");
  }

  const data = await response.json();
  const region = data.predicted_muscle_region;

  if (!region) return null;

  return data.classification_status === "uncertain"
    ? `${region} (Low confidence)`
    : region;
}

function findExerciseImage(exercise, database) {

      if (!Array.isArray(database) || database.length === 0) {

        return "";

      }

      const wanted = normalizeExerciseName(exercise);

      const entries = database.filter(

        (entry) => Array.isArray(entry.images) && entry.images.length

      );

      const exact = entries.find(

        (entry) => normalizeExerciseName(entry.name) === wanted

      );

      if (exact) {

        return EXERCISE_IMAGE_BASE + exact.images[0];

      }

      const wantedTokens = wanted

        .split(" ")

        .filter((token) => token.length > 1);

      let bestEntry = null;

      let bestScore = 0;

      for (const entry of entries) {

        const candidate = normalizeExerciseName(entry.name);

        const candidateTokens = candidate

          .split(" ")

          .filter((token) => token.length > 1);

        const shared = wantedTokens.filter((token) =>

          candidateTokens.includes(token)

        ).length;

        const score =

          shared /

          Math.max(wantedTokens.length, candidateTokens.length, 1);

        const relatedPhrase =

          candidate.includes(wanted) || wanted.includes(candidate);

        const finalScore = relatedPhrase

          ? Math.max(score, 0.75)

          : score;

        if (finalScore > bestScore) {

          bestScore = finalScore;

          bestEntry = entry;

        }

      }

      if (!bestEntry || bestScore < 0.45) {

        return "";

      }

      return EXERCISE_IMAGE_BASE + bestEntry.images[0];

    }

    function ExerciseImage({ exercise }) {

      const [imageUrl, setImageUrl] = useState("");

      const [imageFailed, setImageFailed] = useState(false);

      useEffect(() => {

        let cancelled = false;

        getExerciseDatabase().then((database) => {

          if (!cancelled) {

            setImageUrl(findExerciseImage(exercise, database));

          }

        });

        return () => {

          cancelled = true;

        };

      }, [exercise]);

      if (!imageUrl || imageFailed) {

        return (

          <div

            className="exercise-image exercise-image-placeholder"

            role="img"

            aria-label={`${exercise} image unavailable`}

          >

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

          onError={() => setImageFailed(true)}

        />

      );

    }

function App() {
  const [exercises, setExercises] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationMethod, setRecommendationMethod] = useState("");
  const [muscleRegions, setMuscleRegions] = useState({});
  const [variations, setVariations] = useState([]);
  const [variationFor, setVariationFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    if (!showAbout) return;

    function handleEscape(event) {
      if (event.key === "Escape") {
        setShowAbout(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showAbout]);

  // Keep your existing exercise-loading useEffect,
  // functions, and return JSX below this point.

      useEffect(() => {

        fetch(`${API_URL}/api/exercises`)

          .then((response) => {

            if (!response.ok) {

              throw new Error("Unable to load exercises.");

            }

            return response.json();

          })

          .then((data) => setExercises(data))

          .catch(() =>

            setError(

              "Cannot connect to Flask. Check that your backend is running."

            )

          );

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

      function clearResults() {

        setRecommendations([]);

        setRecommendationMethod("");

        setVariations([]);

        setVariationFor("");

        setHasSearched(false);

        setError("");

      }

      function addExercise(exercise) {

        setSelected((previous) => [...previous, exercise]);

        setSearch("");

        clearResults();

      }

      function removeExercise(exercise) {

        setSelected((previous) =>

          previous.filter((item) => item !== exercise)

        );

        clearResults();

      }

      async function findVariations(exercise) {

        const response = await fetch(`${API_URL}/api/variations`, {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

          },

          body: JSON.stringify({ exercise }),

        });

        if (!response.ok) {

          throw new Error("Unable to load exercise variations.");

        }

        const data = await response.json();

        setVariations(

          Array.isArray(data.variations) ? data.variations : []

        );

        setVariationFor(exercise);

      }

      function chooseVariation(variation) {

        setSelected((previous) =>

          previous.map((exercise) =>

            exercise === variationFor ? variation : exercise

          )

        );

        clearResults();

      }

      async function getRecommendations() {

        if (selected.length === 0) {

          setError("Please select at least one exercise.");

          return;

        }

        setLoading(true);

        setError("");

        setHasSearched(false);

        setVariations([]);

        setVariationFor("");

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

            throw new Error(

              data.error || "Recommendation request failed."

            );

          }

          const results = Array.isArray(data.recommendations)

            ? data.recommendations

            : [];

          setRecommendations(results);

          setRecommendationMethod(data.method || "");

          setHasSearched(true);

          // Predict muscle regions for recommended exercises

    const regionResults = await Promise.allSettled(

      results.map(async (item) => {

        const region = await classifyExerciseMuscle(item.exercise);

        return {

          exercise: item.exercise,

          region,

        };

      })

    );

    const regions = {};

    regionResults.forEach((result) => {

      if (result.status === "fulfilled" && result.value.region) {

        regions[result.value.exercise] = result.value.region;

      }

    });

    setMuscleRegions(regions);

          // Offer alternatives only when a single selected

          // exercise produces no recommendations.

          if (results.length === 0 && selected.length === 1) {

            try {

              await findVariations(selected[0]);

            } catch (variationError) {

              console.error(

                "Could not retrieve variations:",

                variationError

              );

            }

          }

        } catch (err) {

          setError(err.message);

        } finally {

          setLoading(false);

        }

      }

      return (

      <div className="app">

        {/* Full-screen looping gym video background */}

        <div className="video-background" aria-hidden="true">

          <video autoPlay muted loop playsInline preload="metadata">

            <source

              src="/videos/gym-background.mp4"

              type="video/mp4"

            />

          </video>

        </div>

<header className="header">
  <div className="brand">
    Fit<span>Routine</span>
  </div>

  <button
    type="button"
    className="about-button"
    onClick={() => setShowAbout(true)}
  >
    About
  </button>
</header>

{showAbout && (
  <div
    className="about-overlay"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        setShowAbout(false);
      }
    }}
  >
    <section
      className="about-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
    >
      <div className="about-modal-header">
        <h2 id="about-title">
          About Fit<span>Routine</span>
        </h2>

        <button
          type="button"
          className="about-close"
          aria-label="Close About popup"
          onClick={() => setShowAbout(false)}
        >
          ×
        </button>
      </div>

      <p className="about-intro">
        FitRoutine is a web-based exercise recommendation system
        that helps users discover related exercises based on
        patterns found in existing workout programs.
      </p>

      <h3>How FitRoutine Works</h3>

      <div className="about-step">
        <strong>1. Select Exercises</strong>
        <p>Choose exercises using the search feature.</p>
      </div>

      <div className="about-step">
        <strong>2. Apriori Recommendations</strong>
        <p>
          Apriori association rules identify exercises that
          frequently appear together in workout transactions.
        </p>
      </div>

      <div className="about-step">
        <strong>3. Observed-Pairs Fallback</strong>
        <p>
          When Apriori cannot provide enough recommendations,
          observed exercise pairs help fill the remaining slots.
        </p>
      </div>

      <div className="about-step">
        <strong>4. Muscle-Region Prediction</strong>
        <p>
          A Logistic Regression model predicts whether an exercise
          targets the Upper Body, Lower Body, Core, or Neck.
        </p>
      </div>

      <div className="about-disclaimer">
        <strong>Important Note</strong>
        <p>
          FitRoutine is an academic project. Recommendations
          reflect patterns in workout data and do not guarantee
          exercise safety, effectiveness, or an ideal workout order.
        </p>
      </div>
    </section>
  </div>
)}

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

                  onChange={(event) =>

                    setSearch(event.target.value)

                  }

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

                  <p className="muted">

                    No exercises selected yet.

                  </p>

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

                type="button"

                className="primary-button"

                onClick={getRecommendations}

                disabled={loading || selected.length === 0}

              >

                {loading

                  ? "Finding exercises..."

                  : "Get Recommendations"}

              </button>

            </section>

            <section className="panel">

              <h2>Exercise Recommendations</h2>

              {error && <p className="error">{error}</p>}

              {variations.length > 0 && (

                <div className="variation-selector">

                  <h3>Choose an Exercise Variation</h3>

                  <p className="muted">

                    No direct recommendations were found for{" "}

                    <strong>{variationFor}</strong>.

                    These are possible exercise variations.

                    Choose the one that matches your intended

                    movement.

                  </p>

                  <div className="variation-options">

                    {variations.map((variation) => (

                      <button

                        type="button"

                        className="chip"

                        key={variation}

                        onClick={() => chooseVariation(variation)}

                      >

                        {variation}

                      </button>

                    ))}

                  </div>

                  <p className="muted">

                    After choosing a variation, click

                    Get Recommendations again.

                  </p>

                </div>

              )}

              {recommendations.length > 0 ? (

                <>

                  <p className="muted">

                    {recommendationMethod === "observed_pairs"

                      ? "Related exercises found together in existing workout programs."

                      : recommendationMethod === "hybrid"

                        ? "Apriori association-rule recommendations, completed with exercises found together in existing workout programs."

                        : "Exercise recommendations generated using Apriori association rules."}

                  </p>

                  <div className="recommendation-list">

                    {recommendations.map((item, index) => {

                      const isApriori =

                        item.source === "apriori";

                      return (

                        <div

                          className="recommendation"

                          key={`${item.exercise}-${index}`}

                        >

                          <div className="recommendation-info">

                            <span className="rank">

                              #{index + 1}

                            </span>

                            <ExerciseImage

                              key={item.exercise}

                              exercise={item.exercise}

                            />

                            <div className="exercise-title">

                              <h3>{item.exercise}</h3>

      <p className="muscle-region">

    Muscle Region: {muscleRegions[item.exercise] || "Not available"}

  </p>

                              {isApriori ? (

                                <p>

                                  Lift:{" "}

                                  {Number(item.lift).toFixed(2)}

                                  {" · "}

                                  Support:{" "}

                                  {(

                                    Number(item.support) * 100

                                  ).toFixed(2)}

                                  %

                                </p>

                              ) : (

  <p>

    Observed together in{" "}

    {Number(item.shared_workout_days || 0).toLocaleString()}{" "}

    workout {Number(item.shared_workout_days || 0) === 1 ? "day" : "days"}

  </p>

                              )}

                            </div>

                          </div>

  <div className="confidence">

    {isApriori ? (

      <>

        {(Number(item.confidence) * 100).toFixed(1)}%

        <small>Apriori Confidence</small>

      </>

    ) : (

      <>

        <span>Pair</span>

        <small>Observed Pair</small>

      </>

    )}

  </div>

                        </div>

                      );

                    })}

                  </div>

                </>

              ) : hasSearched ? (

                <p className="muted">

                  {variations.length > 0

                    ? "Select one of the variations above to continue."

                    : "No exercise pairs were found for your selection. Try selecting another exercise."}

                </p>

              ) : (

                <p className="muted">

                  Your recommended exercises will appear here.

                </p>

              )}

            </section>

            <footer>

              FitRoutine uses Apriori association rules and observed

              exercise co-occurrences to suggest related exercises.

              Recommendations reflect patterns in existing workout

              programs and do not establish exercise safety,

              effectiveness, or the ideal workout order.

            </footer>

          </main>

        </div>

      );

    }

    export default App;
  

