import { Character } from '../../types/story';

interface CharacterCardProps {
  character: Character;
}

export default function CharacterCard({ character }: CharacterCardProps) {
  return (
    <div className="character">
      <strong>{character.name}</strong>
      <p>
        {character.species} — {character.personality}
      </p>
      <small>{character.description}</small>
    </div>
  );
}
