import { useState } from "react";
import { Character } from "../../services/character.service";
import StorySettings from "./StorySettings";
import StoryIdeaInput from "./StoryIdeaInput";
import CharacterSelector from "./CharacterSelector";
import { CharacterPickerModal } from "./CharacterPickerModal";
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

  function handleGenerate() {
    const newErrors: { topic?: string } = {};

    if (!form.topic.trim()) {
      newErrors.topic = "Please enter a story idea to continue.";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    onGenerate(form);
  }

  return (
    <div className="story-builder">
      <div className="story-builder-header">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={loading}
          style={{ padding: '10px 22px', fontSize: '15px', fontWeight: 600 }}
        >
          {loading ? "Generating Animated Story..." : "✨ Generate Story"}
        </button>
      </div>

      <div className="story-builder-content">
        {/* 1. Core Story Idea (Required) */}
        <section className="story-builder-section">
          <div className="story-builder-section-header">
            <div>
              <h2>Story Idea or Prompt *</h2>
              <p className="muted">Describe your story concept in a sentence or paragraph.</p>
            </div>
          </div>
          <div>
            <StoryIdeaInput
              value={form.topic}
              onChange={(value) => {
                setForm((prev) => ({ ...prev, topic: value }));
                setErrors((prev) => ({ ...prev, topic: undefined }));
              }}
            />
            {errors.topic && <div className="field-error" style={{ color: '#ef4444', fontSize: '13px', marginTop: '6px' }}>{errors.topic}</div>}
          </div>
        </section>

        {/* 2. Core Story Settings (Required & Essential) */}
        <section className="story-builder-section">
          <div className="story-builder-section-header">
            <div>
              <h2>Story Audience, Timing & Style</h2>
              <p className="muted">Set the target age, duration, language, and art genre.</p>
            </div>
          </div>
          <StorySettings
            ageGroup={form.ageGroup}
            durationSeconds={form.desiredDurationSeconds}
            language={form.language}
            genre={form.genre}
            visualStyle={form.visualStyle}
            onAgeGroupChange={(value) => setForm((prev) => ({ ...prev, ageGroup: value }))}
            onDurationChange={(value) => setForm((prev) => ({ ...prev, desiredDurationSeconds: value }))}
            onLanguageChange={(value) => setForm((prev) => ({ ...prev, language: value }))}
            onGenreChange={(value) => setForm((prev) => ({ ...prev, genre: value }))}
            onVisualStyleChange={(value) => setForm((prev) => ({ ...prev, visualStyle: value }))}
          />
        </section>

        {/* 3. Cast Existing Characters (Optional) */}
        <section className="story-builder-section">
          <div className="story-builder-section-header">
            <div>
              <h2>Starring Characters (Optional)</h2>
              <p className="muted">Pick heroes from your Character Library or let the engine create new ones.</p>
            </div>
          </div>
          <CharacterSelector
            characters={characters.map((c) => ({ ...c, description: c.visualDescription }))}
            selectedIds={form.characterIds}
            onToggle={handleToggleCharacter}
            onOpenPicker={() => setIsPickerOpen(true)}
          />
        </section>

        {/* 4. Advanced Story Controls (Toggleable) */}
        <section className="story-builder-section">
          <div
            className="story-builder-section-header"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ cursor: 'pointer' }}
          >
            <div>
              <h2>Optional Customization (Title, Lesson, Tone, Scenes)</h2>
              <p className="muted">Fine-tune working title, tone, scene count, and moral takeaway.</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              onClick={(e) => {
                e.stopPropagation();
                setShowAdvanced(!showAdvanced);
              }}
            >
              {showAdvanced ? "▲ Hide Options" : "▼ More Options"}
            </button>
          </div>

          {showAdvanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  Working Title
                  <input
                    type="text"
                    value={form.title || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Milo and the Glowing Garden"
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated, #0d1527)', color: '#fff' }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  Story Tone
                  <select
                    value={form.tone || "cheerful"}
                    onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated, #0d1527)', color: '#fff' }}
                  >
                    <option value="cheerful">Cheerful & Warm</option>
                    <option value="funny">Funny & Silly</option>
                    <option value="exciting">Exciting & Adventurous</option>
                    <option value="gentle">Gentle & Bedtime</option>
                    <option value="educational">Educational & Curious</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  Preferred Scene Count
                  <select
                    value={form.sceneCount || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, sceneCount: e.target.value ? Number(e.target.value) : undefined }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated, #0d1527)', color: '#fff' }}
                  >
                    <option value="">Auto (Optimized for duration)</option>
                    <option value="3">3 Scenes</option>
                    <option value="4">4 Scenes</option>
                    <option value="5">5 Scenes</option>
                    <option value="6">6 Scenes</option>
                    <option value="8">8 Scenes</option>
                  </select>
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                Moral or Lesson
                <textarea
                  value={form.lesson}
                  onChange={(e) => setForm((prev) => ({ ...prev, lesson: e.target.value }))}
                  placeholder="e.g. Helping others makes our community stronger."
                  rows={2}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated, #0d1527)', color: '#fff', resize: 'vertical' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                Content Restrictions / Things to Avoid
                <input
                  type="text"
                  value={form.contentRestrictions || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, contentRestrictions: e.target.value }))}
                  placeholder="e.g. No scary monsters, no loud noises, no dark forests"
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface-elevated, #0d1527)', color: '#fff' }}
                />
              </label>
            </div>
          )}
        </section>
      </div>

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
