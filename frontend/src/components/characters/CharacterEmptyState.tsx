interface CharacterEmptyStateProps {
  onCreateCharacter: () => void;
}

export default function CharacterEmptyState({
  onCreateCharacter,
}: CharacterEmptyStateProps) {
  return (
    <div className="character-empty">
      <h3>No characters yet</h3>
      <p className="muted">
        Create reusable characters that can be used across multiple stories.
      </p>
      <button className="btn btn-primary" onClick={onCreateCharacter}>
        + Create Character
      </button>
    </div>
  );
}
