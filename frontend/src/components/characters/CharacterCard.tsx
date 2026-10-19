import React from "react";
import { Character } from "../../services/character.service";
import { DeleteButton } from '../common/DeleteButton';
import { UserIcon, EditIcon } from '../common/Icons';
import { VectorCharacterRenderer } from '../editor/animation/VectorCharacterRenderer';
import { buildRigFromAppearance } from '../../utils/customCharacterRig';

interface CharacterCardProps {
  character: Character;
  onEdit?: () => void;
  onCustomize?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export default function CharacterCard({
  character,
  onEdit,
  onCustomize,
  onDuplicate,
  onDelete,
}: CharacterCardProps) {
  const hasCustomRig = character.canonicalAppearance?.version === 1;

  return (
    <div className="character-card">
      <div className="character-card-image" style={{ background: hasCustomRig ? '#080d1a' : undefined }}>
        {hasCustomRig ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="-90 -160 180 220" style={{ width: '90%', height: '90%' }}>
              <VectorCharacterRenderer
                rig={buildRigFromAppearance(character.id, character.name, character.canonicalAppearance)}
                pose={{
                  x: 0,
                  y: 0,
                  scale: 0.85,
                  rotation: 0,
                  flipX: false,
                  torsoBobY: 0,
                  torsoAngle: 0,
                  headAngle: 0,
                  leftArmAngle: 0,
                  rightArmAngle: 0,
                  leftForearmAngle: 0,
                  rightForearmAngle: 0,
                  leftLegAngle: 0,
                  rightLegAngle: 0,
                  chestScaleY: 1,
                  activeAction: 'idle',
                  expression: 'neutral',
                  mouthState: 'rest',
                  speaking: false,
                }}
                isSelected={false}
              />
            </svg>
          </div>
        ) : character.referenceImageUrl ? (
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
            <div className="placeholder-subtext">Customize in Character Studio</div>
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
                className="btn btn-primary btn-sm"
                onClick={onEdit}
                title={`Edit ${character.name}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '3px 8px' }}
              >
                <EditIcon size={12} />
                <span>Edit</span>
              </button>
            )}
            {onDuplicate && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onDuplicate}
                title={`Duplicate ${character.name}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '3px 8px' }}
              >
                <span>Duplicate</span>
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
      </div>
    </div>
  );
}
