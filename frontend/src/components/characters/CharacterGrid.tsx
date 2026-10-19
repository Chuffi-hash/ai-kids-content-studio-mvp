import { Character } from '../../services/character.service';
import CharacterCard from './CharacterCard';

interface CharacterGridProps {
  characters: Character[];
  onEdit: (character: Character) => void;
  onCustomize?: (character: Character) => void;
  onDuplicate?: (character: Character) => void;
  onDelete: (id: string, name: string) => void;
}

export default function CharacterGrid({
  characters,
  onEdit,
  onCustomize,
  onDuplicate,
  onDelete,
}: CharacterGridProps) {
  return (
    <div className="character-grid">
      {characters.map((character) => (
        <CharacterCard
          key={character.id}
          character={character}
          onEdit={() => onEdit(character)}
          onCustomize={onCustomize ? () => onCustomize(character) : undefined}
          onDuplicate={onDuplicate ? () => onDuplicate(character) : undefined}
          onDelete={() => onDelete(character.id, character.name)}
        />
      ))}
    </div>
  );
}
