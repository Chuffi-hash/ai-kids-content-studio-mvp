import React, { useRef, useState, useEffect, useMemo } from 'react';
import { EditorScene } from '../../types/editor';
import { EducationalOverlayType, SceneDialogue } from '../../types/animation';
import { TimelineContextMenu, TimelineContextMenuTarget } from './TimelineContextMenu';
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
  TrashIcon,
  SearchIcon,
  PlayIcon,
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

function getOverlayIcon(t: string): string {
  switch (t) {
    case 'location_pin': return '📍';
    case 'route_line': return '〰️';
    case 'highlight_ring': return '⭕';
    case 'arrow_pointer': return '↗️';
    case 'callout_label': return '🏷️';
    case 'title_card': return '🪧';
    case 'spotlight': return '🔦';
    case 'glow': return '✨';
    case 'sparkles': return '⭐';
    case 'flying_birds': return '🦅';
    case 'moving_clouds': return '☁️';
    case 'rain': return '🌧️';
    case 'snowfall': return '❄️';
    case 'wind': return '💨';
    case 'falling_leaves': return '🍂';
    case 'sunshine_rays': return '☀️';
    case 'heat_shimmer': return '🔥';
    case 'fog_mist': return '🌫️';
    case 'lightning': return '⚡';
    case 'water_splashes': return '💦';
    case 'butterflies': return '🦋';
    default: return '📍';
  }
}

export interface TimelineOverlayItem {
  item: any;
  scene: EditorScene;
  startMs: number;
  durationMs: number;
  endMs: number;
}

export interface OverlayCluster {
  id: string;
  scene: EditorScene;
  startMs: number;
  endMs: number;
  items: TimelineOverlayItem[];
  isGroup: boolean;
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

