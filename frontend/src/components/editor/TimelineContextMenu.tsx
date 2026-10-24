import React, { useEffect, useRef } from 'react';
import { EditorScene } from '../../types/editor';
import { SceneDialogue, EducationalOverlay, EducationalOverlayType } from '../../types/animation';
import {
  PlusIcon,
  TrashIcon,
  CopyIcon,
  PlayIcon,
  SparklesIcon,
  ScissorsIcon,
  EditIcon,
} from '../common/Icons';

export type TimelineContextMenuTarget =
  | { type: 'empty'; track: string; timeMs: number; sceneId?: string }
  | { type: 'scene'; scene: EditorScene }
  | { type: 'dialogue'; scene: EditorScene; dialogue: SceneDialogue }
  | { type: 'overlay'; scene: EditorScene; overlay: EducationalOverlay }
  | { type: 'instance'; scene: EditorScene; instanceId: string; characterName?: string }
  | { type: 'header'; track: string };

interface TimelineContextMenuProps {
  x: number;
  y: number;
  target: TimelineContextMenuTarget;
  onClose: () => void;
  playheadMs: number;
  onAddScene?: () => void;
  onAddDialogue?: (sceneId: string, startOffsetMs?: number) => void;
  onAddOverlay?: (sceneId: string, type: EducationalOverlayType, startOffsetMs?: number) => void;
  onAddCharacter?: (sceneId: string, charId: 'pip_the_bear' | 'sammy_the_kid') => void;
  onSeek?: (timeMs: number) => void;
  onSelectScene?: (sceneId: string) => void;
  onSelectDialogue?: (dialogueId: string) => void;
  onSelectOverlay?: (overlayId: string) => void;
  onSelectInstance?: (instanceId: string) => void;
  onDuplicateScene?: (sceneId: string) => void;
  onDeleteScene?: (sceneId: string) => void;
  onSplitScene?: (sceneId: string, splitMs: number) => void;
  onDeleteDialogue?: (dialogueId: string) => void;
  onDeleteOverlay?: (sceneId: string, overlayId: string) => void;
  onDeleteInstance?: (sceneId: string, instanceId: string) => void;
  onPreviewDialogue?: (dialogue: SceneDialogue) => void;
  onRegenerateDialogue?: (sceneId: string, dialogueId: string) => void;
}

