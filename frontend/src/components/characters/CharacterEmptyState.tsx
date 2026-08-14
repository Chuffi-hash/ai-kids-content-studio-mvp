interface CharacterEmptyStateProps {
  onCreateCharacter: () => void;
}

export default function CharacterEmptyState({ onCreateCharacter }: CharacterEmptyStateProps) {
  return (
    <div className="character-empty-state">
      <div className="character-empty-icon">👤</div>
      <h3>No characters yet</h3>
      <p className="muted">Create reusable characters that can appear across multiple stories.</p>
      <button
        className="primary"
        onClick={onCreateCharacter}
      >
        Create Character
      </button>
    </div>
  );
}
