import React from 'react';
import { PlusIcon, SparklesIcon } from '../common/Icons';

interface CharacterLibraryHeaderProps {
  onCreateCharacter: () => void;
  onOpenBuilder?: () => void;
  onOpenStudio?: () => void;
}

export default function CharacterLibraryHeader({
  onCreateCharacter,
  onOpenBuilder,
  onOpenStudio,
}: CharacterLibraryHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1>Character Library</h1>
        <p className="muted">Reusable characters, AI image assets, and vector rigs for your stories</p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {onOpenStudio && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenStudio}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2))',
              borderColor: 'rgba(139, 92, 246, 0.5)',
              color: '#c4b5fd',
            }}
          >
            <SparklesIcon size={15} />
            <span>AI Character Studio</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={onOpenBuilder || onCreateCharacter}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <PlusIcon size={15} />
          <span>Build Vector Rig</span>
        </button>
      </div>
    </div>
  );
}
