import { Character } from '../../services/character.service';
import CharacterCard from './CharacterCard';

interface CharacterGridProps {
  characters: Character[];
  onEdit: (character: Character) => void;
  onDelete: (id: string, name: string) => void;
  onGenerateReference?: (characterId: string) => void;
}

export default function CharacterGrid({ characters, onEdit, onDelete, onGenerateReference }: CharacterGridProps) {
  return (
    <div className="character-grid">
      {characters.map((character) => (
        <CharacterCard
          key={character.id}
          character={character}
          onEdit={() => onEdit(character)}
          onDelete={() => onDelete(character.id, character.name)}
          onGenerateReference={onGenerateReference ? () => onGenerateReference(character.id) : undefined}
        />
      ))}
    </div>
  );
}
