interface Character {
  id: string;
  name: string;
  species: string;
  personality: string;
  description: string;
}

interface CharacterSelectorProps {
  characters: Character[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onOpenPicker: () => void;
}

export default function CharacterSelector({
  characters,
  selectedIds,
  onToggle,
  onOpenPicker,
}: CharacterSelectorProps) {
  const selected = characters.filter((c) => selectedIds.includes(c.id));

  return (
    <div className="character-selector">
      {selected.length === 0 ? (
        <p className="character-chip-empty">No characters selected</p>
      ) : (
        selected.map((character) => (
          <span className="character-chip" key={character.id}>
            <span className="character-chip-initial">
              {character.name.charAt(0).toUpperCase()}
            </span>
            {character.name}
            <button
              type="button"
              className="character-chip-remove"
              onClick={() => onToggle(character.id)}
              aria-label={`Remove ${character.name}`}
            >
              ✕
            </button>
          </span>
        ))
      )}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={onOpenPicker}
      >
        + Add Character
      </button>
    </div>
  );
}
