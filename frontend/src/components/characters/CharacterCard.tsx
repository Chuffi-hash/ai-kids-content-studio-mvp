import { Character } from "../../services/character.service";
import { DeleteButton } from '../common/DeleteButton';

interface CharacterCardProps {
  character: Character;
  onEdit?: () => void;
  onDelete?: () => void;
  onGenerateReference?: () => void;
}

export default function CharacterCard({
  character,
  onEdit,
  onDelete,
  onGenerateReference,
}: CharacterCardProps) {
  return (
    <div className="character-card">
      <div className="character-card-image">
        {character.referenceImageUrl ? (
          <img 
            src={character.referenceImageUrl} 
            alt={character.name}
            className="character-reference-image"
          />
        ) : (
          <div className="character-image-placeholder">
            <div className="placeholder-icon">🖼️</div>
            <div className="placeholder-text">Character Reference</div>
            <div className="placeholder-subtext">Generate an image to use this character as a visual reference in scenes</div>
          </div>
        )}
      </div>
      <div className="character-card-content">
        <div className="character-card-header">
          <h3>{character.name}</h3>
          <div className="character-card-actions">
            {onEdit && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={onEdit}
                title="Edit"
              >
                Edit
              </button>
            )}
            {onDelete && (
              <DeleteButton
                onClick={onDelete}
                title="Delete character"
                aria-label="Delete character"
              />
            )}
          </div>
        </div>
        <div className="character-card-meta">
          <span className="character-tag">{character.species}</span>
          <span className="character-tag">{character.personality}</span>
        </div>
        {character.visualDescription && (
          <div className="character-card-description-section">
            <label>Visual Description</label>
            <p className="character-card-description">
              {character.visualDescription}
            </p>
          </div>
        )}
        <div className="character-card-footer">
          {onGenerateReference && !character.referenceImageUrl && (
            <button
              className="btn btn-primary btn-sm"
              onClick={onGenerateReference}
            >
              Generate Image
            </button>
          )}
          {onGenerateReference && character.referenceImageUrl && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onGenerateReference}
            >
              Regenerate Image
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
