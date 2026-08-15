import { useState } from 'react';
import { StorybookStory } from '../../services/storybook.service';
import StorySettings from './StorySettings';
import CharacterSelector from './CharacterSelector';
import { CharacterPickerModal } from './CharacterPickerModal';

interface StoryCharacter {
  id: string;
  name: string;
  species: string;
  personality: string;
  description: string;
}

interface StoryFormState {
  topic: string;
  audience: string;
  genre: string;
  visualStyle: string;
  lesson: string;
  characterIds: string[];
}

interface StoryEditFormProps {
  story: {
    topic?: string | null;
    audience?: string | null;
    genre?: string | null;
    visualStyle?: string | null;
    lesson?: string | null;
  };
  characters: StoryCharacter[];
  onSave: (data: StoryFormState) => void;
  onCancel: () => void;
}

export function StoryEditForm({ story, characters, onSave, onCancel }: StoryEditFormProps) {
  const [form, setForm] = useState<StoryFormState>({
    topic: story.topic || '',
    audience: story.audience || '',
    genre: story.genre || '',
    visualStyle: story.visualStyle || '',
    lesson: story.lesson || '',
    characterIds: [],
  });
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [errors, setErrors] = useState<{ topic?: string }>({});

  function handleToggleCharacter(id: string) {
    setForm((prev) => ({
      ...prev,
      characterIds: prev.characterIds.includes(id)
        ? prev.characterIds.filter((c) => c !== id)
        : [...prev.characterIds, id],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: { topic?: string } = {};

    if (!form.topic.trim()) {
      newErrors.topic = "Topic is required.";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    onSave(form);
  }

  return (
    <div className="story-edit-form">
      <div className="form-header">
        <h2>Edit Story Settings</h2>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h3>Generation Settings</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>
                Topic / Story Idea
                <textarea
                  value={form.topic}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, topic: e.target.value }));
                    setErrors((prev) => ({ ...prev, topic: undefined }));
                  }}
                  placeholder="Describe your story idea..."
                  rows={3}
                />
                {errors.topic && <div className="field-error">{errors.topic}</div>}
              </label>
            </div>

            <div className="form-field">
              <label>
                Audience
                <select value={form.audience} onChange={(e) => setForm((prev) => ({ ...prev, audience: e.target.value }))}>
                  <option value="">Select audience...</option>
                  <option value="Children">Children</option>
                  <option value="Teen">Teen</option>
                  <option value="Adult">Adult</option>
                  <option value="General">General Audience</option>
                </select>
              </label>
            </div>

            <div className="form-field">
              <label>
                Genre
                <select value={form.genre} onChange={(e) => setForm((prev) => ({ ...prev, genre: e.target.value }))}>
                  <option value="">Select genre...</option>
                  <option>Adventure</option>
                  <option>Fantasy</option>
                  <option>Sci-Fi</option>
                  <option>Mystery</option>
                  <option>Romance</option>
                  <option>Horror</option>
                  <option>Comedy</option>
                  <option>Drama</option>
                  <option>Educational</option>
                  <option>Custom</option>
                </select>
              </label>
            </div>

            <div className="form-field">
              <label>
                Visual Style
                <select value={form.visualStyle} onChange={(e) => setForm((prev) => ({ ...prev, visualStyle: e.target.value }))}>
                  <option value="">Select visual style...</option>
                  <option>Anime</option>
                  <option>Cartoon</option>
                  <option>Storybook</option>
                  <option>Realistic</option>
                  <option>Cinematic</option>
                  <option>Watercolor</option>
                  <option>Manga</option>
                  <option>Comic</option>
                  <option>3D</option>
                  <option>Custom</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Lesson / Purpose</h3>
          <div className="form-field">
            <label>
              <textarea
                value={form.lesson}
                onChange={(e) => setForm((prev) => ({ ...prev, lesson: e.target.value }))}
                placeholder="What lesson or message should this story convey?"
                rows={3}
              />
            </label>
          </div>
        </div>

        <div className="form-section">
          <h3>Characters</h3>
          <CharacterSelector
            characters={characters}
            selectedIds={form.characterIds}
            onToggle={handleToggleCharacter}
            onOpenPicker={() => setIsPickerOpen(true)}
          />
        </div>

        <div className="form-footer">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save Changes
          </button>
        </div>
      </form>

      <CharacterPickerModal
        isOpen={isPickerOpen}
        characters={characters}
        selectedIds={form.characterIds}
        onToggle={handleToggleCharacter}
        onClose={() => setIsPickerOpen(false)}
        onConfirm={() => setIsPickerOpen(false)}
      />
    </div>
  );
}
