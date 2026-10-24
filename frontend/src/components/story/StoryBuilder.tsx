import React, { useState } from "react";
import { Character } from "../../services/character.service";
import { CharacterPickerModal } from "./CharacterPickerModal";
import { SparklesIcon, PlusIcon, UsersIcon, CheckIcon } from "../common/Icons";
import "./story.css";

export interface StoryFormState {
  topic: string;
  ageGroup: string;
  desiredDurationSeconds: number;
  language: string;
  title?: string;
  genre: string;
  visualStyle: string;
  lesson: string;
  sceneCount?: number;
  tone?: string;
  contentRestrictions?: string;
  characterIds: string[];
}

interface StoryBuilderProps {
  initialState?: Partial<StoryFormState>;
  characters: Character[];
  loading?: boolean;
  onGenerate: (data: StoryFormState) => void;
  onImport?: (data: {
    rawText: string;
    title?: string;
    language?: string;
    format?: string;
    genre?: string;
  }) => void;
}

const defaultState: StoryFormState = {
  topic: "",
  ageGroup: "4-7 years",
  desiredDurationSeconds: 60,
  language: "Hindi",
  title: "",
  genre: "Adventure",
  visualStyle: "Storybook",
  lesson: "",
  sceneCount: undefined,
  tone: "cheerful",
  contentRestrictions: "",
  characterIds: [],
};

export const INSPIRATION_CHIPS = [
  {
    id: "space-explorer",
    emoji: "🚀",
    label: "Space Explorer",
    category: "Adventure • 4–7 yrs",
    theme: "space",
    prompt:
      "Pip the bear and Sammy build a cardboard rocket that flies them to a glowing candy planet.",
    genre: "Adventure",
    ageGroup: "4-7 years",
  },
  {
    id: "secret-treehouse",
    emoji: "🌲",
    label: "Secret Treehouse",
    category: "Adventure • 4–7 yrs",
    theme: "treehouse",
    prompt:
      "In the whispering woods, Pip discovers a hidden treehouse full of curious musical instruments and woodland friends.",
    genre: "Adventure",
    ageGroup: "4-7 years",
  },
  {
    id: "painting-robot",
    emoji: "🎨",
    label: "Painting Robot",
    category: "Friendship • 4–7 yrs",
    theme: "robot",
    prompt:
      "Sparky the little robot is shy about showing his colorful paintings until his friends help him create a rainbow mural.",
    genre: "Friendship",
    ageGroup: "4-7 years",
  },
  {
    id: "gentle-dinosaur",
    emoji: "🦕",
    label: "Gentle Dinosaur",
    category: "Learning • 2–4 yrs",
    theme: "dino",
    prompt:
      "A tiny gentle dinosaur is nervous on his first day at preschool until a kind bear shares his building blocks.",
    genre: "Educational",
    ageGroup: "2-4 years",
  },
  {
    id: "cloud-lullaby",
    emoji: "🌙",
    label: "Cloud Lullaby",
    category: "Bedtime • 2–4 yrs",
    theme: "lullaby",
    prompt:
      "A sleepy little bear floats on a soft silver cloud, waving goodnight to the twinkling moon and gentle star friends.",
    genre: "Bedtime",
    ageGroup: "2-4 years",
  },
  {
    id: "ocean-quest",
    emoji: "🌊",
    label: "Ocean Quest",
    category: "Adventure • 7–10 yrs",
    theme: "ocean",
    prompt:
      "Sammy explores a magical coral reef with playful dolphins to find a lost glowing seashell for the sea turtle king.",
    genre: "Adventure",
    ageGroup: "7-10 years",
  },
];

