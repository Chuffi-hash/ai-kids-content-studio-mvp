import { useState } from "react";
import { Character } from "../../services/character.service";
import { CloseIcon } from "../common/Icons";

interface CharacterFormProps {
  character?: Character | null;
  onSubmit: (data: {
    name: string;
    species: string;
    personality: string;
    visualDescription: string;
    distinctiveFeatures?: string;
    canonicalAppearance?: any;
  }) => void;
  onCancel: () => void;
  onOpenBuilder?: (character?: Character | null) => void;
}

export default function CharacterForm({
  character,
  onSubmit,
  onCancel,
  onOpenBuilder,
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
  const [gender, setGender] = useState(character?.canonicalAppearance?.gender || "");
  const [age, setAge] = useState(character?.canonicalAppearance?.age || "");
  const [body, setBody] = useState(character?.canonicalAppearance?.body || "");
  const [skinOrFur, setSkinOrFur] = useState(character?.canonicalAppearance?.skinOrFur || "");
  const [hair, setHair] = useState(character?.canonicalAppearance?.hair || "");
  const [eyes, setEyes] = useState(character?.canonicalAppearance?.eyes || "");
  const [clothing, setClothing] = useState(character?.canonicalAppearance?.clothing || "");
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

    const canonicalAppearance: any = {};
    if (gender) canonicalAppearance.gender = gender;
    if (age) canonicalAppearance.age = age;
    if (body) canonicalAppearance.body = body;
    if (skinOrFur) canonicalAppearance.skinOrFur = skinOrFur;
    if (hair) canonicalAppearance.hair = hair;
    if (eyes) canonicalAppearance.eyes = eyes;
    if (clothing) canonicalAppearance.clothing = clothing;

    onSubmit({
      name,
      species,
      personality,
      visualDescription,
      distinctiveFeatures,
      canonicalAppearance: Object.keys(canonicalAppearance).length > 0 ? canonicalAppearance : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="character-form">
      <div className="character-form-header">
        <h2>{character ? "Edit Character" : "Create Character"}</h2>
        <button
          className="character-form-close"
          onClick={onCancel}
          aria-label="Close"
          type="button"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="character-form-layout character-form-body">
        {onOpenBuilder && (
          <div style={{
            margin: '0 0 16px',
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(168, 85, 247, 0.2))',
            border: '1px solid rgba(139, 92, 246, 0.4)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontWeight: 600, color: '#c4b5fd', fontSize: '13px' }}>
                🎨 Build & Customize Visually in Vector Rig Studio
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                Design head, hair, neck, torso, and limbs with real-time test animations.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flexShrink: 0, padding: '6px 12px', fontSize: '12px' }}
              onClick={() => {
                onCancel();
                onOpenBuilder(character);
              }}
            >
              Open Rig Studio
            </button>
          </div>
        )}

        <div className="character-form-section">
          <h3>Basic Identity</h3>
          <div className="form-grid">
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
          </div>
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

        <div className="character-form-section">
          <h3>Visual Identity</h3>
          <div className="form-grid">
            <label>
              Gender
              <input
                type="text"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                placeholder="e.g., Female, Male, Non-binary"
              />
            </label>

            <label>
              Age
              <input
                type="text"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g., Young child, Teenager, Adult"
              />
            </label>

            <label>
              Body Type
              <input
                type="text"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="e.g., Small and round, Tall and slender"
              />
            </label>

            <label>
              Skin/Fur Color
              <input
                type="text"
                value={skinOrFur}
                onChange={(e) => setSkinOrFur(e.target.value)}
                placeholder="e.g., White fur, Brown skin, Green scales"
              />
            </label>

            <label>
              Hair
              <input
                type="text"
                value={hair}
                onChange={(e) => setHair(e.target.value)}
                placeholder="e.g., Long brown hair, Short red hair, No hair"
              />
            </label>

            <label>
              Eyes
              <input
                type="text"
                value={eyes}
                onChange={(e) => setEyes(e.target.value)}
                placeholder="e.g., Large blue eyes, Small green eyes"
              />
            </label>
          </div>
          <label>
            Clothing
            <input
              type="text"
              value={clothing}
              onChange={(e) => setClothing(e.target.value)}
              placeholder="e.g., Blue dress, Red shirt and pants"
            />
          </label>
        </div>

        <div className="character-form-section">
          <h3>Visual Description</h3>
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
  );
}
