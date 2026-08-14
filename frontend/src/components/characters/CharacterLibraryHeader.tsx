interface CharacterLibraryHeaderProps {
  onCreateCharacter: () => void;
}

export default function CharacterLibraryHeader({ onCreateCharacter }: CharacterLibraryHeaderProps) {
  return (
    <div className="character-library-header">
      <div className="character-library-title">
        <h1>Character Library</h1>
        <p className="muted">Reusable characters for your stories</p>
      </div>
      <button
        className="primary character-library-create-btn"
        onClick={onCreateCharacter}
      >
        + New Character
      </button>
    </div>
  );
}
