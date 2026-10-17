import React from 'react';
import { PlusIcon } from '../common/Icons';

interface CharacterLibraryHeaderProps {
  onCreateCharacter: () => void;
  onOpenBuilder?: () => void;
}

export default function CharacterLibraryHeader({
  onCreateCharacter,
  onOpenBuilder,
}: CharacterLibraryHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1>Character Library</h1>
        <p className="muted">Reusable characters and vector rigs for your stories</p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onOpenBuilder || onCreateCharacter}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <PlusIcon size={15} />
          <span>Build Character (Rig Studio)</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCreateCharacter}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          title="Create character with text metadata"
        >
          <span>Text Metadata</span>
        </button>
      </div>
    </div>
  );
}
