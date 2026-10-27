import React, { useState, useEffect } from 'react';
import { SaveStatus } from '../../types/editor';
import { formatTimeMs } from '../../utils/timingEngine';
import {
  ArrowLeftIcon,
  UndoIcon,
  RedoIcon,
  RewindIcon,
  PlayIcon,
  PauseIcon,
  FilmIcon,
  CheckIcon,
  AlertTriangleIcon,
} from '../common/Icons';
import { ThemeSelector } from '../common/ThemeToggle';


interface TopToolbarProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  onBack: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saveStatus: SaveStatus;
  onRetrySave?: () => void;
  currentTimeMs: number;
  totalDurationMs: number;
  targetDurationMs?: number | null;
  onTargetDurationChange?: (targetMs: number | null) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRewind: () => void;
  onOpenExport: () => void;
  onOpenStoryDetails?: () => void;
  onOpenImportScript?: () => void;
  hasValidationErrors?: boolean;
  validationMessage?: string;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  title,
  onTitleChange,
  onBack,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus,
  onRetrySave,
  currentTimeMs,
  totalDurationMs,
  targetDurationMs,
  onTargetDurationChange,
  isPlaying,
  onTogglePlay,
  onRewind,
  onOpenExport,
  onOpenStoryDetails,
  onOpenImportScript,
  hasValidationErrors,
  validationMessage,
}) => {
  const [localTitle, setLocalTitle] = useState(title);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(
    targetDurationMs ? String(Math.round(targetDurationMs / 1000)) : ''
  );

  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  useEffect(() => {
    setTargetInput(targetDurationMs ? String(Math.round(targetDurationMs / 1000)) : '');
  }, [targetDurationMs]);

  const handleTitleBlur = () => {
    if (localTitle.trim() && localTitle !== title) {
      onTitleChange(localTitle.trim());
    } else {
      setLocalTitle(title);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleTargetSubmit = () => {
    setIsEditingTarget(false);
    const secs = parseInt(targetInput, 10);
    if (onTargetDurationChange) {
      if (!isNaN(secs) && secs > 0) {
        onTargetDurationChange(secs * 1000);
      } else {
        onTargetDurationChange(null);
      }
    }
  };

  return (
    <header className="ed-toolbar">
      {/* Left: Back button, Title, Undo/Redo, Save Status */}
      <div className="ed-toolbar-left">
        <button
          type="button"
          className="ed-brand-btn"
          onClick={onBack}
          title="Back to stories list"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeftIcon size={14} />
          <span>Stories</span>
        </button>

        <div className="ed-title-wrapper">
          <input
            className="ed-title-input"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            title="Click to edit project title"
            placeholder="Untitled Story"
          />
        </div>

        {onOpenStoryDetails && (
          <button
            type="button"
            className="ed-tool-btn"
            onClick={onOpenStoryDetails}
            title="Edit story synopsis, genre, lesson, and manage characters"
            style={{ fontSize: '11px', padding: '3px 8px', borderColor: '#8b5cf6', color: '#c084fc', background: 'rgba(139, 92, 246, 0.12)' }}
          >
            Story Details & Roles
          </button>
        )}

        {onOpenImportScript && (
          <button
            type="button"
            className="ed-tool-btn"
            onClick={onOpenImportScript}
            title="Import script from Claude, Gemini, ChatGPT or Markdown into storyboard"
            style={{ fontSize: '11px', padding: '3px 8px', borderColor: '#a855f7', color: '#c084fc', background: 'rgba(168, 85, 247, 0.15)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <span>📜</span>
            <span>Import Script</span>
          </button>
        )}

        <div className="ed-history-controls" style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            className="ed-icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <UndoIcon size={14} />
          </button>
          <button
            type="button"
            className="ed-icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <RedoIcon size={14} />
          </button>
        </div>

        {/* Save Status */}
        <div
          className={`ed-status-badge ${saveStatus}`}
          onClick={saveStatus === 'error' ? onRetrySave : undefined}
          title={saveStatus === 'error' ? 'Click to retry saving' : undefined}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          {saveStatus === 'saved' && (
            <>
              <CheckIcon size={13} color="#10b981" />
              <span>Saved</span>
            </>
          )}
          {saveStatus === 'saving' && (
            <>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === 'dirty' && (
            <>
              <span style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid #f59e0b', display: 'inline-block' }} />
              <span>Unsaved</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <AlertTriangleIcon size={13} color="#ef4444" />
              <span>Save Failed (Retry)</span>
            </>
          )}
        </div>
      </div>

      {/* Center: Playback Controls & Timecode */}
      <div className="ed-toolbar-center">
        <div className="ed-transport-controls">
          <button
            type="button"
            className="ed-icon-btn"
            onClick={onRewind}
            title="Rewind to start"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <RewindIcon size={14} />
          </button>
          <button
            type="button"
            className="ed-play-btn"
            onClick={onTogglePlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {isPlaying ? <PauseIcon size={15} color="#ffffff" /> : <PlayIcon size={15} color="#ffffff" />}
          </button>
          <div className="ed-timecode-display">
            <span>{formatTimeMs(currentTimeMs)}</span>
            <span className="muted"> / {formatTimeMs(totalDurationMs)}</span>
          </div>
        </div>

        {/* Target duration badge */}
        <div
          style={{
            fontSize: '11px',
            color: 'var(--ed-text-muted)',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--ed-border)',
          }}
          onClick={() => setIsEditingTarget(true)}
          title="Click to edit target duration goal"
        >
          {isEditingTarget ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Goal (sec):
              <input
                style={{
                  width: '40px',
                  background: 'var(--ed-surface-elevated)',
                  color: 'var(--ed-text)',
                  border: '1px solid var(--ed-border-focus)',
                  borderRadius: '3px',
                  padding: '2px 4px',
                  fontSize: '11px',
                }}
                autoFocus
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                onBlur={handleTargetSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleTargetSubmit()}
              />
            </span>
          ) : (
            <span>
              Target:{' '}
              <strong style={{ color: 'var(--ed-text)' }}>
                {targetDurationMs ? `${Math.round(targetDurationMs / 1000)}s` : 'Flexible'}
              </strong>
            </span>
          )}
        </div>

        {hasValidationErrors && (
          <div
            style={{
              color: '#f59e0b',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'help',
            }}
            title={validationMessage || 'Timing or narration validation warnings detected'}
          >
            <AlertTriangleIcon size={14} color="#f59e0b" />
            <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Timing Warning
            </span>
          </div>
        )}
      </div>

      {/* Right: Export Button & 3-way Theme Selector */}
      <div className="ed-toolbar-right">
        <ThemeSelector />
        <button
          type="button"
          className="ed-btn-export"
          onClick={onOpenExport}
          title="Export full video"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <FilmIcon size={15} color="#ffffff" />
          <span>Export Video</span>
        </button>
      </div>
    </header>
  );
};
