import React from "react";
import { Character } from "../../services/character.service";
import { DeleteButton } from '../common/DeleteButton';
import { UserIcon, EditIcon, SparklesIcon } from '../common/Icons';

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
            <div className="placeholder-icon">
              <UserIcon size={36} color="var(--color-text-faint)" />
            </div>
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
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onEdit}
                title={`Edit ${character.name}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <EditIcon size={13} />
                <span>Edit</span>
              </button>
            )}
            {onDelete && (
              <DeleteButton
                onClick={onDelete}
                title={`Delete ${character.name}`}
                ariaLabel={`Delete character ${character.name}`}
                size="sm"
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
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onGenerateReference}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <SparklesIcon size={14} />
              <span>Generate Image</span>
            </button>
          )}
          {onGenerateReference && character.referenceImageUrl && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onGenerateReference}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <SparklesIcon size={14} />
              <span>Regenerate Image</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
