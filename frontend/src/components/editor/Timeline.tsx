import React, { useRef, useState, useEffect } from 'react';
import { EditorScene } from '../../types/editor';
import {
  formatTimeMs,
  formatDurationHuman,
  calculateRippleEdit,
  recalculateContiguousTimeline,
  MIN_SCENE_DURATION_MS,
} from '../../utils/timingEngine';
import { resolveAssetUrl } from '../../utils/urlHelper';
import {
  ScissorsIcon,
  FilmIcon,
  MicIcon,
  MusicIcon,
  ImageIcon,
  AlertTriangleIcon,
  CheckIcon,
  SparklesIcon,
} from '../common/Icons';

function getExpressionEmoji(expr?: string): string {
  switch (expr) {
    case 'happy': return '😊';
    case 'sad': return '😢';
    case 'angry': return '😠';
    case 'surprised': return '😲';
    case 'scared': return '😨';
    case 'confused': return '🤨';
    case 'curious': return '🤔';
    case 'neutral': return '😐';
    default: return '😐';
  }
}

interface TimelineProps {
  scenes: EditorScene[];
  activeSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  playheadMs: number;
  onSeek: (timeMs: number) => void;
  totalDurationMs: number;
  onUpdateScenes: (updatedScenes: EditorScene[]) => void;
  onAddScene: () => void;
  onSplitScene: (sceneId: string, splitMs: number) => void;
  onMergeScenes: (sceneId: string) => void;
  selectedMusic: string | null;
  selectedInstanceId?: string | null;
  onSelectInstance?: (instanceId: string | null) => void;
  selectedDialogueId?: string | null;
  onSelectDialogue?: (dialogueId: string | null) => void;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  isRippleOn?: boolean;
  onToggleRipple?: () => void;
}

interface TimelineLayoutItem<T> {
  item: T;
  scene: EditorScene;
  startMs: number;
  durationMs: number;
  endMs: number;
  lane: number;
}

function packClipsIntoSubLanes<T>(
  clips: Array<{ item: T; scene: EditorScene; startMs: number; durationMs: number; endMs: number }>
): { items: TimelineLayoutItem<T>[]; totalLanes: number } {
  if (clips.length === 0) {
    return { items: [], totalLanes: 1 };
  }

  // Sort by startMs, then by endMs
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const laneEndTimes: number[] = [];
  const packed: TimelineLayoutItem<T>[] = [];

  for (const clip of sorted) {
    let assignedLane = -1;
    for (let l = 0; l < laneEndTimes.length; l++) {
      if (laneEndTimes[l] <= clip.startMs + 30) {
        assignedLane = l;
        laneEndTimes[l] = clip.endMs;
        break;
      }
    }
    if (assignedLane === -1) {
      assignedLane = laneEndTimes.length;
      laneEndTimes.push(clip.endMs);
    }
    packed.push({
      ...clip,
      lane: assignedLane,
    });
  }

  return {
    items: packed,
    totalLanes: Math.max(1, laneEndTimes.length),
  };
}

