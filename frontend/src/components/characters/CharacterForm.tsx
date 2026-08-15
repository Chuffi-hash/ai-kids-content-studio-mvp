import { useState } from "react";
import { Character } from "../../services/character.service";

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

export default function CharacterForm({
  character,
  onSubmit,
  onCancel,
}: CharacterFormProps) {
  const [name, setName] = useState(character?.name || "");
  const [species, setSpecies] = useState(character?.species || "");
  const [personality, setPersonality] = useState(character?.personality || "");
  const [visualDescription, setVisualDescription] = useState(
    character?.visualDescription || "",
  );
  const [distinctiveFeatures, setDistinctiveFeatures] = useState(
    character?.distinctiveFeatures || "",
  );
  const [errors, setErrors] = useState<{
    name?: string;
    species?: string;
    personality?: string;
    visualDescription?: string;
  }>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: {
      name?: string;
      species?: string;
      personality?: string;
      visualDescription?: string;
    } = {};

    if (!name.trim()) {
      newErrors.name = "Name is required.";
    }
    if (!species.trim()) {
      newErrors.species = "Species is required.";
    }
    if (!personality.trim()) {
      newErrors.personality = "Personality is required.";
    }
    if (!visualDescription.trim()) {
      newErrors.visualDescription = "Visual description is required.";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
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
        <h2>{character ? "Edit Character" : "Create Character"}</h2>
        <button
          className="character-form-close"
          onClick={onCancel}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="character-form-layout">
        <div className="character-form-section">
          <h3>Character Identity</h3>
          <div className="form-stack">
            <label>
              Name *
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="e.g., Lily"
                required
              />
              {errors.name && <div className="field-error">{errors.name}</div>}
            </label>

            <label>
              Species *
              <input
                type="text"
                value={species}
                onChange={(e) => {
                  setSpecies(e.target.value);
                  setErrors((prev) => ({ ...prev, species: undefined }));
                }}
                placeholder="e.g., Rabbit"
                required
              />
              {errors.species && <div className="field-error">{errors.species}</div>}
            </label>

            <label>
              Personality *
              <input
                type="text"
                value={personality}
                onChange={(e) => {
                  setPersonality(e.target.value);
                  setErrors((prev) => ({ ...prev, personality: undefined }));
                }}
                placeholder="e.g., Gentle, clever, curious"
                required
              />
              {errors.personality && <div className="field-error">{errors.personality}</div>}
            </label>
          </div>
        </div>

        <div className="character-form-section">
          <h3>Visual Identity</h3>
          <div className="form-stack">
            <label>
              Visual Description *
              <textarea
                value={visualDescription}
                onChange={(e) => {
                  setVisualDescription(e.target.value);
                  setErrors((prev) => ({ ...prev, visualDescription: undefined }));
                }}
                placeholder="e.g., Small white rabbit with long ears, blue eyes, green scarf and pink nose"
                rows={3}
                required
              />
              {errors.visualDescription && <div className="field-error">{errors.visualDescription}</div>}
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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {character ? "Update Character" : "Create Character"}
          </button>
        </div>
      </form>
    </div>
  );
}
