import { useState } from 'react';
import { Character } from '../../services/character.service';

interface CharacterFormProps {
  character?: Character | null;
  onSubmit: (data: {
    name: string;
    species: string;
    personality: string;
    visualDescription: string;
    distinctiveFeatures?: string;
  }) => void;
  onCancel: () => void;
}

export default function CharacterForm({ character, onSubmit, onCancel }: CharacterFormProps) {
  const [name, setName] = useState(character?.name || '');
  const [species, setSpecies] = useState(character?.species || '');
  const [personality, setPersonality] = useState(character?.personality || '');
  const [visualDescription, setVisualDescription] = useState(character?.visualDescription || '');
  const [distinctiveFeatures, setDistinctiveFeatures] = useState(character?.distinctiveFeatures || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!name || !species || !personality || !visualDescription) {
      alert('Please fill in all required fields');
      return;
    }

    onSubmit({
      name,
      species,
      personality,
      visualDescription,
      distinctiveFeatures,
    });
  }

  return (
    <div className="character-form">
      <div className="character-form-header">
        <h2>{character ? 'Edit Character' : 'Create Character'}</h2>
        <button className="character-form-close" onClick={onCancel}>✕</button>
      </div>
      
      <form onSubmit={handleSubmit} className="character-form-layout">
        <div className="character-form-column">
          <div className="character-form-section">
            <h3>Character Identity</h3>
            <label>
              Name *
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Lily"
                required
              />
            </label>

            <label>
              Species *
              <input
                type="text"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                placeholder="e.g., Rabbit"
                required
              />
            </label>

            <label>
              Personality *
              <input
                type="text"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="e.g., Gentle, clever, curious"
                required
              />
            </label>
          </div>
        </div>

        <div className="character-form-column">
          <div className="character-form-section">
            <h3>Visual Identity</h3>
            <label>
              Visual Description *
              <textarea
                value={visualDescription}
                onChange={(e) => setVisualDescription(e.target.value)}
                placeholder="e.g., Small white rabbit with long ears, blue eyes, green scarf and pink nose"
                rows={4}
                required
              />
            </label>

            <label>
              Distinctive Features
              <input
                type="text"
                value={distinctiveFeatures}
                onChange={(e) => setDistinctiveFeatures(e.target.value)}
                placeholder="e.g., Green scarf"
              />
            </label>
          </div>
        </div>

        <div className="character-form-footer">
          <button type="button" className="character-form-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary character-form-submit">
            {character ? 'Update Character' : 'Create Character'}
          </button>
        </div>
      </form>
    </div>
  );
}