export const Timeline: React.FC<TimelineProps> = ({
  scenes,
  activeSceneId,
  onSelectScene,
  playheadMs,
  onSeek,
  totalDurationMs,
  onUpdateScenes,
  onAddScene,
  onSplitScene,
  onMergeScenes,
  selectedMusic,
  selectedInstanceId,
  onSelectInstance,
  selectedDialogueId,
  onSelectDialogue,
  selectedOverlayId,
  onSelectOverlay,
  isRippleOn: isRippleOnProp,
  onToggleRipple,
}) => {
  // Zoom: pixels per second
  const [pxPerSec, setPxPerSec] = useState<number>(45);
  const [localIsRippleOn, setLocalIsRippleOn] = useState<boolean>(true);
  const isRippleOn = isRippleOnProp !== undefined ? isRippleOnProp : localIsRippleOn;
  const handleToggleRipple = onToggleRipple || (() => setLocalIsRippleOn((prev) => !prev));
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);

  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeScene = scenes.find((s) => s.sceneId === activeSceneId) || null;

  // Sub-lane packing for dialogues
  const packedDialogues = React.useMemo(() => {
    const raw: Array<{
      item: any;
      scene: EditorScene;
      startMs: number;
      durationMs: number;
      endMs: number;
    }> = [];
    for (const scene of scenes) {
      const dlgs = scene.animationData?.dialogueLines || [];
      for (const dlg of dlgs) {
        const startMs = scene.startMs + (dlg.startMs || 0);
        const durationMs = dlg.durationMs || 3000;
        raw.push({
          item: dlg,
          scene,
          startMs,
          durationMs,
          endMs: startMs + durationMs,
        });
      }
    }
    return packClipsIntoSubLanes(raw);
  }, [scenes]);

  const dialogueTrackHeight = Math.max(46, packedDialogues.totalLanes * 36 + 8);

  // Sub-lane packing for educational overlays
  const packedOverlays = React.useMemo(() => {
    const raw: Array<{
      item: any;
      scene: EditorScene;
      startMs: number;
      durationMs: number;
      endMs: number;
    }> = [];
    for (const scene of scenes) {
      const ovs = scene.animationData?.overlays || [];
      const sceneDuration = scene.endMs - scene.startMs;
      for (const ov of ovs) {
        const startMs = scene.startMs + (ov.startMs || 0);
        const durationMs = ov.durationMs !== undefined ? ov.durationMs : sceneDuration;
        raw.push({
          item: ov,
          scene,
          startMs,
          durationMs,
          endMs: startMs + durationMs,
        });
      }
    }
    return packClipsIntoSubLanes(raw);
  }, [scenes]);

  const overlayTrackHeight = Math.max(46, packedOverlays.totalLanes * 36 + 8);

  // Zoom controls
  const handleZoomIn = () => setPxPerSec((prev) => Math.min(160, Math.round(prev * 1.3)));
  const handleZoomOut = () => setPxPerSec((prev) => Math.max(15, Math.round(prev / 1.3)));
  const handleZoomFit = () => {
    if (!scrollContainerRef.current) return;
    const availableWidth = scrollContainerRef.current.clientWidth - 160;
    const totalSecs = Math.max(10, totalDurationMs / 1000);
    const fitPx = Math.max(15, Math.min(120, Math.floor(availableWidth / totalSecs)));
    setPxPerSec(fitPx);
  };

  // Convert milliseconds to pixels
  const msToPx = (ms: number) => (ms / 1000) * pxPerSec;
  // Convert pixels to milliseconds
  const pxToMs = (px: number) => Math.round((px / pxPerSec) * 1000);

  // Ruler click to scrub playhead
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const clickPx = e.clientX - rect.left;
    const targetMs = Math.max(0, Math.min(totalDurationMs, pxToMs(clickPx)));
    onSeek(targetMs);
  };

  // Dragging the playhead
  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const currentPx = moveEvent.clientX - rect.left;
      const targetMs = Math.max(0, Math.min(totalDurationMs, pxToMs(currentPx)));
      onSeek(targetMs);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Drag-to-resize right edge of a scene clip
  const handleResizeRightMouseDown = (
    e: React.MouseEvent,
    scene: EditorScene
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectScene(scene.sceneId);

    const startX = e.clientX;
    const initialDuration = scene.endMs - scene.startMs;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaMs = pxToMs(deltaPx);
      const newDuration = Math.max(MIN_SCENE_DURATION_MS, initialDuration + deltaMs);

      if (isRippleOn) {
        const rippled = calculateRippleEdit(scenes, scene.sceneId, newDuration);
        onUpdateScenes(rippled);
      } else {
        // Non-ripple: adjust only current scene
        const updated = scenes.map((s) =>
          s.sceneId === scene.sceneId
            ? { ...s, endMs: s.startMs + newDuration, estimatedDurationMs: newDuration }
            : s
        );
        onUpdateScenes(updated);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Dragging dialogue clip horizontally within scene
  const handleDialogueMouseDown = (
    e: React.MouseEvent,
    scene: EditorScene,
    dlgId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectScene(scene.sceneId);

    const dialogues = scene.animationData?.dialogueLines || [];
    const targetDlg = dialogues.find((d) => d.id === dlgId);
    if (!targetDlg) return;

    if (targetDlg.characterInstanceId && onSelectInstance) {
      onSelectInstance(targetDlg.characterInstanceId);
    }
    if (onSelectDialogue) {
      onSelectDialogue(dlgId);
    }

    const startX = e.clientX;
    const initialStartMs = targetDlg.startMs || 0;
    const sceneDuration = scene.endMs - scene.startMs;
    const maxStart = Math.max(0, sceneDuration - 300);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaMs = pxToMs(deltaPx);
      let newStartMs = initialStartMs + deltaMs;

      // Snap to 0ms if within 150ms of scene start
      if (newStartMs < 150) {
        newStartMs = 0;
      } else {
        // Snap to nearest 100ms grid
        newStartMs = Math.round(newStartMs / 100) * 100;
      }
      newStartMs = Math.max(0, Math.min(maxStart, newStartMs));

      const updatedDialogues = dialogues.map((d) =>
        d.id === dlgId ? { ...d, startMs: newStartMs } : d
      );

      const updatedScenes: EditorScene[] = scenes.map((s) => {
        if (s.sceneId !== scene.sceneId) return s;
        const baseAnim = s.animationData || {
          version: 1 as const,
          viewport: { width: 1280 as const, height: 720 as const },
          characterInstances: [],
          animationClips: [],
        };
        return {
          ...s,
          animationData: {
            ...baseAnim,
            version: 1 as const,
            dialogueLines: updatedDialogues,
          },
        };
      });

      onUpdateScenes(updatedScenes);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Trimming / resizing dialogue clip right handle
  const handleDialogueResizeRightMouseDown = (
    e: React.MouseEvent,
    scene: EditorScene,
    dlgId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const dialogues = scene.animationData?.dialogueLines || [];
    const targetDlg = dialogues.find((d) => d.id === dlgId);
    if (!targetDlg) return;

    const startX = e.clientX;
    const initialDuration = targetDlg.durationMs || 3000;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaMs = pxToMs(deltaPx);
      let newDuration = Math.round((initialDuration + deltaMs) / 50) * 50;
      newDuration = Math.max(500, Math.min(30000, newDuration));

      const updatedDialogues = dialogues.map((d) =>
        d.id === dlgId ? { ...d, durationMs: newDuration } : d
      );

      const updatedScenes: EditorScene[] = scenes.map((s) => {
        if (s.sceneId !== scene.sceneId) return s;
        const baseAnim = s.animationData || {
          version: 1 as const,
          viewport: { width: 1280 as const, height: 720 as const },
          characterInstances: [],
          animationClips: [],
        };
        return {
          ...s,
          animationData: {
            ...baseAnim,
            version: 1 as const,
            dialogueLines: updatedDialogues,
          },
        };
      });

      onUpdateScenes(updatedScenes);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Drag and drop reordering of clips
  const handleDragStart = (e: React.DragEvent, sceneId: string) => {
    setDraggedSceneId(sceneId);
    e.dataTransfer.setData('text/plain', sceneId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSceneId: string) => {
    e.preventDefault();
    if (!draggedSceneId || draggedSceneId === targetSceneId) {
      setDraggedSceneId(null);
      return;
    }

    const fromIndex = scenes.findIndex((s) => s.sceneId === draggedSceneId);
    const toIndex = scenes.findIndex((s) => s.sceneId === targetSceneId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedSceneId(null);
      return;
    }

    const reordered = [...scenes];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Recalculate contiguous timing for new order
    const contiguous = recalculateContiguousTimeline(reordered);
    onUpdateScenes(contiguous);
    setDraggedSceneId(null);
  };

  // Generate ruler tick marks
  const totalSeconds = Math.ceil(totalDurationMs / 1000) + 10;
  const tickIntervalSec = pxPerSec > 80 ? 1 : pxPerSec > 35 ? 2 : 5;
  const rulerTicks = [];
  for (let s = 0; s <= totalSeconds; s += tickIntervalSec) {
    rulerTicks.push(s);
  }

  const trackWidthPx = Math.max(800, msToPx(totalDurationMs) + 200);
  const playheadPx = msToPx(playheadMs);

  const canSplit =
    activeScene &&
    playheadMs > activeScene.startMs + 500 &&
    playheadMs < activeScene.endMs - 500;

  const activeSceneIndex = activeScene ? scenes.findIndex((s) => s.sceneId === activeScene.sceneId) : -1;
  const canMergeWithNext = activeSceneIndex >= 0 && activeSceneIndex < scenes.length - 1;

  return (
    <div className="ed-timeline-container">
      {/* Timeline Controls Bar */}
      <div className="ed-timeline-toolbar">
        <div className="ed-timeline-toolbar-left">
          <button type="button" className="ed-tool-btn" onClick={onAddScene}>
            + Add Scene
          </button>

          <button
            type="button"
            className="ed-tool-btn"
            onClick={() => activeScene && onSplitScene(activeScene.sceneId, playheadMs)}
            disabled={!canSplit}
            title={canSplit ? 'Split selected scene at playhead' : 'Position playhead inside selected scene to split'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <ScissorsIcon size={12} />
            <span>Split</span>
          </button>

          <button
            type="button"
            className="ed-tool-btn"
            onClick={() => activeScene && onMergeScenes(activeScene.sceneId)}
            disabled={!canMergeWithNext}
            title={canMergeWithNext ? 'Merge selected scene with next adjacent scene' : 'Select a scene before the last scene to merge'}
          >
            Merge Next
          </button>

          <button
            type="button"
            className="ed-tool-btn"
            style={{
              background: isRippleOn ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              borderColor: isRippleOn ? '#8b5cf6' : 'var(--ed-border)',
              color: isRippleOn ? '#c4b5fd' : 'var(--ed-text-muted)',
            }}
            onClick={handleToggleRipple}
            title="When ripple is ON, resizing a scene shifts all subsequent scenes"
          >
            Ripple Edit: {isRippleOn ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="ed-timeline-toolbar-right">
          <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', fontFamily: 'monospace', marginRight: '8px' }}>
            Duration: {formatTimeMs(totalDurationMs)}
          </div>
          <button type="button" className="ed-tool-btn" onClick={handleZoomOut} title="Zoom out timeline">
            -
          </button>
          <button type="button" className="ed-tool-btn" onClick={handleZoomFit} title="Fit entire timeline to window">
            Fit
          </button>
          <button type="button" className="ed-tool-btn" onClick={handleZoomIn} title="Zoom in timeline">
            +
          </button>
        </div>
      </div>

      {/* Scrollable Tracks + Sticky Headers */}
      <div className="ed-timeline-scrollable" ref={scrollContainerRef}>
        {/* Sticky Left Track Labels */}
        <div className="ed-tracks-headers">
          <div className="ed-track-header ruler-header">Time</div>
          <div className="ed-track-header track-visuals">
            <FilmIcon size={13} />
            <span>Visuals</span>
          </div>
          <div className="ed-track-header track-rig">
            <SparklesIcon size={13} color="#a78bfa" />
            <span>2D Rig</span>
          </div>
          <div
            className="ed-track-header track-dialogue"
            style={{ height: `${dialogueTrackHeight}px`, minHeight: `${dialogueTrackHeight}px` }}
          >
            <span style={{ fontSize: '13px' }}>👄</span>
            <span>Dialogue {packedDialogues.totalLanes > 1 ? `(${packedDialogues.totalLanes})` : ''}</span>
          </div>
          <div
            className="ed-track-header track-overlays"
            style={{ height: `${overlayTrackHeight}px`, minHeight: `${overlayTrackHeight}px` }}
          >
            <span style={{ fontSize: '13px' }}>📍</span>
            <span>Overlays {packedOverlays.totalLanes > 1 ? `(${packedOverlays.totalLanes})` : ''}</span>
          </div>
          <div className="ed-track-header track-narration">
            <MicIcon size={13} />
            <span>Narration</span>
          </div>
          <div className="ed-track-header track-soundtrack">
            <MusicIcon size={13} />
            <span>Soundtrack</span>
          </div>
        </div>

        {/* Scrollable Tracks Content */}
        <div className="ed-tracks-content" style={{ width: `${trackWidthPx}px` }}>
          {/* Time Ruler */}
          <div className="ed-time-ruler" ref={rulerRef} onClick={handleRulerClick}>
            {rulerTicks.map((sec) => (
              <div
                key={sec}
                className="ed-ruler-tick"
                style={{ left: `${sec * pxPerSec}px` }}
              >
                {sec % 60 === 0 ? `${sec / 60}:00` : `0:${String(sec % 60).padStart(2, '0')}`}
              </div>
            ))}
          </div>

          {/* Movable Playhead Line */}
          <div
            className="ed-playhead-line"
            style={{ left: `${playheadPx}px` }}
          >
            <div
              className="ed-playhead-head"
              onMouseDown={handlePlayheadMouseDown}
              title={`Playhead: ${formatTimeMs(playheadMs)}`}
            />
          </div>

          {/* Track 1: Visuals (Scene Clips) */}
          <div className="ed-track-row track-visuals">
            {scenes.map((scene) => {
              const isSelected = scene.sceneId === activeSceneId;
              const leftPx = msToPx(scene.startMs);
              const widthPx = msToPx(scene.endMs - scene.startMs);
              const thumb = scene.imageUrl || scene.image?.imageUrl;
              const hasVideo = Boolean(scene.videoUrl);

              return (
                <div
                  key={scene.sceneId}
                  className={`ed-clip ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: `${leftPx}px`,
                    width: `${Math.max(30, widthPx)}px`,
                  }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, scene.sceneId)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, scene.sceneId)}
                  onClick={() => onSelectScene(scene.sceneId)}
                  title={`${scene.title} (${formatDurationHuman(scene.endMs - scene.startMs)})`}
                >
                  {thumb && <img src={resolveAssetUrl(thumb)} alt="" className="ed-clip-thumb" />}
                  <div className="ed-clip-body">
                    <div className="ed-clip-title">
                      <span className={`ed-clip-badge ${hasVideo ? 'video' : 'still'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        {hasVideo ? (
                          <>
                            <FilmIcon size={9} />
                            <span>VIDEO</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon size={9} />
                            <span>STILL</span>
                          </>
                        )}
                      </span>
                      {scene.number}. {scene.title}
                    </div>
                    <div className="ed-clip-duration">
                      {formatDurationHuman(scene.endMs - scene.startMs)}
                    </div>
                  </div>

                  {/* Right edge resize handle */}
                  <div
                    className="ed-clip-handle right"
                    onMouseDown={(e) => handleResizeRightMouseDown(e, scene)}
                    title="Drag to resize scene duration"
                  />
                </div>
              );
            })}
          </div>

          {/* Track 2: 2D Characters & Animation Clips */}
          <div className="ed-track-row track-rig">
            {scenes.map((scene) => {
              const instances = scene.animationData?.characterInstances || [];
              const clips = scene.animationData?.animationClips || [];
              if (instances.length === 0) return null;

              return instances.map((inst) => {
                const clip = clips.find((c) => c.instanceId === inst.instanceId);
                const clipStartMs = scene.startMs + (clip?.startMs || 0);
                const clipDurationMs = clip?.durationMs || (scene.endMs - scene.startMs);
                const leftPx = msToPx(clipStartMs);
                const widthPx = msToPx(clipDurationMs);
                const isSelected = inst.instanceId === selectedInstanceId;
                const action = clip?.action || 'idle';
                const isMotionPath = clip?.action === 'walk' && clip.motionMode === 'motion_path';

                const cues = scene.animationData?.expressionCues || [];
                const charCue = cues.find(
                  (c) => c.characterInstanceId === inst.instanceId || c.characterId === inst.characterId
                );
                const activeExpr = charCue?.expression;

                return (
                  <div
                    key={`char-clip-${inst.instanceId}`}
                    className={`ed-char-block ${isSelected ? 'selected' : ''}`}
                    style={{
                      left: `${leftPx}px`,
                      width: `${Math.max(28, widthPx)}px`,
                      position: 'absolute',
                      top: '5px',
                      height: '36px',
                      borderRadius: '4px',
                      background: isSelected
                        ? 'rgba(139, 92, 246, 0.35)'
                        : 'rgba(139, 92, 246, 0.18)',
                      border: isSelected
                        ? '2px solid #8b5cf6'
                        : '1px solid rgba(139, 92, 246, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 8px',
                      gap: '6px',
                      fontSize: '11px',
                      color: '#c4b5fd',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      boxShadow: isSelected ? '0 0 10px rgba(139, 92, 246, 0.5)' : undefined,
                      zIndex: isSelected ? 5 : 2,
                    }}
                    onClick={() => {
                      onSelectScene(scene.sceneId);
                      if (onSelectInstance) onSelectInstance(inst.instanceId);
                    }}
                    title={`${inst.name}: ${action.toUpperCase()} (${isMotionPath ? 'Motion Path' : 'In-Place'}) - ${formatDurationHuman(clipDurationMs)}`}
                  >
                    <span>{inst.characterId === 'pip_the_bear' ? '🐻' : '🧒'}</span>
                    <span style={{ fontWeight: 600 }}>{inst.name}</span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        background: 'rgba(255, 255, 255, 0.12)',
                        color: isMotionPath ? '#34d399' : '#e2e8f0',
                      }}
                    >
                      {action} {isMotionPath ? '➔' : ''}
                    </span>
                    {activeExpr && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          padding: '1px 4px',
                          borderRadius: '3px',
                          background: 'rgba(236, 72, 153, 0.25)',
                          color: '#fbcfe8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                        title={`Expression: ${activeExpr}`}
                      >
                        {getExpressionEmoji(activeExpr)} {activeExpr}
                      </span>
                    )}
                    <span style={{ fontSize: '10px', opacity: 0.8, fontFamily: 'monospace' }}>
                      {formatDurationHuman(clipDurationMs)}
                    </span>
                  </div>
                );
              });
            })}
          </div>

          {/* Track: Dialogue & Lip-Sync */}
          <div
            className="ed-track-row track-dialogue"
            style={{ height: `${dialogueTrackHeight}px`, minHeight: `${dialogueTrackHeight}px`, position: 'relative' }}
          >
            {packedDialogues.items.map(({ item: dlg, scene, startMs, durationMs, lane }) => {
              const leftPx = msToPx(startMs);
              const widthPx = msToPx(durationMs);
              const isSelected = dlg.id === selectedDialogueId;
              const sceneDuration = scene.endMs - scene.startMs;
              const isOverflow = (dlg.startMs || 0) + durationMs > sceneDuration;
              const hasAudio = Boolean(dlg.audioUrl);
              const visemeCount = dlg.visemeCues?.length || 0;
              const topPx = 4 + lane * 36;

              return (
                <div
                  key={`dlg-clip-${dlg.id}`}
                  className={`ed-dialogue-block ${isSelected ? 'selected' : ''} ${isOverflow ? 'overflow' : ''}`}
                  style={{
                    left: `${leftPx}px`,
                    width: `${Math.max(28, widthPx)}px`,
                    position: 'absolute',
                    top: `${topPx}px`,
                    height: '32px',
                    borderRadius: '4px',
                    background: isOverflow
                      ? 'rgba(239, 68, 68, 0.25)'
                      : isSelected
                      ? 'rgba(236, 72, 153, 0.35)'
                      : 'rgba(236, 72, 153, 0.18)',
                    border: isOverflow
                      ? '2px solid #ef4444'
                      : isSelected
                      ? '2px solid #ec4899'
                      : '1px solid rgba(236, 72, 153, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 6px',
                    gap: '5px',
                    fontSize: '11px',
                    color: isOverflow ? '#fca5a5' : '#fbcfe8',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    boxShadow: isSelected ? '0 0 10px rgba(236, 72, 153, 0.5)' : undefined,
                    zIndex: isSelected ? 5 : 2,
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                  onMouseDown={(e) => handleDialogueMouseDown(e, scene, dlg.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectScene(scene.sceneId);
                    if (onSelectDialogue) onSelectDialogue(dlg.id);
                  }}
                  title={`${dlg.characterName}: "${dlg.text}" (Offset: +${formatDurationHuman(dlg.startMs || 0)}, Dur: ${formatDurationHuman(durationMs)})${isOverflow ? ' - EXCEEDS SCENE DURATION!' : ''}`}
                >
                  <span style={{ fontSize: '12px', flexShrink: 0 }}>👄</span>
                  {widthPx >= 60 && (
                    <span
                      style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flexShrink: widthPx < 140 ? 1 : 0,
                      }}
                    >
                      {dlg.characterName}:
                    </span>
                  )}
                  {widthPx >= 130 && (
                    <span
                      style={{
                        opacity: 0.9,
                        fontStyle: 'italic',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      "{dlg.text}"
                    </span>
                  )}
                  {widthPx >= 170 && (
                    <span
                      style={{
                        fontSize: '9px',
                        opacity: 0.8,
                        fontFamily: 'monospace',
                        background: 'rgba(0, 0, 0, 0.25)',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        flexShrink: 0,
                      }}
                    >
                      +{((dlg.startMs || 0) / 1000).toFixed(1)}s | {(durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {hasAudio ? (
                    <span title="Dialogue audio generated" style={{ color: '#34d399', fontSize: '10px', flexShrink: 0 }}>🔊</span>
                  ) : (
                    <span title="No audio generated" style={{ color: '#94a3b8', fontSize: '10px', flexShrink: 0 }}>🔇</span>
                  )}
                  {visemeCount > 0 && widthPx >= 100 && (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 4px',
                        borderRadius: '3px',
                        background: 'rgba(255, 255, 255, 0.12)',
                        color: '#a7f3d0',
                        flexShrink: 0,
                      }}
                    >
                      {visemeCount}v
                    </span>
                  )}
                  {isOverflow && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }} title="Exceeds scene duration">
                      <AlertTriangleIcon size={12} color="#ef4444" />
                    </span>
                  )}

                  {/* Right trim handle */}
                  <div
                    className="ed-dialogue-handle right"
                    onMouseDown={(e) => handleDialogueResizeRightMouseDown(e, scene, dlg.id)}
                    title="Drag to trim dialogue duration"
                  />
                </div>
              );
            })}
          </div>

          {/* Track: Educational & Geographic Overlays */}
          <div
            className="ed-track-row track-overlays"
            style={{ height: `${overlayTrackHeight}px`, minHeight: `${overlayTrackHeight}px`, position: 'relative' }}
          >
            {packedOverlays.items.map(({ item: ov, scene, startMs, durationMs, lane }) => {
              const leftPx = msToPx(startMs);
              const widthPx = msToPx(durationMs);
              const isSelected = ov.id === selectedOverlayId;
              const topPx = 4 + lane * 36;

              const getOverlayIcon = (t: string) => {
                switch (t) {
                  case 'location_pin': return '📍';
                  case 'route_line': return '〰️';
                  case 'highlight_ring': return '⭕';
                  case 'arrow_pointer': return '↗️';
                  case 'callout_label': return '🏷️';
                  default: return '📍';
                }
              };

              return (
                <div
                  key={`overlay-clip-${ov.id}`}
                  className={`ed-overlay-block ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: `${leftPx}px`,
                    width: `${Math.max(26, widthPx)}px`,
                    position: 'absolute',
                    top: `${topPx}px`,
                    height: '32px',
                    borderRadius: '4px',
                    background: isSelected
                      ? 'rgba(6, 182, 212, 0.35)'
                      : 'rgba(6, 182, 212, 0.18)',
                    border: isSelected
                      ? '2px solid #06b6d4'
                      : '1px solid rgba(6, 182, 212, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 6px',
                    gap: '5px',
                    fontSize: '11px',
                    color: isSelected ? '#a5f3fc' : '#67e8f9',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    boxShadow: isSelected ? '0 0 10px rgba(6, 182, 212, 0.5)' : undefined,
                    zIndex: isSelected ? 5 : 2,
                    boxSizing: 'border-box',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectScene(scene.sceneId);
                    if (onSelectOverlay) onSelectOverlay(ov.id);
                  }}
                  title={`${ov.title || ov.type} (${ov.layerPosition === 'below_characters' ? 'Below Characters' : 'Above Characters'}) - ${formatDurationHuman(durationMs)}`}
                >
                  <span style={{ fontSize: '12px', flexShrink: 0 }}>{getOverlayIcon(ov.type)}</span>
                  {widthPx >= 50 && (
                    <span
                      style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {ov.title || ov.type}
                    </span>
                  )}
                  {widthPx >= 120 && (
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: ov.layerPosition === 'below_characters' ? '#93c5fd' : '#a5f3fc',
                        flexShrink: 0,
                      }}
                    >
                      {ov.layerPosition === 'below_characters' ? 'under' : 'over'}
                    </span>
                  )}
                  {widthPx >= 160 && (
                    <span style={{ fontSize: '10px', opacity: 0.8, fontFamily: 'monospace', flexShrink: 0 }}>
                      {formatDurationHuman(durationMs)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Track 4: Narration Voice */}
          <div className="ed-track-row track-narration">
            {scenes.map((scene) => {
              if (!scene.narration && !scene.audioUrl) return null;
              const isSelected = scene.sceneId === activeSceneId;
              const leftPx = msToPx(scene.startMs);
              const audioDuration = scene.actualAudioDurationMs || scene.estimatedDurationMs || 4000;
              const widthPx = msToPx(audioDuration);
              const isOverflow = scene.actualAudioDurationMs && scene.actualAudioDurationMs > (scene.endMs - scene.startMs);
              const isVerified = Boolean(scene.actualAudioDurationMs);

              return (
                <div
                  key={`audio-${scene.sceneId}`}
                  className={`ed-audio-block ${isSelected ? 'selected' : ''} ${isOverflow ? 'overflow' : ''}`}
                  style={{
                    left: `${leftPx}px`,
                    width: `${Math.max(20, widthPx)}px`,
                  }}
                  onClick={() => onSelectScene(scene.sceneId)}
                  title={
                    isOverflow
                      ? `Narration (${formatDurationHuman(audioDuration)}) exceeds clip duration!`
                      : `Narration: ${scene.narration?.slice(0, 40)}...`
                  }
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {isOverflow ? <AlertTriangleIcon size={12} color="#fca5a5" /> : <MicIcon size={11} />}
                  </span>
                  <span>{scene.title} Voice</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    ({isVerified ? (
                      <>
                        {formatDurationHuman(audioDuration)} <CheckIcon size={10} />
                      </>
                    ) : (
                      `~${formatDurationHuman(audioDuration)} est`
                    )})
                  </span>
                </div>
              );
            })}
          </div>

          {/* Track 3: Soundtrack */}
          <div className="ed-track-row track-soundtrack">
            {selectedMusic && selectedMusic !== 'none' && totalDurationMs > 0 && (
              <div
                className="ed-music-block"
                style={{
                  left: '0px',
                  width: `${msToPx(totalDurationMs)}px`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title={`Background Soundtrack: ${selectedMusic}`}
              >
                <MusicIcon size={12} />
                <span>
                  Soundtrack: {selectedMusic.replace('/storage/music/', '').replace(/\.mp3$/, '')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

