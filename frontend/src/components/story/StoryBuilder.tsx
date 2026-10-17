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
}

const defaultState: StoryFormState = {
  topic: "",
  ageGroup: "4-7 years",
  desiredDurationSeconds: 60,
  language: "English",
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
    prompt: "Pip the bear and Sammy build a cardboard rocket that flies them to a glowing candy planet.",
    genre: "Adventure",
    ageGroup: "4-7 years",
  },
  {
    id: "secret-treehouse",
    emoji: "🌲",
    label: "Secret Treehouse",
    category: "Adventure • 4–7 yrs",
    theme: "treehouse",
    prompt: "In the whispering woods, Pip discovers a hidden treehouse full of curious musical instruments and woodland friends.",
    genre: "Adventure",
    ageGroup: "4-7 years",
  },
  {
    id: "painting-robot",
    emoji: "🎨",
    label: "Painting Robot",
    category: "Friendship • 4–7 yrs",
    theme: "robot",
    prompt: "Sparky the little robot is shy about showing his colorful paintings until his friends help him create a rainbow mural.",
    genre: "Friendship",
    ageGroup: "4-7 years",
  },
  {
    id: "gentle-dinosaur",
    emoji: "🦕",
    label: "Gentle Dinosaur",
    category: "Learning • 2–4 yrs",
    theme: "dino",
    prompt: "A tiny gentle dinosaur is nervous on his first day at preschool until a kind bear shares his building blocks.",
    genre: "Educational",
    ageGroup: "2-4 years",
  },
  {
    id: "cloud-lullaby",
    emoji: "🌙",
    label: "Cloud Lullaby",
    category: "Bedtime • 2–4 yrs",
    theme: "lullaby",
    prompt: "A sleepy little bear floats on a soft silver cloud, waving goodnight to the twinkling moon and gentle star friends.",
    genre: "Bedtime",
    ageGroup: "2-4 years",
  },
  {
    id: "ocean-quest",
    emoji: "🌊",
    label: "Ocean Quest",
    category: "Adventure • 7–10 yrs",
    theme: "ocean",
    prompt: "Sammy explores a magical coral reef with playful dolphins to find a lost glowing seashell for the sea turtle king.",
    genre: "Adventure",
    ageGroup: "7-10 years",
  },
];

