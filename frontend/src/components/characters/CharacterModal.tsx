import { Character } from '../../services/character.service';
import CharacterForm from './CharacterForm';

interface CharacterModalProps {
  isOpen: boolean;
  character?: Character | null;
  onSubmit: (data: {
    name: string;
    species: string;
    personality: string;
    visualDescription: string;
    distinctiveFeatures?: string;
  }) => void;
  onCancel: () => void;
}

export default function CharacterModal({ isOpen, character, onSubmit, onCancel }: CharacterModalProps) {
  if (!isOpen) return null;

  return (
    <div className="character-modal-overlay" onClick={onCancel}>
      <div className="character-modal" onClick={(e) => e.stopPropagation()}>
        <CharacterForm
          character={character}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