  // Context Menu Actions
  onDuplicateScene?: (sceneId: string) => void;
  onDeleteScene?: (sceneId: string) => void;
  onDeleteDialogue?: (dialogueId: string) => void;
  onDeleteOverlay?: (sceneId: string, overlayId: string) => void;
  onDuplicateOverlay?: (sceneId: string, overlayId: string) => void;
  onDeleteInstance?: (sceneId: string, instanceId: string) => void;
  onAddDialogue?: (sceneId: string, startOffsetMs?: number) => void;
  onAddOverlay?: (sceneId: string, type: EducationalOverlayType, startOffsetMs?: number) => void;
  onAddCharacter?: (sceneId: string, charId: 'pip_the_bear' | 'sammy_the_kid') => void;
  onPreviewDialogue?: (dialogue: SceneDialogue) => void;
  onRegenerateDialogue?: (sceneId: string, dialogueId: string) => void;
  /** Called when user clicks a narration clip or the Narration track header — opens Narration inspector */
  onSelectNarration?: (sceneId: string) => void;
  onPreviewNarration?: (scene: EditorScene) => void;
  onRegenerateNarration?: (sceneId: string) => void;
  onSelectTrack?: (track: string) => void;
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
  onDuplicateScene,
  onDeleteScene,
  onDeleteDialogue,
  onDeleteOverlay,
  onDuplicateOverlay,
  onDeleteInstance,
  onAddDialogue,
  onAddOverlay,
  onAddCharacter,
  onPreviewDialogue,
  onRegenerateDialogue,
  onSelectNarration,
  onPreviewNarration,
  onRegenerateNarration,
  onSelectTrack,
}) => {
  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: TimelineContextMenuTarget;
  } | null>(null);

  // Zoom: pixels per second
  const [pxPerSec, setPxPerSec] = useState<number>(45);
  const [localIsRippleOn, setLocalIsRippleOn] = useState<boolean>(true);
  const isRippleOn = isRippleOnProp !== undefined ? isRippleOnProp : localIsRippleOn;
  const handleToggleRipple = onToggleRipple || (() => setLocalIsRippleOn((prev) => !prev));
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);

  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeScene = scenes.find((s) => s.sceneId === activeSceneId) || null;

  // Convert milliseconds to pixels & vice-versa
  const msToPx = (ms: number) => (ms / 1000) * pxPerSec;
  const pxToMs = (px: number) => Math.round((px / pxPerSec) * 1000);

  const handleTrackContextMenu = (e: React.MouseEvent, track: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = scrollContainerRef.current?.getBoundingClientRect();
    const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
    const clickPx = e.clientX - (rect?.left || 0) + scrollLeft - 140; // minus 140px for header
    const clickMs = Math.max(0, pxToMs(clickPx));
    const sceneAtTime = scenes.find((s) => clickMs >= s.startMs && clickMs < s.endMs) || activeScene;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: {
        type: 'empty',
        track,
        timeMs: clickMs,
        sceneId: sceneAtTime?.sceneId,
      },
    });
  };

  // Sub-lane expand / collapse state
  const [isDialogueExpanded, setIsDialogueExpanded] = useState<boolean>(false);

  // Group popover state for overlapping overlays
  const [activeOverlayGroupPopover, setActiveOverlayGroupPopover] = useState<{
    cluster: OverlayCluster;
    anchorRect: { top: number; left: number; bottom: number; right: number };
  } | null>(null);

  // Live search query for effect group popover
  const [overlaySearchQuery, setOverlaySearchQuery] = useState<string>('');

  // Reset search query whenever active popover changes
  useEffect(() => {
    setOverlaySearchQuery('');
  }, [activeOverlayGroupPopover?.cluster.id]);

  const filteredOverlayItems = useMemo(() => {
    if (!activeOverlayGroupPopover) return [];
    const query = overlaySearchQuery.trim().toLowerCase();
    if (!query) return activeOverlayGroupPopover.cluster.items;
    return activeOverlayGroupPopover.cluster.items.filter(({ item: ov }) => {
      const title = (ov.title || '').toLowerCase();
      const type = (ov.type || '').toLowerCase();
      const pos = (ov.layerPosition || '').toLowerCase();
      return title.includes(query) || type.includes(query) || pos.includes(query);
    });
  }, [activeOverlayGroupPopover, overlaySearchQuery]);

  useEffect(() => {
    if (!activeOverlayGroupPopover) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const popoverEl = document.getElementById('ed-overlay-group-popover');
      if (popoverEl && !popoverEl.contains(e.target as Node)) {
        setActiveOverlayGroupPopover(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveOverlayGroupPopover(null);
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeOverlayGroupPopover]);

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

  const dialogueTrackHeight = isDialogueExpanded
    ? Math.max(46, packedDialogues.totalLanes * 26 + 8)
    : (packedDialogues.totalLanes > 1 ? 58 : 46);

  // Compact non-stacking overlay clustering: groups overlapping effects into a single badge
  const overlayClusters = React.useMemo<OverlayCluster[]>(() => {
    const clusters: OverlayCluster[] = [];

    for (const scene of scenes) {
      const ovs = scene.animationData?.overlays || [];
      if (ovs.length === 0) continue;
      const sceneDuration = scene.endMs > scene.startMs ? scene.endMs - scene.startMs : scene.estimatedDurationMs || 5000;

      // Default duration to min(6000, sceneDuration) instead of the entire sceneDuration
      // to avoid artificial whole-scene group stretching.
      const rawItems = ovs.map((ov) => {
        const startOffset = Math.max(0, ov.startMs || 0);
        const startMs = scene.startMs + startOffset;
        const rawDur = ov.durationMs !== undefined ? Math.max(300, ov.durationMs) : Math.min(6000, sceneDuration);
        return {
          item: ov,
          scene,
          startMs,
          durationMs: rawDur,
          endMs: startMs + rawDur,
        };
      });

      // Sort ascending by startMs, then by endMs
      rawItems.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

      // Check if all items in this scene share essentially identical timing
      const allShareIdenticalTiming =
        rawItems.length > 1 &&
        rawItems.every(
          (it) =>
            Math.abs(it.startMs - rawItems[0].startMs) < 250 &&
            Math.abs(it.durationMs - rawItems[0].durationMs) < 250
        );

      if (allShareIdenticalTiming) {
        clusters.push({
          id: `cluster-${scene.sceneId}-all`,
          scene,
          startMs: rawItems[0].startMs,
          endMs: rawItems[0].endMs,
          items: rawItems,
          isGroup: true,
        });
        continue;
      }

      // When effects do NOT all share identical timing:
      // Do not show a scene-wide group clip!
      // If an initial ambient effect begins at scene start and spans >= 85% of scene,
      // but there are other localized effects starting later, clamp the visual bar
      // of the first effect to the start of the next effect or min(6000, sceneDuration)
      // so the initial weather effect renders cleanly (like "sunshine rays" or "falling leaves 6.0s" in Photo 2)
      // without swallowing all subsequent effects.
      const hasLaterItems = rawItems.length > 1 && rawItems.some((it) => it.startMs - scene.startMs >= 2000);
      const items: TimelineOverlayItem[] = rawItems.map((it, idx) => {
        if (hasLaterItems && idx === 0 && it.startMs === scene.startMs && it.durationMs >= sceneDuration - 500) {
          const nextStart = rawItems[1].startMs;
          const effectiveDur = Math.max(1500, Math.min(6000, nextStart - scene.startMs));
          return {
            ...it,
            durationMs: effectiveDur,
            endMs: it.startMs + effectiveDur,
          };
        }
        return it;
      });

      let currentCluster: OverlayCluster | null = null;
      for (const it of items) {
        if (!currentCluster) {
          currentCluster = {
            id: `cluster-${scene.sceneId}-${it.item.id}`,
            scene,
            startMs: it.startMs,
            endMs: it.endMs,
            items: [it],
            isGroup: false,
          };
        } else {
          // If overlaps with current cluster (with 80ms buffer)
          if (it.startMs < currentCluster.endMs - 80) {
            currentCluster.items.push(it);
            currentCluster.endMs = Math.max(currentCluster.endMs, it.endMs);
            currentCluster.isGroup = true;
          } else {
            clusters.push(currentCluster);
            currentCluster = {
              id: `cluster-${scene.sceneId}-${it.item.id}`,
              scene,
              startMs: it.startMs,
              endMs: it.endMs,
              items: [it],
              isGroup: false,
            };
          }
        }
      }
      if (currentCluster) {
        clusters.push(currentCluster);
      }
    }

    return clusters;
  }, [scenes]);

  // Synchronize activeOverlayGroupPopover when overlayClusters changes (e.g., overlay deleted or added)
  useEffect(() => {
    if (!activeOverlayGroupPopover) return;
    const matching = overlayClusters.find(
      (c) =>
        c.id === activeOverlayGroupPopover.cluster.id ||
        (c.scene.sceneId === activeOverlayGroupPopover.cluster.scene.sceneId && c.isGroup)
    );
    if (!matching || matching.items.length <= 1) {
      setActiveOverlayGroupPopover(null);
    } else {
      setActiveOverlayGroupPopover((prev) => (prev ? { ...prev, cluster: matching } : null));
    }
  }, [overlayClusters]);

  const overlayTrackHeight = 44;

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

  // Dragging overlay clip horizontally within scene
  const handleOverlayMouseDown = (
    e: React.MouseEvent,
    scene: EditorScene,
    overlayId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectScene(scene.sceneId);

    const overlays = scene.animationData?.overlays || [];
    const targetOv = overlays.find((o) => o.id === overlayId);
    if (!targetOv) return;

    if (onSelectOverlay) {
      onSelectOverlay(overlayId);
    }

    const startX = e.clientX;
    const initialStartMs = targetOv.startMs || 0;
    const sceneDuration = scene.endMs - scene.startMs;
    const ovDuration = targetOv.durationMs !== undefined ? targetOv.durationMs : sceneDuration;
    const maxStart = Math.max(0, sceneDuration - Math.min(ovDuration, 500));

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

      const updatedOverlays = overlays.map((o) =>
        o.id === overlayId ? { ...o, startMs: newStartMs } : o
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
            overlays: updatedOverlays,
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

  // Trimming / resizing overlay right handle
  const handleOverlayResizeRightMouseDown = (
    e: React.MouseEvent,
    scene: EditorScene,
    overlayId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const overlays = scene.animationData?.overlays || [];
    const targetOv = overlays.find((o) => o.id === overlayId);
    if (!targetOv) return;

    const startX = e.clientX;
    const sceneDuration = scene.endMs - scene.startMs;
    const initialDuration = targetOv.durationMs !== undefined ? targetOv.durationMs : sceneDuration;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX;
      const deltaMs = pxToMs(deltaPx);
      let newDuration = Math.round((initialDuration + deltaMs) / 50) * 50;
      const maxDuration = Math.max(500, sceneDuration - (targetOv.startMs || 0));
      newDuration = Math.max(500, Math.min(maxDuration, newDuration));

      const updatedOverlays = overlays.map((o) =>
        o.id === overlayId ? { ...o, durationMs: newDuration } : o
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
            overlays: updatedOverlays,
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
            title="Ripple Edit (ON/OFF): When ripple edit is ON, adjusting a scene duration automatically shifts all downstream scenes and audio to prevent unwanted gaps or overlaps."
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
          <div
            className="ed-track-header track-visuals"
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectTrack?.('visuals')}
            title="Click to open Scene Overview properties"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectTrack?.('visuals');
              setContextMenu({ x: e.clientX, y: e.clientY, target: { type: 'header', track: 'track-visuals', sceneId: activeSceneId || undefined } });
            }}
          >
            <FilmIcon size={13} />
            <span>Visuals</span>
          </div>
          <div
            className="ed-track-header track-rig"
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectTrack?.('rig')}
            title="Click to open 2D Rigging & Character settings"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectTrack?.('rig');
              setContextMenu({ x: e.clientX, y: e.clientY, target: { type: 'header', track: 'track-rig', sceneId: activeSceneId || undefined } });
            }}
          >
            <SparklesIcon size={13} color="#a78bfa" />
            <span>2D Rig</span>
          </div>
          <div
            className="ed-track-header track-dialogue"
            style={{ height: `${dialogueTrackHeight}px`, minHeight: `${dialogueTrackHeight}px`, cursor: 'pointer' }}
            onClick={() => onSelectTrack?.('dialogue')}
            title="Click to open Character Dialogue & Voice settings"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectTrack?.('dialogue');
              setContextMenu({ x: e.clientX, y: e.clientY, target: { type: 'header', track: 'track-dialogue', sceneId: activeSceneId || undefined } });
            }}
          >
            <span style={{ fontSize: '13px' }}>👄</span>
            <span style={{ flex: 1 }}>Dialogue</span>
            {packedDialogues.totalLanes > 1 && (
              <button
                type="button"
                className="ed-track-lane-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDialogueExpanded(!isDialogueExpanded);
                }}
                title={isDialogueExpanded ? 'Collapse dialogue sub-lanes' : 'Expand all dialogue sub-lanes'}
              >
                {isDialogueExpanded ? `▾ ${packedDialogues.totalLanes}L` : `▸ ${packedDialogues.totalLanes}L`}
              </button>
            )}
          </div>
          <div
            className="ed-track-header track-overlays"
            style={{ height: `${overlayTrackHeight}px`, minHeight: `${overlayTrackHeight}px`, cursor: 'pointer' }}
            onClick={() => onSelectTrack?.('overlays')}
            title="Click to open Overlays & Effects settings"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectTrack?.('overlays');
              setContextMenu({ x: e.clientX, y: e.clientY, target: { type: 'header', track: 'track-overlays', sceneId: activeSceneId || undefined } });
            }}
          >
            <span style={{ fontSize: '13px' }}>📍</span>
            <span style={{ flex: 1 }}>Overlays</span>
          </div>
          <div
            className="ed-track-header track-narration"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              if (activeSceneId && onSelectNarration) onSelectNarration(activeSceneId);
              else onSelectTrack?.('narration');
            }}
            title="Click to open Narration Voice Studio in the right panel"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (activeSceneId && onSelectNarration) onSelectNarration(activeSceneId);
              else onSelectTrack?.('narration');
              setContextMenu({ x: e.clientX, y: e.clientY, target: { type: 'header', track: 'track-narration', sceneId: activeSceneId || undefined } });
            }}
          >
            <MicIcon size={13} />
            <span>Narration</span>
          </div>
          <div
            className="ed-track-header track-soundtrack"
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectTrack?.('soundtrack')}
            title="Click to open Soundtrack & Music audio options"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectTrack?.('soundtrack');
              setContextMenu({ x: e.clientX, y: e.clientY, target: { type: 'header', track: 'track-soundtrack', sceneId: activeSceneId || undefined } });
            }}
          >
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
          <div
            className="ed-track-row track-visuals"
            onContextMenu={(e) => handleTrackContextMenu(e, 'track-visuals')}
          >
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectScene(scene.sceneId);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      target: { type: 'scene', scene },
                    });
                  }}
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
          <div
            className="ed-track-row track-rig"
            onContextMenu={(e) => handleTrackContextMenu(e, 'track-rig')}
          >
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
                        ? 'var(--ed-rig-border)'
                        : 'var(--ed-rig-bg)',
                      border: isSelected
                        ? '2px solid var(--ed-rig-border)'
                        : '1px solid var(--ed-rig-border)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 8px',
                      gap: '6px',
                      fontSize: '11px',
                      color: isSelected ? 'var(--ed-rig-text-dim)' : 'var(--ed-rig-text)',
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectScene(scene.sceneId);
                      if (onSelectInstance) onSelectInstance(inst.instanceId);
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        target: {
                          type: 'instance',
                          scene,
                          instanceId: inst.instanceId,
                          characterName: inst.name,
                        },
                      });
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
            onContextMenu={(e) => handleTrackContextMenu(e, 'track-dialogue')}
          >
            {packedDialogues.items.map(({ item: dlg, scene, startMs, durationMs, lane }) => {
              const leftPx = msToPx(startMs);
              const widthPx = msToPx(durationMs);
              const isSelected = dlg.id === selectedDialogueId;
              const sceneDuration = scene.endMs - scene.startMs;
              const isOverflow = (dlg.startMs || 0) + durationMs > sceneDuration;
              const hasAudio = Boolean(dlg.audioUrl);
              const visemeCount = dlg.visemeCues?.length || 0;
              const topPx = 3 + lane * 26;

              return (
                <div
                  key={`dlg-clip-${dlg.id}`}
                  className={`ed-dialogue-block ${isSelected ? 'selected' : ''} ${isOverflow ? 'overflow' : ''}`}
                  style={{
                    left: `${leftPx}px`,
                    width: `${Math.max(28, widthPx)}px`,
                    position: 'absolute',
                    top: `${topPx}px`,
                    height: '22px',
                    borderRadius: '4px',
                    background: isOverflow
                      ? 'rgba(239, 68, 68, 0.25)'
                      : isSelected
                      ? 'var(--ed-dialogue-border)'
                      : 'var(--ed-dialogue-bg)',
                    border: isOverflow
                      ? '2px solid #ef4444'
                      : isSelected
                      ? '2px solid var(--ed-dialogue-border)'
                      : '1px solid var(--ed-dialogue-border)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 6px',
                    gap: '5px',
                    fontSize: '11px',
                    color: isOverflow ? '#ef4444' : isSelected ? 'var(--ed-dialogue-text-dim)' : 'var(--ed-dialogue-text)',
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectScene(scene.sceneId);
                    if (onSelectDialogue) onSelectDialogue(dlg.id);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      target: { type: 'dialogue', scene, dialogue: dlg },
                    });
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
            onContextMenu={(e) => handleTrackContextMenu(e, 'track-overlays')}
          >
            {overlayClusters.map((cluster) => {
              if (cluster.isGroup) {
                const leftPx = msToPx(cluster.startMs);
                const widthPx = msToPx(cluster.endMs - cluster.startMs);
                const hasSelected = cluster.items.some((i) => i.item.id === selectedOverlayId);
                const primaryItem = cluster.items[0].item;
                const primaryIcon = getOverlayIcon(primaryItem.type);
                const primaryTitle = primaryItem.title || primaryItem.type;
                const durationSec = ((cluster.endMs - cluster.startMs) / 1000).toFixed(1);

                return (
                  <div
                    key={cluster.id}
                    className={`ed-overlay-group-badge ${hasSelected ? 'has-selected' : ''}`}
                    style={{
                      left: `${leftPx}px`,
                      width: `${Math.max(72, widthPx)}px`,
                      zIndex: hasSelected ? 6 : 3,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActiveOverlayGroupPopover(
                        activeOverlayGroupPopover?.cluster.id === cluster.id ? null : { cluster, anchorRect: rect }
                      );
                    }}
                    title={`${cluster.items.length} Effects: ${cluster.items.map((i) => i.item.title || i.item.type).join(', ')} (${durationSec}s) - Click to inspect/edit`}
                  >
                    <span style={{ fontSize: '12px', flexShrink: 0 }}>{primaryIcon}</span>
                    {widthPx >= 90 && (
                      <span className="ed-overlay-group-title">
                        {primaryTitle}
                      </span>
                    )}
                    <span className="ed-overlay-group-count">
                      {cluster.items.length} effects
                    </span>
                    {widthPx >= 140 && (
                      <span className="ed-overlay-group-duration">
                        {durationSec}s
                      </span>
                    )}
                    <span style={{ fontSize: '9px', opacity: 0.8, flexShrink: 0 }}>▾</span>
                  </div>
                );
              }

              const { item: ov, scene, startMs, durationMs } = cluster.items[0];
              const leftPx = msToPx(startMs);
              const widthPx = msToPx(durationMs);
              const isSelected = ov.id === selectedOverlayId;

              return (
                <div
                  key={`overlay-clip-${ov.id}`}
                  className={`ed-overlay-block ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: `${leftPx}px`,
                    width: `${Math.max(26, widthPx)}px`,
                    position: 'absolute',
                    top: '10px',
                    height: '24px',
                    borderRadius: '4px',
                    background: isSelected
                      ? 'var(--ed-overlay-border)'
                      : 'var(--ed-overlay-bg)',
                    border: isSelected
                      ? '2px solid var(--ed-overlay-border)'
                      : '1px solid var(--ed-overlay-border)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 6px',
                    gap: '4px',
                    fontSize: '11px',
                    color: isSelected ? 'var(--ed-overlay-text-dim)' : 'var(--ed-overlay-text)',
                    cursor: 'grab',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    boxShadow: isSelected ? '0 0 10px rgba(6, 182, 212, 0.5)' : undefined,
                    zIndex: isSelected ? 5 : 2,
                    boxSizing: 'border-box',
                  }}
                  onMouseDown={(e) => handleOverlayMouseDown(e, scene, ov.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectScene(scene.sceneId);
                    if (onSelectOverlay) onSelectOverlay(ov.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectScene(scene.sceneId);
                    if (onSelectOverlay) onSelectOverlay(ov.id);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      target: { type: 'overlay', scene, overlay: ov },
                    });
                  }}
                  title={`${ov.title || ov.type} (${ov.layerPosition === 'below_characters' ? 'Below Characters' : 'Above Characters'}) • Start: +${((ov.startMs || 0) / 1000).toFixed(1)}s • Duration: ${(durationMs / 1000).toFixed(1)}s`}
                >
                  <span style={{ fontSize: '11px', flexShrink: 0 }}>{getOverlayIcon(ov.type)}</span>
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
                        padding: '1px 3px',
                        borderRadius: '3px',
                        background: 'rgba(0, 0, 0, 0.1)',
                        flexShrink: 0,
                      }}
                    >
                      {ov.layerPosition === 'below_characters' ? 'under' : 'over'}
                    </span>
                  )}
                  {widthPx >= 160 && (
                    <span style={{ fontSize: '9px', opacity: 0.8, fontFamily: 'monospace', flexShrink: 0 }}>
                      {formatDurationHuman(durationMs)}
                    </span>
                  )}

                  {/* Right trim handle */}
                  <div
                    className="ed-overlay-handle right"
                    onMouseDown={(e) => handleOverlayResizeRightMouseDown(e, scene, ov.id)}
                    title="Drag to trim overlay duration"
                  />
                </div>
              );
            })}
          </div>

          {/* Track 4: Narration Voice */}
          <div
            className="ed-track-row track-narration"
            onContextMenu={(e) => {
              if (activeSceneId && onSelectNarration) onSelectNarration(activeSceneId);
              handleTrackContextMenu(e, 'track-narration');
            }}
          >
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectScene(scene.sceneId);
                    if (onSelectNarration) onSelectNarration(scene.sceneId);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectScene(scene.sceneId);
                    if (onSelectNarration) onSelectNarration(scene.sceneId);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      target: { type: 'narration', scene },
                    });
                  }}
                  title={
                    isOverflow
                      ? `Narration (${formatDurationHuman(audioDuration)}) exceeds clip duration!`
                      : `Narration: ${scene.narration?.slice(0, 40)}... (Click or right-click to edit voice & script in Narration Studio)`
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
          <div
            className="ed-track-row track-soundtrack"
            onContextMenu={(e) => handleTrackContextMenu(e, 'track-soundtrack')}
          >
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

      {/* Overlapping Effects Popover */}
      {activeOverlayGroupPopover && (() => {
        const popoverWidth = 320;
        const popoverMaxHeight = Math.min(360, Math.max(160, activeOverlayGroupPopover.anchorRect.top - 24));
        const top = Math.max(12, activeOverlayGroupPopover.anchorRect.top - popoverMaxHeight - 8);
        const left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, activeOverlayGroupPopover.anchorRect.left));

        return (
          <div
            id="ed-overlay-group-popover"
            className="ed-overlay-popover"
            style={{
              position: 'fixed',
              top: `${top}px`,
              left: `${left}px`,
              width: `${popoverWidth}px`,
              maxHeight: `${popoverMaxHeight}px`,
              zIndex: 9999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ed-overlay-popover-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px' }}>✨</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ed-text)' }}>
                  Effect Group ({activeOverlayGroupPopover.cluster.items.length})
                </span>
                <span className="ed-overlay-popover-badge">
                  {((activeOverlayGroupPopover.cluster.endMs - activeOverlayGroupPopover.cluster.startMs) / 1000).toFixed(1)}s
                </span>
              </div>
              <button
                type="button"
                className="ed-icon-btn"
                onClick={() => setActiveOverlayGroupPopover(null)}
                title="Close"
                style={{ width: '22px', height: '22px', fontSize: '10px', display: 'grid', placeItems: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* Live Search Input */}
            <div className="ed-overlay-popover-search">
              <SearchIcon size={12} color="var(--ed-text-muted)" />
              <input
                type="text"
                className="ed-overlay-popover-input"
                placeholder="Filter effects in group..."
                value={overlaySearchQuery}
                onChange={(e) => setOverlaySearchQuery(e.target.value)}
                autoFocus
              />
              {overlaySearchQuery && (
                <button
                  type="button"
                  className="ed-overlay-popover-clear"
                  onClick={() => setOverlaySearchQuery('')}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Scrollable list of effects */}
            <div className="ed-overlay-popover-list">
              {filteredOverlayItems.length === 0 ? (
                <div className="ed-overlay-popover-empty">
                  No effects matching "{overlaySearchQuery}"
                </div>
              ) : (
                filteredOverlayItems.map(({ item: ov, scene, startMs, durationMs }) => {
                  const isSelected = ov.id === selectedOverlayId;
                  return (
                    <div
                      key={ov.id}
                      className={`ed-overlay-popover-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        onSelectScene(scene.sceneId);
                        if (onSelectOverlay) onSelectOverlay(ov.id);
                        setActiveOverlayGroupPopover(null);
                      }}
                      title="Click to select and inspect"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '14px', flexShrink: 0 }}>{getOverlayIcon(ov.type)}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ov.title || ov.type}
                          </span>
                          <span style={{ fontSize: '9px', color: 'var(--ed-text-muted)', fontFamily: 'monospace' }}>
                            +{((ov.startMs || 0) / 1000).toFixed(1)}s | {(durationMs / 1000).toFixed(1)}s • {ov.layerPosition === 'below_characters' ? 'below' : 'above'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="ed-tool-btn"
                          style={{ fontSize: '10px', padding: '2px 5px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSeek(startMs);
                          }}
                          title="Seek playhead to effect start to preview"
                        >
                          <PlayIcon size={9} />
                          <span>Seek</span>
                        </button>
                        <button
                          type="button"
                          className="ed-tool-btn primary"
                          style={{ fontSize: '10px', padding: '2px 6px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectScene(scene.sceneId);
                            if (onSelectOverlay) onSelectOverlay(ov.id);
                            setActiveOverlayGroupPopover(null);
                          }}
                          title="Inspect and edit overlay"
                        >
                          Edit
                        </button>
                        {onDuplicateOverlay && (
                          <button
                            type="button"
                            className="ed-tool-btn"
                            style={{ fontSize: '10px', padding: '2px 5px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateOverlay(scene.sceneId, ov.id);
                            }}
                            title="Duplicate effect"
                          >
                            Copy
                          </button>
                        )}
                        {onDeleteOverlay && (
                          <button
                            type="button"
                            className="ed-tool-btn"
                            style={{ fontSize: '10px', padding: '2px 5px', color: '#ef4444' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteOverlay(scene.sceneId, ov.id);
                              setActiveOverlayGroupPopover((prev) => {
                                if (!prev) return null;
                                const remaining = prev.cluster.items.filter((it) => it.item.id !== ov.id);
                                if (remaining.length <= 1) return null;
                                return {
                                  ...prev,
                                  cluster: {
                                    ...prev.cluster,
                                    items: remaining,
                                  },
                                };
                              });
                            }}
                            title="Delete effect"
                          >
                            <TrashIcon size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}

      {/* Right-click Context Menu */}
      {contextMenu && (
        <TimelineContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          target={contextMenu.target}
          onClose={() => setContextMenu(null)}
          playheadMs={playheadMs}
          onAddScene={onAddScene}
          onAddDialogue={onAddDialogue}
          onAddOverlay={onAddOverlay}
          onAddCharacter={onAddCharacter}
          onSeek={onSeek}
          onSelectScene={onSelectScene}
          onSelectDialogue={onSelectDialogue}
          onSelectOverlay={onSelectOverlay}
          onSelectInstance={onSelectInstance}
          onDuplicateScene={onDuplicateScene}
          onDeleteScene={onDeleteScene}
          onSplitScene={onSplitScene}
          onDeleteDialogue={onDeleteDialogue}
          onDeleteOverlay={onDeleteOverlay}
          onDuplicateOverlay={onDuplicateOverlay}
          onDeleteInstance={onDeleteInstance}
          onPreviewDialogue={onPreviewDialogue}
          onRegenerateDialogue={onRegenerateDialogue}
          onSelectNarration={onSelectNarration}
          onPreviewNarration={onPreviewNarration}
          onRegenerateNarration={onRegenerateNarration}
          onSelectTrack={onSelectTrack}
        />
      )}
    </div>
  );
};