export default function StoryBuilder({
  initialState = {},
  characters = [],
  loading = false,
  onGenerate,
}: StoryBuilderProps) {
  const [form, setForm] = useState<StoryFormState>({ ...defaultState, ...initialState });
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

  function handleSelectInspiration(item: typeof INSPIRATION_CHIPS[0]) {
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
      newErrors.topic = "Please enter a story concept or choose a Story Spark inspiration.";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    onGenerate(form);
  }

  const estimatedScenes =
    form.desiredDurationSeconds <= 30 ? "3" : form.desiredDurationSeconds <= 60 ? "4" : "5–6";

  return (
    <div className="story-studio-workbench">
      {/* 1. Creative Story Sparks Row */}
      <div className="story-spark-bar">
        <div className="spark-bar-title">
          <SparklesIcon size={14} color="var(--studio-violet, #8b5cf6)" />
          <span>Story Sparks:</span>
        </div>
        <div className="spark-chips-container" role="region" aria-label="Story Spark Inspirations">
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

            <div className="cast-avatars-tray" role="group" aria-label="Selectable Characters">
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
                        <img src={c.referenceImageUrl} alt={c.name} className="cast-avatar-img" />
                      ) : (
                        <span>{c.name ? c.name.charAt(0).toUpperCase() : "C"}</span>
                      )}
                    </div>
                    <div className="cast-info">
                      <span className="cast-name">{c.name}</span>
                      {c.species && <span className="cast-species">{c.species}</span>}
                    </div>
                    <div className="cast-status-icon">
                      {isSelected ? <CheckIcon size={12} color="#ffffff" /> : <PlusIcon size={12} />}
                    </div>
                  </button>
                );
              })}

              {characters.length === 0 && (
                <div className="cast-empty-notice">
                  <span className="cast-empty-icon">🎭</span>
                  <div className="cast-empty-text">
                    <strong>No library characters yet.</strong>{" "}
                    AI will automatically design original characters with 2D vector rigs tailored to your story!
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
                    <label htmlFor="story-working-title">Working Title (Optional)</label>
                    <input
                      id="story-working-title"
                      type="text"
                      className="studio-input"
                      value={form.title || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Milo and the Starlit Garden"
                    />
                  </div>
                  <div className="studio-field">
                    <label htmlFor="story-tone-select">Story Tone</label>
                    <select
                      id="story-tone-select"
                      className="studio-input"
                      value={form.tone || "cheerful"}
                      onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
                    >
                      <option value="cheerful">☀️ Cheerful & Warm</option>
                      <option value="funny">🎈 Funny & Silly</option>
                      <option value="exciting">🚀 Exciting & Adventurous</option>
                      <option value="gentle">🌙 Gentle & Calming</option>
                      <option value="educational">🔬 Curious & Educational</option>
                    </select>
                  </div>
                </div>

                <div className="studio-field">
                  <label htmlFor="story-moral-lesson">Moral Lesson / Takeaway</label>
                  <input
                    id="story-moral-lesson"
                    type="text"
                    className="studio-input"
                    value={form.lesson}
                    onChange={(e) => setForm((prev) => ({ ...prev, lesson: e.target.value }))}
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
                          sceneCount: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    >
                      <option value="">Auto (Optimized for duration)</option>
                      <option value="3">3 Scenes</option>
                      <option value="4">4 Scenes</option>
                      <option value="5">5 Scenes</option>
                      <option value="6">6 Scenes</option>
                    </select>
                  </div>
                  <div className="studio-field">
                    <label htmlFor="story-content-restrictions">Things to Avoid</label>
                    <input
                      id="story-content-restrictions"
                      type="text"
                      className="studio-input"
                      value={form.contentRestrictions || ""}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, contentRestrictions: e.target.value }))
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
                  <span className="card-heading-meta">Tailor pacing, audience & art style</span>
                </div>
              </div>
            </div>

            {/* Target Audience Segmented Buttons */}
            <div className="studio-control-block">
              <label className="studio-label">Target Audience / Age</label>
              <div className="studio-segmented-group cols-2" role="radiogroup" aria-label="Target Audience">
                {[
                  { id: "2-4 years", label: "2–4 yrs", icon: "👶", desc: "Toddlers" },
                  { id: "4-7 years", label: "4–7 yrs", icon: "🧒", desc: "Early Readers" },
                  { id: "7-10 years", label: "7–10 yrs", icon: "🎒", desc: "Big Kids" },
                  { id: "Family", label: "All Ages", icon: "👨‍👩‍👧", desc: "Family" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={form.ageGroup === item.id}
                    className={`segmented-card ${form.ageGroup === item.id ? "active" : ""}`}
                    onClick={() => setForm((prev) => ({ ...prev, ageGroup: item.id }))}
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
              <div className="studio-segmented-group cols-3" role="radiogroup" aria-label="Pacing & Duration">
                {[
                  { id: 30, label: "30s", icon: "⚡", desc: "~3 scenes" },
                  { id: 60, label: "60s", icon: "⏱️", desc: "~4 scenes" },
                  { id: 120, label: "2 min", icon: "🎬", desc: "~5–6 scenes" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={form.desiredDurationSeconds === item.id}
                    className={`segmented-card ${form.desiredDurationSeconds === item.id ? "active" : ""}`}
                    onClick={() => setForm((prev) => ({ ...prev, desiredDurationSeconds: item.id }))}
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
              <div className="studio-genre-grid" role="radiogroup" aria-label="Genre & Theme">
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
                    onClick={() => setForm((prev) => ({ ...prev, genre: g.id }))}
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
                  <label htmlFor="studio-language-select" className="studio-label">Language</label>
                  <select
                    id="studio-language-select"
                    className="studio-input"
                    value={form.language}
                    onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))}
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Japanese">Japanese</option>
                    <option value="Hindi">Hindi</option>
                  </select>
                </div>
                <div className="studio-field">
                  <label htmlFor="studio-visual-style-select" className="studio-label">Visual Style</label>
                  <select
                    id="studio-visual-style-select"
                    className="studio-input"
                    value={form.visualStyle}
                    onChange={(e) => setForm((prev) => ({ ...prev, visualStyle: e.target.value }))}
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
                  Generates <strong>~{estimatedScenes} scenes</strong> • {form.desiredDurationSeconds}s • {form.ageGroup} • {form.visualStyle}
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

      {/* Modal for browsing character library */}
      <CharacterPickerModal
        isOpen={isPickerOpen}
        characters={characters.map((c) => ({ ...c, description: c.visualDescription }))}
        selectedIds={form.characterIds}
        onToggle={handleToggleCharacter}
        onClose={() => setIsPickerOpen(false)}
        onConfirm={() => setIsPickerOpen(false)}
      />
    </div>
  );
}