export const TimelineContextMenu: React.FC<TimelineContextMenuProps> = ({
  x,
  y,
  target,
  onClose,
  playheadMs,
  onAddScene,
  onAddDialogue,
  onAddOverlay,
  onAddCharacter,
  onSeek,
  onSelectScene,
  onSelectDialogue,
  onSelectOverlay,
  onSelectInstance,
  onDuplicateScene,
  onDeleteScene,
  onSplitScene,
  onDeleteDialogue,
  onDeleteOverlay,
  onDeleteInstance,
  onPreviewDialogue,
  onRegenerateDialogue,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [onClose]);

  // Viewport boundary clamp
  const approxWidth = 230;
  const approxHeight = 220;
  const left = Math.max(12, Math.min(x, window.innerWidth - approxWidth - 12));
  const top = Math.max(12, Math.min(y, window.innerHeight - approxHeight - 12));

  const renderEmptyTrackMenu = (track: string, timeMs: number, sceneId?: string) => {
    return (
      <>
        <div className="ed-context-header">
          {track === 'track-visuals' && 'Scene Track'}
          {track === 'track-dialogue' && 'Dialogue Track'}
          {track === 'track-overlays' && 'Overlays Track'}
          {track === 'track-rig' && '2D Rig Track'}
          {track === 'track-narration' && 'Narration Track'}
          {track === 'track-soundtrack' && 'Soundtrack Track'}
          <span className="ed-context-time">{(timeMs / 1000).toFixed(1)}s</span>
        </div>

        {onSeek && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              onSeek(timeMs);
              onClose();
            }}
          >
            <PlayIcon size={13} color="#a78bfa" />
            <span>Move Playhead Here</span>
          </button>
        )}

        <div className="ed-context-divider" />

        {track === 'track-visuals' && onAddScene && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              onAddScene();
              onClose();
            }}
          >
            <PlusIcon size={13} color="#34d399" />
            <span>Add New Scene</span>
          </button>
        )}

        {track === 'track-dialogue' && sceneId && onAddDialogue && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              onAddDialogue(sceneId, Math.max(0, timeMs));
              onClose();
            }}
          >
            <span>👄</span>
            <span>Add Dialogue Line</span>
          </button>
        )}

        {track === 'track-overlays' && sceneId && onAddOverlay && (
          <>
            <button
              type="button"
              className="ed-context-item"
              onClick={() => {
                onAddOverlay(sceneId, 'location_pin', Math.max(0, timeMs));
                onClose();
              }}
            >
              <span>📍</span>
              <span>Add Location Pin</span>
            </button>
            <button
              type="button"
              className="ed-context-item"
              onClick={() => {
                onAddOverlay(sceneId, 'highlight_ring', Math.max(0, timeMs));
                onClose();
              }}
            >
              <span>⭕</span>
              <span>Add Highlight Ring</span>
            </button>
            <button
              type="button"
              className="ed-context-item"
              onClick={() => {
                onAddOverlay(sceneId, 'callout_label', Math.max(0, timeMs));
                onClose();
              }}
            >
              <span>🏷️</span>
              <span>Add Callout Label</span>
            </button>
          </>
        )}

        {track === 'track-rig' && sceneId && onAddCharacter && (
          <>
            <button
              type="button"
              className="ed-context-item"
              onClick={() => {
                onAddCharacter(sceneId, 'pip_the_bear');
                onClose();
              }}
            >
              <SparklesIcon size={13} color="#a78bfa" />
              <span>Add Pip the Bear Rig</span>
            </button>
            <button
              type="button"
              className="ed-context-item"
              onClick={() => {
                onAddCharacter(sceneId, 'sammy_the_kid');
                onClose();
              }}
            >
              <SparklesIcon size={13} color="#60a5fa" />
              <span>Add Sammy the Kid Rig</span>
            </button>
          </>
        )}
      </>
    );
  };

  const renderSceneClipMenu = (scene: EditorScene) => {
    const canSplit = playheadMs > scene.startMs + 500 && playheadMs < scene.endMs - 500;
    return (
      <>
        <div className="ed-context-header">
          Scene {scene.number}: {scene.title}
        </div>

        {onSelectScene && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              onSelectScene(scene.sceneId);
              onClose();
            }}
          >
            <EditIcon size={13} color="#38bdf8" />
            <span>Edit Scene Settings</span>
          </button>
        )}

        {onDuplicateScene && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              onDuplicateScene(scene.sceneId);
              onClose();
            }}
          >
            <CopyIcon size={13} color="#c4b5fd" />
            <span>Duplicate Scene</span>
          </button>
        )}

        {onSplitScene && (
          <button
            type="button"
            className="ed-context-item"
            disabled={!canSplit}
            onClick={() => {
              if (canSplit) {
                onSplitScene(scene.sceneId, playheadMs);
                onClose();
              }
            }}
          >
            <ScissorsIcon size={13} color={canSplit ? '#f59e0b' : '#64748b'} />
            <span>Split at Playhead</span>
          </button>
        )}

        <div className="ed-context-divider" />

        {onDeleteScene && (
          <button
            type="button"
            className="ed-context-item danger"
            onClick={() => {
              onDeleteScene(scene.sceneId);
              onClose();
            }}
          >
            <TrashIcon size={13} color="#ef4444" />
            <span>Delete Scene</span>
          </button>
        )}
      </>
    );
  };

  const renderDialogueClipMenu = (scene: EditorScene, dialogue: SceneDialogue) => {
    return (
      <>
        <div className="ed-context-header">
          👄 {dialogue.characterName} Dialogue
        </div>

        {onSelectDialogue && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              if (onSelectScene) onSelectScene(scene.sceneId);
              onSelectDialogue(dialogue.id);
              onClose();
            }}
          >
            <EditIcon size={13} color="#f472b6" />
            <span>Edit Voice & Emotion</span>
          </button>
        )}

        {dialogue.audioUrl && onPreviewDialogue && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              onPreviewDialogue(dialogue);
              onClose();
            }}
          >
            <PlayIcon size={13} color="#34d399" />
            <span>Preview Spoken Audio</span>
          </button>
        )}

        {onRegenerateDialogue && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              onRegenerateDialogue(scene.sceneId, dialogue.id);
              onClose();
            }}
          >
            <SparklesIcon size={13} color="#ec4899" />
            <span>Regenerate Speech Audio</span>
          </button>
        )}

        <div className="ed-context-divider" />

        {onDeleteDialogue && (
          <button
            type="button"
            className="ed-context-item danger"
            onClick={() => {
              onDeleteDialogue(dialogue.id);
              onClose();
            }}
          >
            <TrashIcon size={13} color="#ef4444" />
            <span>Delete Dialogue</span>
          </button>
        )}
      </>
    );
  };

  const renderOverlayClipMenu = (scene: EditorScene, overlay: EducationalOverlay) => {
    return (
      <>
        <div className="ed-context-header">
          📍 {overlay.title || overlay.type}
        </div>

        {onSelectOverlay && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              if (onSelectScene) onSelectScene(scene.sceneId);
              onSelectOverlay(overlay.id);
              onClose();
            }}
          >
            <EditIcon size={13} color="#06b6d4" />
            <span>Edit Overlay Properties</span>
          </button>
        )}

        <div className="ed-context-divider" />

        {onDeleteOverlay && (
          <button
            type="button"
            className="ed-context-item danger"
            onClick={() => {
              onDeleteOverlay(scene.sceneId, overlay.id);
              onClose();
            }}
          >
            <TrashIcon size={13} color="#ef4444" />
            <span>Delete Overlay</span>
          </button>
        )}
      </>
    );
  };

  const renderHeaderMenu = (track: string) => {
    return (
      <>
        <div className="ed-context-header">
          {track === 'track-visuals' && 'Visuals Track'}
          {track === 'track-rig' && '2D Rig Track'}
          {track === 'track-dialogue' && 'Dialogue Track'}
          {track === 'track-overlays' && 'Overlays Track'}
          {track === 'track-narration' && 'Narration Track'}
          {track === 'track-soundtrack' && 'Soundtrack Track'}
        </div>

        {track === 'track-visuals' && onAddScene && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              onAddScene();
              onClose();
            }}
          >
            <PlusIcon size={13} color="#34d399" />
            <span>Add New Scene</span>
          </button>
        )}

        {track === 'track-soundtrack' && onSeek && (
          <button
            type="button"
            className="ed-context-item"
            onClick={() => {
              onSeek(0);
              onClose();
            }}
          >
            <PlayIcon size={13} color="#38bdf8" />
            <span>Rewind Soundtrack to Start</span>
          </button>
        )}
      </>
    );
  };

  return (
    <div
      ref={menuRef}
      className="ed-context-menu"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 9999,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {target.type === 'empty' && renderEmptyTrackMenu(target.track, target.timeMs, target.sceneId)}
      {target.type === 'scene' && renderSceneClipMenu(target.scene)}
      {target.type === 'dialogue' && renderDialogueClipMenu(target.scene, target.dialogue)}
      {target.type === 'overlay' && renderOverlayClipMenu(target.scene, target.overlay)}
      {target.type === 'header' && renderHeaderMenu(target.track)}
    </div>
  );
};

