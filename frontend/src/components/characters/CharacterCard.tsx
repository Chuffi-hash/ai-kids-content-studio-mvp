import { Character } from '../../services/character.service';

interface CharacterCardProps {
  character: Character;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function CharacterCard({ character, onEdit, onDelete }: CharacterCardProps) {
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
              <button className="character-action-btn" onClick={onEdit} title="Edit">
                Edit
              </button>
            )}
            {onDelete && (
              <button className="character-action-btn character-action-btn-delete" onClick={onDelete} title="Delete">
                Delete
              </button>
            )}
          </div>
        </div>
        <div className="character-card-body">
          <div className="character-card-field">
            <span className="character-field-label">Species</span>
            <span className="character-field-value">{character.species}</span>
          </div>
          <div className="character-card-field">
            <span className="character-field-label">Personality</span>
            <span className="character-field-value">{character.personality}</span>
          </div>
          <div className="character-card-description">
            {character.visualDescription}
          </div>
          {character.distinctiveFeatures && (
            <div className="character-card-features">
              {character.distinctiveFeatures}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