export default function StoryBuilder({
  initialState = {},
  characters = [],
  loading = false,
  onGenerate,
  onImport,
}: StoryBuilderProps) {
  const [form, setForm] = useState<StoryFormState>({
    ...defaultState,
    ...initialState,
  });
  const [errors, setErrors] = useState<{ topic?: string }>({});
  const [selectedSparkId, setSelectedSparkId] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function handleToggleCharacter(id: string) {
    setForm((prev) => ({
      ...prev,
      characterIds: prev.characterIds.includes(id)
        ? prev.characterIds.filter((c) => c !== id)
        : [...prev.characterIds, id],
    }));
  }

  function handleSelectInspiration(item: (typeof INSPIRATION_CHIPS)[0]) {
    setForm((prev) => ({
      ...prev,
      topic: item.prompt,
      genre: item.genre,
      ageGroup: item.ageGroup,
    }));
    setSelectedSparkId(item.id);
    setErrors((prev) => ({ ...prev, topic: undefined }));
  }

  function handleTopicChange(val: string) {
    setForm((prev) => ({ ...prev, topic: val }));
    setErrors((prev) => ({ ...prev, topic: undefined }));
    const match = INSPIRATION_CHIPS.find((c) => c.prompt === val);
    setSelectedSparkId(match ? match.id : null);
  }

  function handleGenerate() {
    const newErrors: { topic?: string } = {};

    if (!form.topic.trim()) {
      newErrors.topic =
        "Please enter a story concept or choose a Story Spark inspiration.";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    onGenerate(form);
  }

  const [studioMode, setStudioMode] = useState<"generate" | "import">(
    "generate",
  );
  const [importText, setImportText] = useState<string>("");
  const [importTitle, setImportTitle] = useState<string>("");
  const [importLanguage, setImportLanguage] = useState<string>("Hindi");
  const [importFormat, setImportFormat] = useState<"16:9" | "9:16">("16:9");
  const [importGenre, setImportGenre] = useState<string>("Educational");
  const [importError, setImportError] = useState<string | null>(null);

  const SAMPLE_FOUR_SEASONS = `# Title: Earth's Promise: The Four Seasons
Logline: Earth teaches children how the four seasons bring balance, beauty, and life to our planet.
Lesson: Every season has a special purpose in nature.

## Characters
- Earth (Protagonist): Our smiling, wise living planet with blue oceans and green continents.

## Scene 1: Golden Summer
Visual: Sun-drenched golden meadows with distant mountains, vibrant sunshine rays and heat shimmer.
Narration: ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है और प्रकृति खिल उठती है।
Earth: नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। देखो, सूरज की धूप फसलों को पका रही है! (Emotion: happy)

## Scene 2: The Monsoon Rain
Visual: Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes.
Narration: वर्षा ऋतु में काले बादल गरजते हैं और ठंडी बारिश सूखी धरती को नया जीवन देती है।
Earth: आहा! बारिश की हर बूंद नदियों और झरनों में नई जान फूंक देती है। (Emotion: excited)

## Scene 3: Peaceful Winter
Visual: Serene snowy forest with pine trees covered in soft snowfall, gentle fog and mist.
Narration: शीत ऋतु में बर्फ की सफेद चादर बिछ जाती है और पेड़-पौधे विश्राम करते हैं।
Earth: सर्दी हमें सिखाती है कि नए जीवन की तैयारी के लिए विश्राम भी जरूरी है। (Emotion: calm)

## Scene 4: Colorful Autumn
Visual: Forest hills with golden falling leaves swirling in the breeze and flying birds in the sky.
Narration: शरद ऋतु में पत्ते सुनहरे होकर गिरते हैं और पक्षी सुहाने मौसम में उड़ते हैं।
Earth: पतझड़ के बाद नया बसंत आता है! प्रकृति का यह चक्र हमेशा मुस्कुराता रहता है। (Emotion: cheerful)
`;

  function handleLoadSample() {
    setImportTitle("Earth's Promise: The Four Seasons");
    setImportText(SAMPLE_FOUR_SEASONS);
    setImportLanguage("Hindi");
    setImportError(null);
  }

  function handleImportSubmit() {
    if (!importText.trim()) {
      setImportError("Please enter or paste your story script.");
      return;
    }
    setImportError(null);
    if (onImport) {
      onImport({
        rawText: importText,
        title: importTitle || undefined,
        language: importLanguage,
        format: importFormat,
        genre: importGenre,
      });
    }
  }

  const estimatedScenes =
    form.desiredDurationSeconds <= 30
      ? "3"
      : form.desiredDurationSeconds <= 60
        ? "4"
        : "5–6";

  return (
    <div className="story-studio-workbench">
      {/* Studio Mode Selector (AI Generator vs Import/Write Script) */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "16px",
          background: "rgba(255,255,255,0.04)",
          padding: "6px",
          borderRadius: "10px",
        }}
      >
        <button
          type="button"
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: "8px",
            border:
              studioMode === "generate"
                ? "1px solid var(--ed-accent, #8b5cf6)"
                : "1px solid transparent",
            background:
              studioMode === "generate"
                ? "rgba(139, 92, 246, 0.22)"
                : "transparent",
            color: studioMode === "generate" ? "#ffffff" : "#94a3b8",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
          onClick={() => setStudioMode("generate")}
        >
          <SparklesIcon size={15} />
          <span>AI Idea Sparks & Story Builder</span>
        </button>
        <button
          type="button"
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: "8px",
            border:
              studioMode === "import"
                ? "1px solid #38bdf8"
                : "1px solid transparent",
            background:
              studioMode === "import"
                ? "rgba(56, 189, 248, 0.22)"
                : "transparent",
            color: studioMode === "import" ? "#ffffff" : "#94a3b8",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
          onClick={() => setStudioMode("import")}
        >
          <span>📝</span>
          <span>Import or Write Story (Fast • Local • Zero AI Cost)</span>
        </button>
      </div>

      {studioMode === "import" ? (
        <div
          className="studio-card"
          style={{
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc" }}>
                Import or Write Story Script
              </h3>
              <p
                style={{
                  margin: "4px 0 0 0",
                  fontSize: "13px",
                  color: "#94a3b8",
                }}
              >
                Paste from Claude, ChatGPT, Gemini, or type your own scenes.
                Automatically detects character dialogue, emotions, narration,
                and seasonal weather overlays.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="ed-btn-action"
                style={{
                  background: "rgba(139, 92, 246, 0.2)",
                  border: "1px solid #8b5cf6",
                  color: "#c4b5fd",
                }}
                onClick={handleLoadSample}
              >
                🌍 Load "Earth's Four Seasons" Sample
              </button>
              <button
                type="button"
                className="ed-btn-action"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  color: "#94a3b8",
                }}
                onClick={() => {
                  setImportText("");
                  setImportTitle("");
                  setImportError(null);
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            <div className="studio-field">
              <label className="studio-label">Story Title (Optional)</label>
              <input
                type="text"
                className="studio-input"
                placeholder="e.g., Earth's Promise: The Four Seasons"
                value={importTitle}
                onChange={(e) => setImportTitle(e.target.value)}
              />
            </div>

            <div className="studio-field">
              <label className="studio-label">
                Primary Language (Speech & Subtitles)
              </label>
              <select
                className="studio-input"
                value={importLanguage}
                onChange={(e) => setImportLanguage(e.target.value)}
              >
                <option value="Hindi">Hindi (Default • Kokoro hf_alpha)</option>
                <option value="English">English (Kokoro 28 Voices)</option>
              </select>
            </div>

            <div className="studio-field">
              <label className="studio-label">Target Format</label>
              <select
                className="studio-input"
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value as any)}
              >
                <option value="16:9">16:9 Landscape (YouTube / Desktop)</option>
                <option value="9:16">
                  9:16 Vertical Reel / Short (Instagram / Shorts / TikTok)
                </option>
              </select>
            </div>

            <div className="studio-field">
              <label className="studio-label">Genre</label>
              <select
                className="studio-input"
                value={importGenre}
                onChange={(e) => setImportGenre(e.target.value)}
              >
                <option value="Educational">Educational & Science</option>
                <option value="Adventure">Adventure</option>
                <option value="Bedtime">Bedtime & Calm</option>
                <option value="Comedy">Fun & Playful</option>
              </select>
            </div>
          </div>

          <div className="studio-field">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <label className="studio-label" style={{ margin: 0 }}>
                Story Script (Markdown, Screenplay, or JSON) *
              </label>
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                {importText.length} characters
              </span>
            </div>
            <textarea
              className="studio-textarea"
              style={{
                fontFamily: "monospace",
                fontSize: "13px",
                minHeight: "260px",
                lineHeight: "1.5",
              }}
              placeholder={`# Title: Earth's Promise: The Four Seasons\n\n## Scene 1: Summer\nVisual: Golden meadow with sunshine rays...\nNarration: ग्रीष्म ऋतु में...\nEarth: नमस्ते दोस्तों! (Emotion: happy)\n\n## Scene 2: Monsoon\nVisual: Rain drops and rolling clouds...\nEarth: देखो बारिश! (Emotion: excited)`}
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError(null);
              }}
              rows={12}
            />
            {importError && (
              <span
                className="field-error"
                style={{
                  color: "#ef4444",
                  fontSize: "12px",
                  marginTop: "4px",
                  display: "block",
                }}
              >
                {importError}
              </span>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="studio-generate-btn"
              onClick={handleImportSubmit}
              disabled={loading}
              style={{
                minWidth: "240px",
                background: "linear-gradient(135deg, #0284c7, #38bdf8)",
              }}
            >
              {loading ? (
                <>
                  <span className="studio-spinner" aria-hidden="true" />
                  <span>Parsing & Creating Video Project...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Import & Create Video Project</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 1. Creative Story Sparks Row */}
          <div className="story-spark-bar">
            <div className="spark-bar-title">
              <SparklesIcon size={14} color="var(--studio-violet, #8b5cf6)" />
              <span>Story Sparks:</span>
            </div>
            <div
              className="spark-chips-container"
              role="region"
              aria-label="Story Spark Inspirations"
            >
              {INSPIRATION_CHIPS.map((chip) => {
                const isActive = selectedSparkId === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    className={`spark-card spark-${chip.theme} ${isActive ? "active" : ""}`}
                    onClick={() => handleSelectInspiration(chip)}
                    title={`${chip.label} — ${chip.prompt}`}
                    aria-pressed={isActive}
                  >
                    <span className="spark-emoji">{chip.emoji}</span>
                    <div className="spark-body">
                      <span className="spark-label">{chip.label}</span>
                      <span className="spark-category">{chip.category}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Main Studio Two-Column Grid */}
          <div className="story-studio-grid">
            {/* LEFT COLUMN: The Story Prompt & Starring Cast */}
            <div className="story-studio-left">
              {/* Card 1: Core Prompt */}
              <div className="studio-card prompt-card">
                <div className="studio-card-header">
                  <div className="card-heading">
                    <span className="step-pill">1</span>
                    <h3>Story Concept & Prompt *</h3>
                  </div>
                  <span className="char-badge">{form.topic.length} chars</span>
                </div>

                <textarea
                  className="studio-textarea"
                  value={form.topic}
                  onChange={(e) => handleTopicChange(e.target.value)}
                  placeholder="e.g., Pip the gentle bear and Sammy find a glowing map in the whispering woods that leads to a secret musical treehouse..."
                  rows={3}
                  aria-label="Story Concept or Prompt"
                  aria-required="true"
                />

                {errors.topic && (
                  <div className="studio-error-badge" role="alert">
                    <span>⚠️</span>
                    <span>{errors.topic}</span>
                  </div>
                )}
              </div>

              {/* Card 2: Starring Cast Tray */}
              <div className="studio-card cast-card">
                <div className="studio-card-header">
                  <div className="card-heading">
                    <span className="step-pill">2</span>
                    <div>
                      <h3>Starring Cast</h3>
                      <span className="card-heading-meta">
                        {form.characterIds.length === 0
                          ? "Choose cast or let AI generate"
                          : `${form.characterIds.length} chosen`}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cast-browse-btn"
                    onClick={() => setIsPickerOpen(true)}
                  >
                    <UsersIcon size={13} />
                    <span>+ Browse Library ({characters.length})</span>
                  </button>
                </div>

                <div
                  className="cast-avatars-tray"
                  role="group"
                  aria-label="Selectable Characters"
                >
                  {characters.slice(0, 8).map((c) => {
                    const isSelected = form.characterIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        className={`cast-card-chip ${isSelected ? "selected" : ""}`}
                        onClick={() => handleToggleCharacter(c.id)}
                        title={`${c.name} (${c.species || "Character"}) • Click to ${isSelected ? "remove" : "cast"}`}
                      >
                        <div className="cast-avatar-circle">
                          {c.referenceImageUrl ? (
                            <img
                              src={c.referenceImageUrl}
                              alt={c.name}
                              className="cast-avatar-img"
                            />
                          ) : (
                            <span>
                              {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                            </span>
                          )}
                        </div>
                        <div className="cast-info">
                          <span className="cast-name">{c.name}</span>
                          {c.species && (
                            <span className="cast-species">{c.species}</span>
                          )}
                        </div>
                        <div className="cast-status-icon">
                          {isSelected ? (
                            <CheckIcon size={12} color="#ffffff" />
                          ) : (
                            <PlusIcon size={12} />
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {characters.length === 0 && (
                    <div className="cast-empty-notice">
                      <span className="cast-empty-icon">🎭</span>
                      <div className="cast-empty-text">
                        <strong>No library characters yet.</strong> AI will
                        automatically design original characters with 2D vector
                        rigs tailored to your story!
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Optional Fine-Tuning Drawer */}
              <div className="studio-card finetune-card">
                <div
                  className="studio-card-header clickable"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setShowAdvanced(!showAdvanced);
                    }
                  }}
                  aria-expanded={showAdvanced}
                >
                  <div className="card-heading">
                    <span className="step-pill optional">Opt</span>
                    <h3>Fine-Tune Details (Title, Moral, Tone)</h3>
                  </div>
                  <button
                    type="button"
                    className="studio-toggle-arrow"
                    aria-label="Toggle options"
                  >
                    {showAdvanced ? "▲ Hide" : "▼ Refine"}
                  </button>
                </div>

                {showAdvanced && (
                  <div className="finetune-form-grid">
                    <div className="finetune-two-col">
                      <div className="studio-field">
                        <label htmlFor="story-working-title">
                          Working Title (Optional)
                        </label>
                        <input
                          id="story-working-title"
                          type="text"
                          className="studio-input"
                          value={form.title || ""}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              title: e.target.value,
                            }))
                          }
                          placeholder="e.g. Milo and the Starlit Garden"
                        />
                      </div>
                      <div className="studio-field">
                        <label htmlFor="story-tone-select">Story Tone</label>
                        <select
                          id="story-tone-select"
                          className="studio-input"
                          value={form.tone || "cheerful"}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              tone: e.target.value,
                            }))
                          }
                        >
                          <option value="cheerful">☀️ Cheerful & Warm</option>
                          <option value="funny">🎈 Funny & Silly</option>
                          <option value="exciting">
                            🚀 Exciting & Adventurous
                          </option>
                          <option value="gentle">🌙 Gentle & Calming</option>
                          <option value="educational">
                            🔬 Curious & Educational
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="studio-field">
                      <label htmlFor="story-moral-lesson">
                        Moral Lesson / Takeaway
                      </label>
                      <input
                        id="story-moral-lesson"
                        type="text"
                        className="studio-input"
                        value={form.lesson}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            lesson: e.target.value,
                          }))
                        }
                        placeholder="e.g. Sharing toys and helping friends in need makes everything more fun"
                      />
                    </div>

                    <div className="finetune-two-col">
                      <div className="studio-field">
                        <label htmlFor="story-scene-count">Scene Count</label>
                        <select
                          id="story-scene-count"
                          className="studio-input"
                          value={form.sceneCount || ""}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              sceneCount: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            }))
                          }
                        >
                          <option value="">
                            Auto (Optimized for duration)
                          </option>
                          <option value="3">3 Scenes</option>
                          <option value="4">4 Scenes</option>
                          <option value="5">5 Scenes</option>
                          <option value="6">6 Scenes</option>
                        </select>
                      </div>
                      <div className="studio-field">
                        <label htmlFor="story-content-restrictions">
                          Things to Avoid
                        </label>
                        <input
                          id="story-content-restrictions"
                          type="text"
                          className="studio-input"
                          value={form.contentRestrictions || ""}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              contentRestrictions: e.target.value,
                            }))
                          }
                          placeholder="e.g. No monsters, no loud sounds"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Studio Director Controls */}
            <div className="story-studio-right">
              <div className="studio-card director-card">
                <div className="studio-card-header">
                  <div className="card-heading">
                    <span className="step-pill">3</span>
                    <div>
                      <h3>Director Settings</h3>
                      <span className="card-heading-meta">
                        Tailor pacing, audience & art style
                      </span>
                    </div>
                  </div>
                </div>

                {/* Target Audience Segmented Buttons */}
                <div className="studio-control-block">
                  <label className="studio-label">Target Audience / Age</label>
                  <div
                    className="studio-segmented-group cols-2"
                    role="radiogroup"
                    aria-label="Target Audience"
                  >
                    {[
                      {
                        id: "2-4 years",
                        label: "2–4 yrs",
                        icon: "👶",
                        desc: "Toddlers",
                      },
                      {
                        id: "4-7 years",
                        label: "4–7 yrs",
                        icon: "🧒",
                        desc: "Early Readers",
                      },
                      {
                        id: "7-10 years",
                        label: "7–10 yrs",
                        icon: "🎒",
                        desc: "Big Kids",
                      },
                      {
                        id: "Family",
                        label: "All Ages",
                        icon: "👨‍👩‍👧",
                        desc: "Family",
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={form.ageGroup === item.id}
                        className={`segmented-card ${form.ageGroup === item.id ? "active" : ""}`}
                        onClick={() =>
                          setForm((prev) => ({ ...prev, ageGroup: item.id }))
                        }
                      >
                        <span className="segmented-icon">{item.icon}</span>
                        <div className="segmented-text">
                          <span className="segmented-title">{item.label}</span>
                          <span className="segmented-desc">{item.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Duration Segmented Buttons */}
                <div className="studio-control-block">
                  <label className="studio-label">Pacing & Duration</label>
                  <div
                    className="studio-segmented-group cols-3"
                    role="radiogroup"
                    aria-label="Pacing & Duration"
                  >
                    {[
                      { id: 30, label: "30s", icon: "⚡", desc: "~3 scenes" },
                      { id: 60, label: "60s", icon: "⏱️", desc: "~4 scenes" },
                      {
                        id: 120,
                        label: "2 min",
                        icon: "🎬",
                        desc: "~5–6 scenes",
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={form.desiredDurationSeconds === item.id}
                        className={`segmented-card ${form.desiredDurationSeconds === item.id ? "active" : ""}`}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            desiredDurationSeconds: item.id,
                          }))
                        }
                      >
                        <span className="segmented-icon">{item.icon}</span>
                        <div className="segmented-text">
                          <span className="segmented-title">{item.label}</span>
                          <span className="segmented-desc">{item.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Genre Pills */}
                <div className="studio-control-block">
                  <label className="studio-label">Genre & Theme</label>
                  <div
                    className="studio-genre-grid"
                    role="radiogroup"
                    aria-label="Genre & Theme"
                  >
                    {[
                      { id: "Adventure", label: "Adventure", icon: "🌟" },
                      { id: "Bedtime", label: "Bedtime", icon: "🌙" },
                      { id: "Comedy", label: "Fun & Comedy", icon: "🎈" },
                      { id: "Educational", label: "Learning", icon: "🔬" },
                      { id: "Fantasy", label: "Magic & Fantasy", icon: "🪄" },
                      { id: "Friendship", label: "Friendship", icon: "🤝" },
                    ].map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        role="radio"
                        aria-checked={form.genre === g.id}
                        className={`genre-badge-pill ${form.genre === g.id ? "active" : ""}`}
                        onClick={() =>
                          setForm((prev) => ({ ...prev, genre: g.id }))
                        }
                      >
                        <span>{g.icon}</span>
                        <span>{g.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language & Visual Style Compact Row */}
                <div className="studio-control-block">
                  <div className="studio-duo-row">
                    <div className="studio-field">
                      <label
                        htmlFor="studio-language-select"
                        className="studio-label"
                      >
                        Language
                      </label>
                      <select
                        id="studio-language-select"
                        className="studio-input"
                        value={form.language}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            language: e.target.value,
                          }))
                        }
                      >
                        <option value="Hindi">Hindi (हिन्दी) [Default]</option>
                        <option value="English">English</option>
                        <option value="Spanish">Spanish</option>
                        <option value="French">French</option>
                        <option value="German">German</option>
                        <option value="Japanese">Japanese</option>
                      </select>
                    </div>
                    <div className="studio-field">
                      <label
                        htmlFor="studio-visual-style-select"
                        className="studio-label"
                      >
                        Visual Style
                      </label>
                      <select
                        id="studio-visual-style-select"
                        className="studio-input"
                        value={form.visualStyle}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            visualStyle: e.target.value,
                          }))
                        }
                      >
                        <option value="Storybook">Storybook Vector</option>
                        <option value="Cartoon">Vibrant Cartoon</option>
                        <option value="Watercolor">Soft Watercolor</option>
                        <option value="3D Cute">3D Playful</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Production Launch Bar */}
                <div className="studio-production-card">
                  <div className="production-info-line">
                    <span className="prod-badge">PROD</span>
                    <span className="prod-text">
                      Generates <strong>~{estimatedScenes} scenes</strong> •{" "}
                      {form.desiredDurationSeconds}s • {form.ageGroup} •{" "}
                      {form.visualStyle}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="studio-generate-btn"
                    onClick={handleGenerate}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="studio-spinner" aria-hidden="true" />
                        <span>Crafting Animated Story...</span>
                      </>
                    ) : (
                      <>
                        <SparklesIcon size={16} />
                        <span>Generate Story</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal for browsing character library */}
      <CharacterPickerModal
        isOpen={isPickerOpen}
        characters={characters.map((c) => ({
          ...c,
          description: c.visualDescription,
        }))}
        selectedIds={form.characterIds}
        onToggle={handleToggleCharacter}
        onClose={() => setIsPickerOpen(false)}
        onConfirm={() => setIsPickerOpen(false)}
      />
    </div>
  );
}
