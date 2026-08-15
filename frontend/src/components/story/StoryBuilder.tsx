import { useState } from "react";
import { Character } from "../../services/character.service";
import StorySettings from "./StorySettings";
import StoryIdeaInput from "./StoryIdeaInput";
import CharacterSelector from "./CharacterSelector";
import { CharacterPickerModal } from "./CharacterPickerModal";
import "./story.css";

interface StoryFormState {
  topic: string;
  audience: string;
  genre: string;
  visualStyle: string;
  lesson: string;
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
  audience: "Children",
  genre: "Adventure",
  visualStyle: "Anime",
  lesson: "",
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
        <div>
          <h1>Create Story</h1>
          <p className="muted">Create and configure your story</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Story"}
        </button>
      </div>

      <section className="story-builder-section">
        <div className="story-builder-section-header">
          <h2>Story Settings</h2>
        </div>
        <StorySettings
          audience={form.audience}
          genre={form.genre}
          visualStyle={form.visualStyle}
          onAudienceChange={(value) => setForm((prev) => ({ ...prev, audience: value }))}
          onGenreChange={(value) => setForm((prev) => ({ ...prev, genre: value }))}
          onVisualStyleChange={(value) => setForm((prev) => ({ ...prev, visualStyle: value }))}
        />
      </section>

      <section className="story-builder-section">
        <div className="story-builder-section-header">
          <h2>Story Idea</h2>
        </div>
        <div>
          <StoryIdeaInput value={form.topic} onChange={(value) => {
            setForm((prev) => ({ ...prev, topic: value }));
            setErrors((prev) => ({ ...prev, topic: undefined }));
          }} />
          {errors.topic && <div className="field-error">{errors.topic}</div>}
        </div>
      </section>

      <section className="story-builder-section">
        <div className="story-builder-section-header">
          <h2>Optional Purpose</h2>
        </div>
        <div className="story-purpose-input">
          <textarea
            value={form.lesson}
            onChange={(e) => setForm((prev) => ({ ...prev, lesson: e.target.value }))}
            placeholder="What lesson or message should this story convey? (optional)"
            rows={3}
          />
        </div>
      </section>

      <section className="story-builder-section">
        <div className="story-builder-section-header">
          <h2>Characters</h2>
        </div>
        <CharacterSelector
          characters={characters.map(c => ({ ...c, description: c.visualDescription }))}
          selectedIds={form.characterIds}
          onToggle={handleToggleCharacter}
          onOpenPicker={() => setIsPickerOpen(true)}
        />
      </section>

      <CharacterPickerModal
        isOpen={isPickerOpen}
        characters={characters.map(c => ({ ...c, description: c.visualDescription }))}
        selectedIds={form.characterIds}
        onToggle={handleToggleCharacter}
        onClose={() => setIsPickerOpen(false)}
        onConfirm={() => setIsPickerOpen(false)}
      />
    </div>
  );
}
