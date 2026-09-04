import { useState } from 'react';
import { StorybookStory } from '../../services/storybook.service';
import StorySettings from './StorySettings';
import CharacterSelector from '../characters/CharacterSelector';

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
      <form onSubmit={handleSubmit}>
        <div className="form-card">
          <div className="form-card-header">
            <h3>Edit Story Settings</h3>
          </div>
          
          <div className="form-card-body">
            <StorySettings
              audience={form.audience}
              genre={form.genre}
              visualStyle={form.visualStyle}
              onAudienceChange={(value) => setForm({ ...form, audience: value })}
              onGenreChange={(value) => setForm({ ...form, genre: value })}
              onVisualStyleChange={(value) => setForm({ ...form, visualStyle: value })}
            />
            
            {characters.length > 0 && (
              <div className="form-field" style={{ marginTop: '20px' }}>
                <label>Characters</label>
                <div className="character-selection-grid">
                  {characters.map((character) => (
                    <label key={character.id} className="character-selection-item">
                      <input
                        type="checkbox"
                        checked={form.characterIds.includes(character.id)}
                        onChange={() => handleToggleCharacter(character.id)}
                      />
                      <span className="character-name">{character.name}</span>
                      <span className="character-meta">{character.species}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="form-card-footer">
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Save Changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
