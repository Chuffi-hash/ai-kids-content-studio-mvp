import React from 'react';
import { UsersIcon, PlusIcon } from '../common/Icons';

interface CharacterEmptyStateProps {
  onCreateCharacter: () => void;
}

export default function CharacterEmptyState({
  onCreateCharacter,
}: CharacterEmptyStateProps) {
  return (
    <div className="character-empty">
      <div style={{ marginBottom: '16px', color: 'var(--color-text-faint)', opacity: 0.6 }}>
        <UsersIcon size={48} />
      </div>
      <h3>No characters yet</h3>
      <p className="muted">
        Create reusable characters that can be used across multiple stories.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onCreateCharacter}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <PlusIcon size={15} />
        <span>Create Character</span>
      </button>
    </div>
  );
}
