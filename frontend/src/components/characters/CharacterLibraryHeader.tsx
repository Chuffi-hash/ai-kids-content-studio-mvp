interface CharacterLibraryHeaderProps {
  onCreateCharacter: () => void;
}

export default function CharacterLibraryHeader({
  onCreateCharacter,
}: CharacterLibraryHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1>Character Library</h1>
        <p className="muted">Reusable characters for your stories</p>
      </div>
      <button className="btn btn-primary" onClick={onCreateCharacter}>
        + New Character
      </button>
    </div>
  );
}
