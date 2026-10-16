import React, { useState, useEffect } from 'react';
import { Character, getAllCharacters } from '../../services/character.service';
import { CloseIcon, PlusIcon } from '../common/Icons';

interface CharacterSelectorProps {
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
}

export default function CharacterSelector({ selectedIds, onChange, disabled }: CharacterSelectorProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadCharacters();
  }, []);

  async function loadCharacters() {
    try {
      setLoading(true);
      const data = await getAllCharacters();
      setCharacters(data);
    } catch (error) {
      console.error('Failed to load characters:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleCharacter(characterId: string) {
    if (selectedIds.includes(characterId)) {
      onChange(selectedIds.filter(id => id !== characterId));
    } else {
      onChange([...selectedIds, characterId]);
    }
  }

  const selectedCharacters = characters.filter(c => selectedIds.includes(c.id));
  const availableCharacters = characters.filter(c => !selectedIds.includes(c.id));

  return (
    <div className="character-selector">
      <div className="character-selector-selected">
        {selectedCharacters.length === 0 ? (
          <span className="character-selector-placeholder">No characters selected</span>
        ) : (
          selectedCharacters.map(character => (
            <div key={character.id} className="character-selector-chip">
              {character.referenceImageUrl && (
                <img src={character.referenceImageUrl} alt={character.name} className="character-selector-chip-image" />
              )}
              <span>{character.name}</span>
              <button
                type="button"
                className="character-selector-chip-remove"
                onClick={() => toggleCharacter(character.id)}
                disabled={disabled}
                aria-label={`Remove ${character.name}`}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          className="character-selector-add-btn"
          onClick={() => setIsOpen(true)}
          disabled={disabled || loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          <PlusIcon size={14} />
          <span>Add Character</span>
        </button>
      </div>

      {isOpen && (
        <div className="character-selector-dropdown">
          <div className="character-selector-header">
            <h3>Select Characters</h3>
            <button
              type="button"
              className="character-selector-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close"
            >
              <CloseIcon size={14} />
            </button>
          </div>

          {loading ? (
            <div className="character-selector-loading">Loading characters...</div>
          ) : availableCharacters.length === 0 ? (
            <div className="character-selector-empty">No more characters available</div>
          ) : (
            <div className="character-selector-list">
              {availableCharacters.map(character => (
                <div
                  key={character.id}
                  className="character-selector-item"
                  onClick={() => toggleCharacter(character.id)}
                >
                  <div className="character-selector-item-avatar">
                    {character.referenceImageUrl ? (
                      <img src={character.referenceImageUrl} alt={character.name} />
                    ) : (
                      <span>{character.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="character-selector-item-content">
                    <div className="character-selector-item-name">{character.name}</div>
                    <div className="character-selector-item-meta">
                      {character.species} · {character.personality}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="character-selector-item-add"
                    aria-label={`Add ${character.name}`}
                  >
                    <PlusIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
