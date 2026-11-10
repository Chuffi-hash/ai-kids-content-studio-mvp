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
            className="btn btn-secondary btn-ai-studio"
            onClick={onOpenStudio}
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
