import React, { useState } from "react";
import { Character } from "../../services/character.service";
import { CharacterPickerModal } from "./CharacterPickerModal";
import { SparklesIcon, PlusIcon, CloseIcon } from "../common/Icons";
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

const INSPIRATION_CHIPS = [
  {
    emoji: "🚀",
    label: "Space Explorer",
    prompt: "Pip the bear and Sammy build a cardboard rocket that flies them to a glowing candy planet.",
    genre: "Adventure",
    ageGroup: "4-7 years",
  },
  {
    emoji: "🌲",
    label: "Secret Treehouse",
    prompt: "In the whispering woods, Pip discovers a hidden treehouse full of curious musical instruments and woodland friends.",
    genre: "Adventure",
    ageGroup: "4-7 years",
  },
  {
    emoji: "🎨",
    label: "Painting Robot",
    prompt: "Sparky the little robot is shy about showing his colorful paintings until his friends help him create a rainbow mural.",
    genre: "Friendship",
    ageGroup: "4-7 years",
  },
  {
    emoji: "🦕",
    label: "Gentle Dino",
    prompt: "A tiny gentle dinosaur is nervous on his first day at preschool until a kind bear shares his building blocks.",
    genre: "Educational",
    ageGroup: "2-4 years",
  },
  {
    emoji: "🌙",
    label: "Cloud Lullaby",
    prompt: "A sleepy little bear floats on a soft silver cloud, waving goodnight to the twinkling moon and gentle star friends.",
    genre: "Bedtime",
    ageGroup: "2-4 years",
  },
  {
    emoji: "🌊",
    label: "Ocean Quest",
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
    setErrors((prev) => ({ ...prev, topic: undefined }));
  }

  function handleGenerate() {
    const newErrors: { topic?: string } = {};

    if (!form.topic.trim()) {
      newErrors.topic = "Please enter a story concept or pick an inspiration spark.";
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
      {/* 1. Creative Spark Bar */}
      <div className="story-spark-bar">
        <div className="spark-bar-title">
          <span className="spark-bar-icon">✨</span>
          <span>Story Sparks:</span>
        </div>
        <div className="spark-chips-container">
          {INSPIRATION_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              className="spark-chip"
              onClick={() => handleSelectInspiration(chip)}
              title={chip.prompt}
            >
              <span className="chip-emoji">{chip.emoji}</span>
              <span className="chip-label">{chip.label}</span>
            </button>
          ))}
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
                <h3>Story Concept or Prompt *</h3>
              </div>
              <span className="char-badge">{form.topic.length} chars</span>
            </div>

            <textarea
              className="studio-textarea"
              value={form.topic}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, topic: e.target.value }));
                setErrors((prev) => ({ ...prev, topic: undefined }));
              }}
              placeholder="e.g., Pip the gentle bear and Sammy find a glowing map in the whispering woods that leads to a secret musical treehouse..."
              rows={3}
            />

            {errors.topic && (
              <div className="studio-error-badge">⚠️ {errors.topic}</div>
            )}
          </div>

          {/* Card 2: Starring Cast Tray */}
          <div className="studio-card cast-card">
            <div className="studio-card-header">
              <div className="card-heading">
                <span className="step-pill">2</span>
                <h3>Starring Cast ({form.characterIds.length} chosen)</h3>
              </div>
              <button
                type="button"
                className="studio-btn-subtle"
                onClick={() => setIsPickerOpen(true)}
              >
                + Browse Library ({characters.length})
              </button>
            </div>

            <div className="cast-avatars-tray">
              {characters.slice(0, 6).map((c) => {
                const isSelected = form.characterIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className={`cast-avatar-pill ${isSelected ? "selected" : ""}`}
                    onClick={() => handleToggleCharacter(c.id)}
                    title={`${c.name} (${c.species}) • Click to ${isSelected ? "remove" : "cast"}`}
                  >
                    <div className="cast-avatar-bubble">
                      {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                    </div>
                    <span className="cast-avatar-name">{c.name}</span>
                    {isSelected && <span className="cast-badge-check">✓</span>}
                  </div>
                );
              })}

              {characters.length === 0 && (
                <div className="cast-empty-notice">
                  <span>🎭 No library characters yet. AI will automatically design characters tailored to your story!</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Optional Fine-Tuning Drawer */}
          <div className="studio-card finetune-card">
            <div
              className="studio-card-header clickable"
              onClick={() => setShowAdvanced(!showAdvanced)}
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
                    <label>Working Title (Optional)</label>
                    <input
                      type="text"
                      className="studio-input"
                      value={form.title || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Milo and the Starlit Garden"
                    />
                  </div>
                  <div className="studio-field">
                    <label>Story Tone</label>
                    <select
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
                  <label>Moral Lesson / Takeaway</label>
                  <input
                    type="text"
                    className="studio-input"
                    value={form.lesson}
                    onChange={(e) => setForm((prev) => ({ ...prev, lesson: e.target.value }))}
                    placeholder="e.g. Sharing toys and helping friends in need makes everything more fun"
                  />
                </div>

                <div className="finetune-two-col">
                  <div className="studio-field">
                    <label>Scene Count</label>
                    <select
                      className="studio-input"
                      value={form.sceneCount || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, sceneCount: e.target.value ? Number(e.target.value) : undefined }))}
                    >
                      <option value="">Auto (Optimized for duration)</option>
                      <option value="3">3 Scenes</option>
                      <option value="4">4 Scenes</option>
                      <option value="5">5 Scenes</option>
                      <option value="6">6 Scenes</option>
                    </select>
                  </div>
                  <div className="studio-field">
                    <label>Things to Avoid</label>
                    <input
                      type="text"
                      className="studio-input"
                      value={form.contentRestrictions || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, contentRestrictions: e.target.value }))}
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
                <h3>Director Settings</h3>
              </div>
            </div>

            {/* Target Audience Segmented Buttons */}
            <div className="studio-control-block">
              <label className="studio-label">Target Audience / Age</label>
              <div className="studio-segmented-group cols-2">
                {[
                  { id: "2-4 years", label: "2–4 yrs", icon: "👶", desc: "Toddlers" },
                  { id: "4-7 years", label: "4–7 yrs", icon: "🧒", desc: "Early Readers" },
                  { id: "7-10 years", label: "7–10 yrs", icon: "🎒", desc: "Big Kids" },
                  { id: "Family", label: "All Ages", icon: "👨‍👩‍👧", desc: "Family" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
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
              <div className="studio-segmented-group cols-3">
                {[
                  { id: 30, label: "30s", icon: "⚡", desc: "~3 scenes" },
                  { id: 60, label: "60s", icon: "⏱️", desc: "~4 scenes" },
                  { id: 120, label: "2 min", icon: "🎬", desc: "~5–6 scenes" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
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
              <div className="studio-genre-grid">
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
                  <label className="studio-label">Language</label>
                  <select
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
                  <label className="studio-label">Visual Style</label>
                  <select
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
                  Generates <strong>{estimatedScenes} scenes</strong> • {form.desiredDurationSeconds}s • {form.ageGroup}
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
                    <span className="studio-spinner" />
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
