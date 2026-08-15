import { Character } from "../../services/character.service";
import { DeleteButton } from '../common/DeleteButton';

interface CharacterCardProps {
  character: Character;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function CharacterCard({
  character,
  onEdit,
  onDelete,
}: CharacterCardProps) {
  return (
    <div className="character-card">
      <div className="character-card-avatar">
        <div className="character-avatar-placeholder">
          {character.name.charAt(0).toUpperCase()}
        </div>
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
          <p className="character-card-description">
            {character.visualDescription}
          </p>
        )}
        {character.distinctiveFeatures && (
          <div className="character-card-features">
            {character.distinctiveFeatures}
          </div>
        )}
      </div>
    </div>
  );
}
