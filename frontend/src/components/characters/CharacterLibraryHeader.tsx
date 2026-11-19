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
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{
            borderColor: 'rgba(139, 92, 246, 0.4)',
            color: '#c084fc',
            background: 'rgba(139, 92, 246, 0.12)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
          onClick={() => window.open('/integrations/google-flow', '_blank')}
          title="Open dedicated Google Flow workspace"
        >
          <span>🌊</span>
          <span>Google Flow ↗</span>
        </button>
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
