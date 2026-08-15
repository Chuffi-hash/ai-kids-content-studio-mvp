interface Character {
  id: string;
  name: string;
  species: string;
  personality: string;
  description: string;
}

interface CharacterPickerModalProps {
  isOpen: boolean;
  characters: Character[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function CharacterPickerModal({
  isOpen,
  characters,
  selectedIds,
  onToggle,
  onClose,
  onConfirm,
}: CharacterPickerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Characters</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="character-picker-list">
            {characters.length === 0 ? (
              <p className="muted">No characters available. Create characters first.</p>
            ) : (
              characters.map((character) => {
                const isSelected = selectedIds.includes(character.id);
                return (
                  <div
                    key={character.id}
                    className={`character-picker-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => onToggle(character.id)}
                  >
                    <div className="character-picker-avatar">
                      {character.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="character-picker-info">
                      <div className="character-picker-name">{character.name}</div>
                      <div className="character-picker-meta">
                        <span>{character.species}</span>
                        <span>•</span>
                        <span>{character.personality}</span>
                      </div>
                    </div>
                    <div className="character-picker-checkbox">
                      {isSelected ? '✓' : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
