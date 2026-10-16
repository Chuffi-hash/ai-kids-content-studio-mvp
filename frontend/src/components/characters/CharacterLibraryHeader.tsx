import React from 'react';
import { PlusIcon } from '../common/Icons';

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
      <button
        type="button"
        className="btn btn-primary"
        onClick={onCreateCharacter}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <PlusIcon size={15} />
        <span>New Character</span>
      </button>
    </div>
  );
}
