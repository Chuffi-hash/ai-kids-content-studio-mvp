import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  EditorStory,
  EditorScene,
  SceneVersionItem,
  SaveStatus,
  HistorySnapshot,
} from '../types/editor';
import { CharacterInstance, AnimationClip, VectorSceneData, EducationalOverlay } from '../types/animation';
import * as editorService from '../services/editor.service';
import { generateScenes } from '../services/content.service';
import { generateCharacterReferenceImage } from '../services/character.service';
import { recalculateContiguousTimeline, validateSceneTiming, calculateRippleEdit } from '../utils/timingEngine';
import { EditorAudioManager } from '../utils/editorAudioManager';
import { TopToolbar } from '../components/editor/TopToolbar';
import { LeftAssetPanel } from '../components/editor/LeftAssetPanel';
import { PreviewCanvas } from '../components/editor/PreviewCanvas';
import { PropertiesInspector } from '../components/editor/PropertiesInspector';
import { Timeline } from '../components/editor/Timeline';
import { ExportModal } from '../components/editor/ExportModal';
import { StoryDetailsModal } from '../components/editor/StoryDetailsModal';
import { CharacterBuilderModal } from '../components/characters/CharacterBuilderModal';
import { buildRigFromAppearance } from '../utils/customCharacterRig';
import { createCharacter, updateCharacter } from '../services/character.service';
import { AlertTriangleIcon, ArrowLeftIcon, FilmIcon, SparklesIcon, PlusIcon } from '../components/common/Icons';
import '../components/editor/editor.css';

export default function StoryDetailPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const navigate = useNavigate();

  // Primary state
  const [story, setStory] = useState<EditorStory | null>(null);
  const [scenes, setScenes] = useState<EditorScene[]>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [activeVersions, setActiveVersions] = useState<SceneVersionItem[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null);
  const [isStoryDetailsOpen, setIsStoryDetailsOpen] = useState<boolean>(false);
  const [isCharacterBuilderOpen, setIsCharacterBuilderOpen] = useState<boolean>(false);

  // Playback & timeline state
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [previewMode, setPreviewMode] = useState<'scene' | 'export'>('scene');
  const [exportVideoUrl, setExportVideoUrl] = useState<string | null>(null);

  // Master Volume & Audio Manager state
  const [masterVolume, setMasterVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isRippleOn, setIsRippleOn] = useState<boolean>(true);
  const audioManagerRef = useRef<EditorAudioManager | null>(null);

  // Background music state
  const [selectedMusic, setSelectedMusic] = useState<string | null>('gentle-storybook');
  const [musicVolume, setMusicVolume] = useState<number>(0.2);

  // Persistence & save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Active AI generation states
  const [generatingImageForScene, setGeneratingImageForScene] = useState<string | null>(null);
  const [generatingVoiceForScene, setGeneratingVoiceForScene] = useState<string | null>(null);
  const [generatingVideoForScene, setGeneratingVideoForScene] = useState<string | null>(null);
  const [generatingAllScenes, setGeneratingAllScenes] = useState<boolean>(false);

  // Export modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Loading & error state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);

  // Undo / Redo History stack
  const [history, setHistory] = useState<{
    past: HistorySnapshot[];
    future: HistorySnapshot[];
  }>({ past: [], future: [] });

  // Refs for debounced autosave and playback loop
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMountRef = useRef<boolean>(true);
  const lastTickRef = useRef<number>(performance.now());
  const animationFrameRef = useRef<number | null>(null);
  const latestScenesRef = useRef<EditorScene[]>(scenes);
  latestScenesRef.current = scenes;

  // ----------------------------------------------------
  // Initial Data Loading
  // ----------------------------------------------------
  const loadStoryData = useCallback(async () => {
    if (!storyId) return;
    try {
      setIsLoading(true);
      setInitialLoadError(null);
      const loadedStory = await editorService.fetchEditorStory(storyId);
      
      // Ensure scenes have contiguous timeline timing
      const rawScenes = loadedStory.scenes || [];
      const orderedScenes = rawScenes.length > 0
        ? recalculateContiguousTimeline(rawScenes)
        : [];

      setStory(loadedStory);
      setScenes(orderedScenes);

      if (orderedScenes.length > 0) {
        const initialSceneId = orderedScenes[0].sceneId;
        setActiveSceneId(initialSceneId);
        // Load version history for initial scene
        try {
          const versions = await editorService.getSceneVersions(initialSceneId);
          setActiveVersions(versions);
        } catch (e) {
          console.warn('Could not load versions:', e);
        }
      }

      setSaveStatus('saved');
    } catch (err: any) {
      console.error('Failed to load story:', err);
      setInitialLoadError(err.message || 'Failed to load story editor');
    } finally {
      setIsLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    loadStoryData();
  }, [loadStoryData]);

  // Load versions whenever active scene changes
  useEffect(() => {
    if (!activeSceneId) {
      setActiveVersions([]);
      return;
    }
    let cancelled = false;
    editorService
      .getSceneVersions(activeSceneId)
      .then((vers) => {
        if (!cancelled) setActiveVersions(vers);
      })
      .catch((err) => {
        console.warn('Failed to load scene versions:', err);
        if (!cancelled) setActiveVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSceneId]);

  // ----------------------------------------------------
  // History Record Helper (Undo / Redo)
  // ----------------------------------------------------
  const pushHistorySnapshot = useCallback(
    (currentScenes: EditorScene[], title?: string, targetDuration?: number | null) => {
      const snapshot: HistorySnapshot = {
        scenes: JSON.parse(JSON.stringify(currentScenes)),
        title: title ?? story?.title ?? 'Untitled Story',
        targetDuration: targetDuration ?? story?.targetDuration ?? null,
        activeSceneId,
      };

      setHistory((prev) => ({
        past: [...prev.past.slice(-29), snapshot], // keep last 30 snapshots
        future: [],
      }));
    },
    [story?.title, story?.targetDuration, activeSceneId]
  );

  // ----------------------------------------------------
  // Debounced Autosave Engine
  // ----------------------------------------------------
  const triggerDebouncedSave = useCallback(
    (updatedScenes: EditorScene[], updatedStory?: Partial<EditorStory>) => {
      if (isInitialMountRef.current) {
        isInitialMountRef.current = false;
        return;
      }

      setSaveStatus('saving');
      setSaveError(null);

      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }

      autosaveTimeoutRef.current = setTimeout(async () => {
        if (!storyId) return;
        try {
          // Save scene timeline and metadata in parallel
          const promises: Promise<any>[] = [];

          if (updatedScenes.length > 0) {
            promises.push(editorService.batchSaveTimeline(storyId, updatedScenes));
          }

          if (updatedStory) {
            promises.push(
              editorService.saveStoryMetadata(storyId, {
                title: updatedStory.title,
                targetDuration: updatedStory.targetDuration,
                logline: updatedStory.logline,
                lesson: updatedStory.lesson,
              })
            );
          }

          await Promise.all(promises);
          setSaveStatus('saved');
        } catch (err: any) {
          console.error('Autosave error:', err);
          setSaveStatus('error');
          setSaveError(err.message || 'Autosave failed');
        }
      }, 800);
    },
    [storyId]
  );

  // Manual save retry handler
  const handleRetrySave = () => {
    triggerDebouncedSave(latestScenesRef.current, story || undefined);
  };

  // ----------------------------------------------------
  // Timeline Duration & Scene Synchronizer
  // ----------------------------------------------------
  const totalDurationMs = scenes.length > 0
    ? Math.max(...scenes.map((s) => s.endMs || 0), 1000)
    : 0;

  // Sync playhead with active scene
  useEffect(() => {
    if (scenes.length === 0) return;
    const sceneAtPlayhead = scenes.find(
      (s) => currentTimeMs >= s.startMs && (currentTimeMs < s.endMs || (currentTimeMs === totalDurationMs && currentTimeMs <= s.endMs))
    );
    if (sceneAtPlayhead && sceneAtPlayhead.sceneId !== activeSceneId) {
      setActiveSceneId(sceneAtPlayhead.sceneId);
    }
  }, [currentTimeMs, scenes, activeSceneId, totalDurationMs]);

  // ----------------------------------------------------
  // Audio Manager Lifecycle & Multi-Track Audio Sync
  // ----------------------------------------------------
  useEffect(() => {
    audioManagerRef.current = new EditorAudioManager();
    return () => {
      audioManagerRef.current?.destroy();
      audioManagerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!audioManagerRef.current) return;
    if (previewMode === 'export') {
      audioManagerRef.current.stopAll();
      return;
    }
    audioManagerRef.current.syncPlayback({
      scenes,
      currentTimeMs,
      isPlaying,
      masterVolume,
      isMuted,
      selectedMusic,
      musicVolume,
    });
  }, [scenes, currentTimeMs, isPlaying, masterVolume, isMuted, selectedMusic, musicVolume, previewMode]);

  // ----------------------------------------------------
  // High-Precision Playback Loop
  // ----------------------------------------------------
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    lastTickRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      setCurrentTimeMs((prev) => {
        const nextTime = prev + delta;
        if (nextTime >= totalDurationMs) {
          setIsPlaying(false);
          return totalDurationMs; // Clean stop at final boundary
        }
        return nextTime;
      });

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, totalDurationMs]);

  // ----------------------------------------------------
  // Playhead & Transport Controls
  // ----------------------------------------------------
  const handleTogglePlay = () => {
    if (!isPlaying && currentTimeMs >= totalDurationMs - 100) {
      setCurrentTimeMs(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleRewind = () => {
    setIsPlaying(false);
    setCurrentTimeMs(0);
    if (scenes.length > 0) {
      setActiveSceneId(scenes[0].sceneId);
    }
  };

  const handleSeek = (newMs: number) => {
    const clampedMs = Math.max(0, Math.min(newMs, totalDurationMs));
    setCurrentTimeMs(clampedMs);
    const sceneAtPlayhead = scenes.find(
      (s) => clampedMs >= s.startMs && (clampedMs < s.endMs || (clampedMs === totalDurationMs && clampedMs <= s.endMs))
    );
    if (sceneAtPlayhead && sceneAtPlayhead.sceneId !== activeSceneId) {
      setActiveSceneId(sceneAtPlayhead.sceneId);
    }
  };

  // ----------------------------------------------------
  // Undo & Redo Handlers
  // ----------------------------------------------------
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const handleUndo = () => {
    if (!canUndo) return;
    const previousSnapshot = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, -1);

    const currentSnapshot: HistorySnapshot = {
      scenes: JSON.parse(JSON.stringify(scenes)),
      title: story?.title || '',
      targetDuration: story?.targetDuration,
      activeSceneId,
    };

    setHistory({
      past: newPast,
      future: [currentSnapshot, ...history.future],
    });

    setScenes(previousSnapshot.scenes);
    if (story) {
      setStory({
        ...story,
        title: previousSnapshot.title,
        targetDuration: previousSnapshot.targetDuration,
      });
    }
    if (previousSnapshot.activeSceneId) {
      setActiveSceneId(previousSnapshot.activeSceneId);
    }

    triggerDebouncedSave(previousSnapshot.scenes, {
      title: previousSnapshot.title,
      targetDuration: previousSnapshot.targetDuration,
    });
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const nextSnapshot = history.future[0];
    const newFuture = history.future.slice(1);

    const currentSnapshot: HistorySnapshot = {
      scenes: JSON.parse(JSON.stringify(scenes)),
      title: story?.title || '',
      targetDuration: story?.targetDuration,
      activeSceneId,
    };

    setHistory({
      past: [...history.past, currentSnapshot],
      future: newFuture,
    });

    setScenes(nextSnapshot.scenes);
    if (story) {
      setStory({
        ...story,
        title: nextSnapshot.title,
        targetDuration: nextSnapshot.targetDuration,
      });
    }
    if (nextSnapshot.activeSceneId) {
      setActiveSceneId(nextSnapshot.activeSceneId);
    }

    triggerDebouncedSave(nextSnapshot.scenes, {
      title: nextSnapshot.title,
      targetDuration: nextSnapshot.targetDuration,
    });
  };

  // ----------------------------------------------------
  // Global Keyboard Shortcuts (Space, Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z)
  // ----------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, handleUndo, handleRedo]);

  // ----------------------------------------------------
  // Title & Target Duration Updates
  // ----------------------------------------------------
  const handleTitleChange = (newTitle: string) => {
    if (!story) return;
    pushHistorySnapshot(scenes, newTitle);
    const updated = { ...story, title: newTitle };
    setStory(updated);
    triggerDebouncedSave(scenes, updated);
  };

  const handleTargetDurationChange = (newTargetMs: number | null) => {
    if (!story) return;
    pushHistorySnapshot(scenes, story.title, newTargetMs);
    const updated = { ...story, targetDuration: newTargetMs };
    setStory(updated);
    triggerDebouncedSave(scenes, updated);
  };

  // ----------------------------------------------------
  // Scene Selection
  // ----------------------------------------------------
  const handleSelectScene = (sceneId: string) => {
    setActiveSceneId(sceneId);
    const targetScene = scenes.find((s) => s.sceneId === sceneId);
    if (targetScene) {
      // Seek playhead to start of scene if playhead is outside its range
      if (currentTimeMs < targetScene.startMs || currentTimeMs >= targetScene.endMs) {
        setCurrentTimeMs(targetScene.startMs);
      }
    }
  };

  // ----------------------------------------------------
  // Scene CRUD Operations
  // ----------------------------------------------------
  const handleAddScene = async () => {
    if (!storyId) return;
    try {
      pushHistorySnapshot(scenes);
      const newOrder = scenes.length;
      const defaultDuration = 5000;
      const lastSceneEnd = scenes.length > 0 ? scenes[scenes.length - 1].endMs : 0;

      const created = await editorService.createScene(storyId, {
        title: `Scene ${newOrder + 1}`,
        narration: 'A new adventure unfolds in the story.',
        visualPrompt: 'A bright, colorful storybook scene.',
        cameraDirection: 'Eye level wide establishing shot',
        durationMs: defaultDuration,
      });

      const updatedRaw = [
        ...scenes,
        {
          ...created,
          order: newOrder,
          startMs: lastSceneEnd,
          endMs: lastSceneEnd + defaultDuration,
          estimatedDurationMs: defaultDuration,
        },
      ];

      const recalculated = recalculateContiguousTimeline(updatedRaw);
      setScenes(recalculated);
      setActiveSceneId(created.sceneId);
      triggerDebouncedSave(recalculated);
    } catch (err: any) {
      console.error('Failed to add scene:', err);
      alert(err.message || 'Failed to add scene');
    }
  };

  const handleDuplicateScene = async (sceneId: string) => {
    try {
      pushHistorySnapshot(scenes);
      const duplicated = await editorService.duplicateScene(sceneId);
      
      const sourceIndex = scenes.findIndex((s) => s.sceneId === sceneId);
      const updatedList = [...scenes];
      
      if (sourceIndex >= 0) {
        updatedList.splice(sourceIndex + 1, 0, duplicated);
      } else {
        updatedList.push(duplicated);
      }

      const recalculated = recalculateContiguousTimeline(updatedList);
      setScenes(recalculated);
      setActiveSceneId(duplicated.sceneId);
      triggerDebouncedSave(recalculated);
    } catch (err: any) {
      console.error('Failed to duplicate scene:', err);
      alert(err.message || 'Failed to duplicate scene');
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    if (scenes.length <= 1) {
      alert('A project must have at least one scene.');
      return;
    }

    try {
      pushHistorySnapshot(scenes);
      await editorService.deleteScene(sceneId);

      const targetIndex = scenes.findIndex((s) => s.sceneId === sceneId);
      const remaining = scenes.filter((s) => s.sceneId !== sceneId);
      const recalculated = recalculateContiguousTimeline(remaining);
      setScenes(recalculated);

      // Select adjacent scene
      const nextIndex = Math.min(targetIndex, recalculated.length - 1);
      if (recalculated[nextIndex]) {
        setActiveSceneId(recalculated[nextIndex].sceneId);
      }

      triggerDebouncedSave(recalculated);
    } catch (err: any) {
      console.error('Failed to delete scene:', err);
      alert(err.message || 'Failed to delete scene');
    }
  };

  const handleSplitScene = async (sceneId: string, splitMs: number) => {
    try {
      pushHistorySnapshot(scenes);
      await editorService.splitScene(sceneId, splitMs);
      await loadStoryData();
    } catch (err: any) {
      console.error('Failed to split scene:', err);
      alert(err.message || 'Failed to split scene');
    }
  };

  const handleMergeScenes = async (sceneId: string) => {
    try {
      pushHistorySnapshot(scenes);
      await editorService.mergeScenes(sceneId);
      await loadStoryData();
    } catch (err: any) {
      console.error('Failed to merge scenes:', err);
      alert(err.message || 'Failed to merge scenes');
    }
  };

  const handleRegenerateScene = async (sceneId: string) => {
    try {
      await editorService.regenerateSceneContent(sceneId);
      await loadStoryData();
    } catch (err: any) {
      console.error('Failed to regenerate scene:', err);
      alert(err.message || 'Failed to regenerate scene');
    }
  };

  // Timeline clips direct batch update (from reordering or resizing)
  const handleUpdateScenes = (updatedScenes: EditorScene[]) => {
    pushHistorySnapshot(scenes);
    setScenes(updatedScenes);
    triggerDebouncedSave(updatedScenes);
  };

  // Scene metadata update from Properties Inspector
  const handleUpdateActiveScene = (sceneId: string, updates: Partial<EditorScene>) => {
    pushHistorySnapshot(scenes);
    let updated: EditorScene[];
    if (isRippleOn && updates.endMs !== undefined) {
      const targetScene = scenes.find((s) => s.sceneId === sceneId);
      if (targetScene) {
        const newDuration = Math.max(
          1500,
          updates.endMs - (updates.startMs !== undefined ? updates.startMs : targetScene.startMs)
        );
        const rippled = calculateRippleEdit(scenes, sceneId, newDuration);
        updated = rippled.map((s) => (s.sceneId === sceneId ? { ...s, ...updates, endMs: s.startMs + newDuration } : s));
      } else {
        updated = scenes.map((s) => (s.sceneId !== sceneId ? s : { ...s, ...updates }));
      }
    } else {
      updated = scenes.map((s) => {
        if (s.sceneId !== sceneId) return s;
        return { ...s, ...updates };
      });
    }
    setScenes(updated);
    triggerDebouncedSave(updated);
  };

  // ----------------------------------------------------
  // 2D Character Animation & Overlay Operations
  // ----------------------------------------------------
  const handleSelectInstance = useCallback((instanceId: string | null) => {
    setSelectedInstanceId(instanceId);
    if (instanceId) {
      setSelectedOverlayId(null);
      setSelectedDialogueId(null);
    }
  }, []);

  const handleSelectOverlay = useCallback((overlayId: string | null) => {
    setSelectedOverlayId(overlayId);
    if (overlayId) {
      setSelectedInstanceId(null);
      setSelectedDialogueId(null);
    }
  }, []);

  const handleSelectDialogue = useCallback((dialogueId: string | null) => {
    setSelectedDialogueId(dialogueId);
    if (dialogueId) {
      setSelectedInstanceId(null);
      setSelectedOverlayId(null);
    }
  }, []);

  const handleUpdateAnimationData = useCallback(
    (sceneId: string, newData: VectorSceneData) => {
      pushHistorySnapshot(scenes);
      const updated = scenes.map((s) => {
        if (s.sceneId !== sceneId) return s;
        return {
          ...s,
          animationData: newData,
        };
      });
      setScenes(updated);
      triggerDebouncedSave(updated);
    },
    [scenes, pushHistorySnapshot, triggerDebouncedSave]
  );

  const handleUpdateInstance = useCallback(
    (instanceId: string, updates: Partial<CharacterInstance>) => {
      if (!activeSceneId) return;
      const targetScene = scenes.find((s) => s.sceneId === activeSceneId);
      if (!targetScene || !targetScene.animationData) return;

      const updatedInstances = (targetScene.animationData.characterInstances || []).map((inst) =>
        inst.instanceId === instanceId ? { ...inst, ...updates } : inst
      );

      handleUpdateAnimationData(activeSceneId, {
        ...targetScene.animationData,
        characterInstances: updatedInstances,
      });
    },
    [activeSceneId, scenes, handleUpdateAnimationData]
  );

  const handleUpdateOverlay = useCallback(
    (overlayId: string, updates: Partial<EducationalOverlay>) => {
      if (!activeSceneId) return;
      const targetScene = scenes.find((s) => s.sceneId === activeSceneId);
      if (!targetScene) return;

      const currentAnimData: VectorSceneData = targetScene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      };

      const updatedOverlays = (currentAnimData.overlays || []).map((ov) =>
        ov.id === overlayId ? { ...ov, ...updates } : ov
      );

      handleUpdateAnimationData(activeSceneId, {
        ...currentAnimData,
        overlays: updatedOverlays,
      });
    },
    [activeSceneId, scenes, handleUpdateAnimationData]
  );

  const handleMoveScene = useCallback(
    (sceneId: string, direction: 'up' | 'down') => {
      const idx = scenes.findIndex((s) => s.sceneId === sceneId);
      if (idx === -1) return;
      if (direction === 'up' && idx === 0) return;
      if (direction === 'down' && idx === scenes.length - 1) return;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      const reordered = [...scenes];
      const [moved] = reordered.splice(idx, 1);
      reordered.splice(targetIdx, 0, moved);

      const updated = recalculateContiguousTimeline(
        reordered.map((s, i) => ({ ...s, order: i + 1 }))
      );

      handleUpdateScenes(updated);
    },
    [scenes, handleUpdateScenes]
  );

  const handleReorderScene = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (
        fromIdx === toIdx ||
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= scenes.length ||
        toIdx >= scenes.length
      ) {
        return;
      }

      const reordered = [...scenes];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);

      const updated = recalculateContiguousTimeline(
        reordered.map((s, i) => ({ ...s, order: i + 1 }))
      );

      handleUpdateScenes(updated);
    },
    [scenes, handleUpdateScenes]
  );

  const handleAddCharacterToScene = useCallback(
    (
      sceneId: string,
      characterId: string,
      customData?: { name: string; appearance?: any; rig?: any }
    ) => {
      const targetScene = scenes.find((s) => s.sceneId === sceneId);
      if (!targetScene) return;

      const currentAnimData: VectorSceneData = targetScene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        background: targetScene.imageUrl ? { imageUrl: targetScene.imageUrl, fit: 'cover' } : undefined,
        characterInstances: [],
        animationClips: [],
      };

      const newInstanceId = `char-${characterId}-${Date.now().toString(36)}`;
      let newName = characterId === 'pip_the_bear' ? 'Pip the Bear' : characterId === 'sammy_the_kid' ? 'Sammy the Kid' : 'Custom Hero';
      let customRig: any = undefined;
      let appearance: any = undefined;

      if (customData) {
        if (customData.name) newName = customData.name;
        if (customData.appearance) {
          appearance = customData.appearance;
          customRig = customData.rig || buildRigFromAppearance(characterId, newName, customData.appearance);
        } else if (customData.rig) {
          customRig = customData.rig;
        }
      }

      // Stagger initial position if other characters exist
      const count = currentAnimData.characterInstances.length;
      const initialX = 640 + (count % 2 === 0 ? count * 120 : -count * 120);
      const initialY = 460;

      const newInstance: CharacterInstance = {
        instanceId: newInstanceId,
        characterId,
        assetType: 'vector_rig',
        name: newName,
        x: Math.max(200, Math.min(1080, initialX)),
        y: initialY,
        scale: 1.0,
        rotation: 0,
        flipX: false,
        zIndex: count + 1,
        customRig,
        appearance,
      };

      const sceneDuration = targetScene.endMs - targetScene.startMs || 5000;
      const defaultClip: AnimationClip = {
        clipId: `clip-${Date.now().toString(36)}`,
        instanceId: newInstanceId,
        action: 'walk',
        startMs: 0,
        durationMs: sceneDuration,
        loop: true,
        motionMode: 'in_place',
      };

      const updatedAnimData: VectorSceneData = {
        ...currentAnimData,
        characterInstances: [...currentAnimData.characterInstances, newInstance],
        animationClips: [...currentAnimData.animationClips, defaultClip],
      };

      handleUpdateAnimationData(sceneId, updatedAnimData);
      setSelectedInstanceId(newInstanceId);
    },
    [scenes, handleUpdateAnimationData]
  );

  const handleRemoveCharacterFromScene = useCallback(
    (sceneId: string, instanceId: string) => {
      const targetScene = scenes.find((s) => s.sceneId === sceneId);
      if (!targetScene || !targetScene.animationData) return;

      const updatedAnimData: VectorSceneData = {
        ...targetScene.animationData,
        characterInstances: targetScene.animationData.characterInstances.filter(
          (i) => i.instanceId !== instanceId
        ),
        animationClips: targetScene.animationData.animationClips.filter(
          (c) => c.instanceId !== instanceId
        ),
      };

      handleUpdateAnimationData(sceneId, updatedAnimData);
      if (selectedInstanceId === instanceId) {
        setSelectedInstanceId(null);
      }
    },
    [scenes, selectedInstanceId, handleUpdateAnimationData]
  );

  const handleUploadBackground = useCallback(
    async (sceneId: string, file: File, fit: 'cover' | 'contain' = 'cover') => {
      const res = await editorService.uploadSceneBackground(sceneId, file, fit);
      if (res.scene) {
        setScenes((prev) => {
          const updated = prev.map((s) => (s.sceneId === sceneId ? { ...s, ...res.scene } : s));
          triggerDebouncedSave(updated);
          return updated;
        });
        if (activeSceneId === sceneId) {
          editorService.getSceneVersions(sceneId).then(setActiveVersions).catch(() => {});
        }
      }
    },
    [activeSceneId, triggerDebouncedSave]
  );

  const handleSetBackground = useCallback(
    async (sceneId: string, imageUrl: string, fit: 'cover' | 'contain' = 'cover') => {
      const res = await editorService.setSceneBackground(sceneId, imageUrl, fit);
      if (res.scene) {
        setScenes((prev) => {
          const updated = prev.map((s) => (s.sceneId === sceneId ? { ...s, ...res.scene } : s));
          triggerDebouncedSave(updated);
          return updated;
        });
        if (activeSceneId === sceneId) {
          editorService.getSceneVersions(sceneId).then(setActiveVersions).catch(() => {});
        }
      }
    },
    [activeSceneId, triggerDebouncedSave]
  );

  const handleUpdateBackgroundFit = useCallback(
    async (sceneId: string, fit: 'cover' | 'contain') => {
      const res = await editorService.updateBackgroundFit(sceneId, fit);
      if (res.scene) {
        setScenes((prev) => {
          const updated = prev.map((s) => (s.sceneId === sceneId ? { ...s, ...res.scene } : s));
          triggerDebouncedSave(updated);
          return updated;
        });
      }
    },
    [triggerDebouncedSave]
  );

  const handleRemoveBackground = useCallback(
    async (sceneId: string) => {
      const res = await editorService.removeSceneBackground(sceneId);
      if (res.scene) {
        setScenes((prev) => {
          const updated = prev.map((s) => (s.sceneId === sceneId ? { ...s, ...res.scene } : s));
          triggerDebouncedSave(updated);
          return updated;
        });
        if (activeSceneId === sceneId) {
          editorService.getSceneVersions(sceneId).then(setActiveVersions).catch(() => {});
        }
      }
    },
    [activeSceneId, triggerDebouncedSave]
  );

  const handleSetBackgroundForScene = useCallback(
    (sceneId: string, imageUrl: string) => {
      handleSetBackground(sceneId, imageUrl, 'cover').catch((err) => {
        console.error('Failed to set background for scene:', err);
      });
    },
    [handleSetBackground]
  );

  // ----------------------------------------------------
  // AI Generation Operations (Real Services)
  // ----------------------------------------------------
  const handleGenerateImage = async (sceneId: string, promptOverride?: string) => {
    if (!story) return;
    try {
      setGeneratingImageForScene(sceneId);
      const characters = story.characters || [];
      const result = await editorService.generateSceneImage(
        sceneId,
        story.storyId,
        characters,
        promptOverride
      );

      // Update scene with generated image. If the current animation background is unset
      // or was using the previous scene image, keep the editor preview and export in sync.
      // Preserve a separately selected background if it differs from the scene's image.
      const updated = scenes.map((s) => {
        if (s.sceneId !== sceneId) return s;

        const currentBackgroundUrl = s.animationData?.background?.imageUrl;
        const shouldSyncAnimationBackground =
          !!s.animationData &&
          (!currentBackgroundUrl || currentBackgroundUrl === s.imageUrl);

        return {
          ...s,
          imageUrl: result.url,
          animationData: shouldSyncAnimationBackground
            ? {
                ...s.animationData!,
                background: {
                  imageUrl: result.url,
                  fit: s.animationData?.background?.fit || 'cover',
                },
              }
            : s.animationData,
          visualPrompt: promptOverride || s.visualPrompt,
          generationStatus: 'completed' as const,
        };
      });

      setScenes(updated);
      triggerDebouncedSave(updated);

      // Refresh versions
      const vers = await editorService.getSceneVersions(sceneId);
      setActiveVersions(vers);
    } catch (err: any) {
      console.error('Image generation error:', err);
      alert(`Image generation failed: ${err.message || 'Provider error'}`);
    } finally {
      setGeneratingImageForScene(null);
    }
  };

  const handleGenerateVoice = async (
    sceneId: string,
    options?: {
      provider?: string;
      voice?: string;
      speed?: number;
      effect?: 'normal' | 'robot' | 'cartoon' | 'whisper' | 'shout';
      lang?: string;
      emotion?: string;
      emotionIntensity?: number;
    }
  ) => {
    const targetScene = scenes.find((s) => s.sceneId === sceneId);
    if (!targetScene) return;

    try {
      setGeneratingVoiceForScene(sceneId);
      const result = await editorService.generateSceneVoice(
        sceneId,
        targetScene.narration,
        options
      );

      // If speech duration exceeds scene duration, automatically expand the scene
      const currentDuration = targetScene.endMs - targetScene.startMs;
      const minNeededMs = Math.max(result.durationMs, 2000);
      const shouldExpand = minNeededMs > currentDuration;

      let updatedList = scenes.map((s) => {
        if (s.sceneId !== sceneId) return s;
        return {
          ...s,
          audioUrl: result.audioUrl,
          actualAudioDurationMs: result.durationMs,
          endMs: shouldExpand ? s.startMs + minNeededMs : s.endMs,
        };
      });

      if (shouldExpand) {
        updatedList = recalculateContiguousTimeline(updatedList);
      }

      setScenes(updatedList);
      triggerDebouncedSave(updatedList);

      // Refresh versions
      const vers = await editorService.getSceneVersions(sceneId);
      setActiveVersions(vers);
    } catch (err: any) {
      console.error('Voice generation error:', err);
      alert(`Voice generation failed: ${err.message || 'TTS service error'}`);
    } finally {
      setGeneratingVoiceForScene(null);
    }
  };

  const handleRemoveVoice = async (sceneId: string) => {
    try {
      pushHistorySnapshot(scenes);
      await editorService.removeSceneVoice(sceneId);

      const updated = scenes.map((s) => {
        if (s.sceneId !== sceneId) return s;
        return {
          ...s,
          audioUrl: undefined,
          actualAudioDurationMs: undefined,
        };
      });

      setScenes(updated);
      triggerDebouncedSave(updated);

      // Refresh versions
      const vers = await editorService.getSceneVersions(sceneId);
      setActiveVersions(vers);
    } catch (err: any) {
      console.error('Failed to remove voice:', err);
      alert(err.message || 'Failed to remove voice audio');
    }
  };

  const handleGenerateVideo = async (sceneId: string, workflow: 'ffmpeg' | 'ai' = 'ffmpeg') => {
    const targetScene = scenes.find((s) => s.sceneId === sceneId);
    if (!targetScene) return;

    const img = targetScene.imageUrl || targetScene.image?.imageUrl;
    if (workflow === 'ffmpeg' && !img) {
      alert('Ken Burns motion rendering requires a scene image. Please generate or assign an image first.');
      return;
    }

    try {
      setGeneratingVideoForScene(sceneId);
      const durationSec = Math.max(2, Math.round((targetScene.endMs - targetScene.startMs) / 1000));
      const result = await editorService.generateSceneVideo(
        sceneId,
        img || '',
        durationSec,
        workflow,
        targetScene.visualPrompt || targetScene.narration
      );

      const updated = scenes.map((s) => {
        if (s.sceneId !== sceneId) return s;
        return {
          ...s,
          videoUrl: result.url,
          generationStatus: 'completed' as const,
        };
      });

      setScenes(updated);
      triggerDebouncedSave(updated);

      // Refresh versions
      const vers = await editorService.getSceneVersions(sceneId);
      setActiveVersions(vers);
    } catch (err: any) {
      console.error('Video clip generation error:', err);
      alert(`Video clip generation failed: ${err.message || 'Video generation error'}`);
    } finally {
      setGeneratingVideoForScene(null);
    }
  };

  const handleGenerateAllScenesInitial = async () => {
    if (!story) return;
    try {
      setGeneratingAllScenes(true);
      await generateScenes(
        story.storyId,
        {
          title: story.title,
          logline: story.logline,
          lesson: story.lesson,
        },
        story.characters || []
      );
      await loadStoryData();
    } catch (err: any) {
      console.error('Failed to generate initial scenes:', err);
      alert(err.message || 'Failed to generate initial scenes');
    } finally {
      setGeneratingAllScenes(false);
    }
  };

  const handleGenerateCharacterReference = async (characterId: string) => {
    try {
      await generateCharacterReferenceImage(characterId);
      await loadStoryData();
    } catch (err: any) {
      console.error('Failed to generate character reference image:', err);
      alert(err.message || 'Failed to generate reference image');
    }
  };

  const handleRestoreVersion = async (sceneId: string, versionId: string) => {
    try {
      pushHistorySnapshot(scenes);
      await editorService.restoreSceneVersion(sceneId, versionId);
      await loadStoryData();
    } catch (err: any) {
      console.error('Failed to restore version:', err);
      alert(err.message || 'Failed to restore scene version');
    }
  };

  const handleToggleCharacterForScene = (characterId: string, sceneId: string) => {
    const targetScene = scenes.find((s) => s.sceneId === sceneId);
    if (!targetScene) return;

    const currentList = targetScene.characterIds || [];
    const exists = currentList.includes(characterId);
    const nextList = exists
      ? currentList.filter((id) => id !== characterId)
      : [...currentList, characterId];

    handleUpdateActiveScene(sceneId, { characterIds: nextList });
  };

  const handleSelectMediaForScene = (
    sceneId: string,
    mediaUrl: string,
    type: 'image' | 'video'
  ) => {
    if (type === 'image') {
      handleUpdateActiveScene(sceneId, { imageUrl: mediaUrl });
    } else {
      handleUpdateActiveScene(sceneId, { videoUrl: mediaUrl });
    }
  };

  // ----------------------------------------------------
  // Validation Warnings Check
  // ----------------------------------------------------
  let hasValidationErrors = false;
  let validationMessage: string | undefined;

  for (const scene of scenes) {
    const timingVal = validateSceneTiming(scene);
    if (!timingVal.isValid && timingVal.warning) {
      hasValidationErrors = true;
      validationMessage = `${scene.title}: ${timingVal.warning}`;
      break;
    }
  }

  // Active scene object
  const activeScene = scenes.find((s) => s.sceneId === activeSceneId) || scenes[0] || null;

  // ----------------------------------------------------
  // Loading & Error States
  // ----------------------------------------------------
  if (isLoading) {
    return (
      <div className="editor-root" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--ed-text-muted)' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid #8b5cf6',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              margin: '0 auto 16px',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <h2 style={{ color: 'var(--ed-text)', fontSize: '18px', margin: '0 0 6px' }}>
            Loading AI Studio Editor...
          </h2>
          <p style={{ margin: 0, fontSize: '13px' }}>Synchronizing timeline, scenes, and media assets</p>
        </div>
      </div>
    );
  }

  if (initialLoadError || !story) {
    return (
      <div className="editor-root" style={{ display: 'grid', placeItems: 'center' }}>
        <div
          style={{
            maxWidth: '460px',
            textAlign: 'center',
            padding: '32px',
            background: 'var(--ed-surface)',
            borderRadius: '12px',
            border: '1px solid var(--ed-border)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <AlertTriangleIcon size={40} color="#f59e0b" />
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--ed-text)' }}>
            Story Not Found or Inaccessible
          </h2>
          <p style={{ color: 'var(--ed-text-muted)', fontSize: '13px', margin: '0 0 20px' }}>
            {initialLoadError || 'The requested story could not be loaded into the editor.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button className="ed-brand-btn" onClick={() => navigate('/stories')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <ArrowLeftIcon size={14} /> Back to Stories
            </button>
            <button className="ed-btn-export" onClick={loadStoryData}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // Full-Page Desktop Video Editor Workspace
  // ----------------------------------------------------
  return (
    <div className="editor-root">
      {/* 1. Top Workspace Toolbar */}
      <TopToolbar
        title={story.title}
        onTitleChange={handleTitleChange}
        onBack={() => navigate('/stories')}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        saveStatus={saveStatus}
        onRetrySave={handleRetrySave}
        currentTimeMs={currentTimeMs}
        totalDurationMs={totalDurationMs}
        targetDurationMs={story.targetDuration}
        onTargetDurationChange={handleTargetDurationChange}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onRewind={handleRewind}
        onOpenExport={() => setIsExportModalOpen(true)}
        onOpenStoryDetails={() => setIsStoryDetailsOpen(true)}
        hasValidationErrors={hasValidationErrors}
        validationMessage={validationMessage}
      />

      {/* 2. Main Middle Workspace Area (Left Panel + Center Preview Canvas + Right Inspector) */}
      <div className="ed-body">
        {/* Left Asset Panel (Scenes, Characters, Images, Videos, Audio, Music) */}
        <LeftAssetPanel
          story={story}
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelectScene={handleSelectScene}
          onAddScene={handleAddScene}
          onDuplicateScene={handleDuplicateScene}
          onDeleteScene={handleDeleteScene}
          onMoveScene={handleMoveScene}
          onReorderScene={handleReorderScene}
          onOpenCharacterBuilder={() => setIsCharacterBuilderOpen(true)}
          onRegenerateScene={handleRegenerateScene}
          onGenerateImage={(scId) => handleGenerateImage(scId)}
          onGenerateVoice={(scId) => handleGenerateVoice(scId)}
          onGenerateVideo={(scId) => handleGenerateVideo(scId)}
          onToggleCharacterForScene={handleToggleCharacterForScene}
          onSelectMediaForScene={handleSelectMediaForScene}
          selectedMusic={selectedMusic}
          onSelectMusic={setSelectedMusic}
          musicVolume={musicVolume}
          onMusicVolumeChange={setMusicVolume}
          generatingImageForScene={generatingImageForScene}
          generatingVoiceForScene={generatingVoiceForScene}
          generatingVideoForScene={generatingVideoForScene}
          onGenerateCharacterReference={handleGenerateCharacterReference}
          onAddCharacterToScene={handleAddCharacterToScene}
          onSetBackgroundForScene={handleSetBackgroundForScene}
        />

        {/* Center 16:9 Canvas & Playback Synchronizer */}
        {scenes.length > 0 ? (
          <PreviewCanvas
            activeScene={activeScene}
            currentTimeMs={currentTimeMs}
            totalDurationMs={totalDurationMs}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            masterVolume={masterVolume}
            isMuted={isMuted}
            onVolumeChange={setMasterVolume}
            onToggleMute={() => setIsMuted((prev) => !prev)}
            onGenerateImage={() => activeSceneId && handleGenerateImage(activeSceneId)}
            isGeneratingImage={generatingImageForScene === activeSceneId}
            isGeneratingVideo={generatingVideoForScene === activeSceneId}
            exportVideoUrl={exportVideoUrl}
            previewMode={previewMode}
            onTogglePreviewMode={setPreviewMode}
            selectedMusic={selectedMusic}
            musicVolume={musicVolume}
            selectedInstanceId={selectedInstanceId}
            onSelectInstance={handleSelectInstance}
            onUpdateInstance={handleUpdateInstance}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={handleSelectOverlay}
            onUpdateOverlay={handleUpdateOverlay}
            onUpdateAnimationData={(newData) => activeSceneId && handleUpdateAnimationData(activeSceneId, newData)}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'grid',
              placeItems: 'center',
              background: '#060911',
              padding: '24px',
            }}
          >
            <div style={{ textAlign: 'center', maxWidth: '420px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <FilmIcon size={48} color="#8b5cf6" />
              </div>
              <h3 style={{ color: 'var(--ed-text)', margin: '0 0 8px', fontSize: '18px' }}>
                Your Storyboard is Empty
              </h3>
              <p style={{ color: 'var(--ed-text-muted)', fontSize: '13px', margin: '0 0 20px' }}>
                Generate scripted scenes automatically using the AI Story Engine, or add your first scene manually to begin editing.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  className="ed-btn-export"
                  onClick={handleGenerateAllScenesInitial}
                  disabled={generatingAllScenes}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <SparklesIcon size={14} />
                  <span>{generatingAllScenes ? 'Generating Scenes...' : 'Generate AI Scenes'}</span>
                </button>
                <button className="ed-brand-btn" onClick={handleAddScene} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <PlusIcon size={14} />
                  <span>Add Empty Scene</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right Properties Inspector */}
        <PropertiesInspector
          scene={activeScene}
          characters={story.characters || []}
          playheadMs={currentTimeMs}
          storyId={story.storyId}
          onUpdateScene={handleUpdateActiveScene}
          onUploadBackground={handleUploadBackground}
          onSetBackground={handleSetBackground}
          onUpdateBackgroundFit={handleUpdateBackgroundFit}
          onRemoveBackground={handleRemoveBackground}
          onGenerateImage={(scId, prompt) => handleGenerateImage(scId, prompt)}
          onGenerateVoice={(scId, opts) => handleGenerateVoice(scId, opts)}
          onRemoveVoice={handleRemoveVoice}
          onGenerateVideo={(scId) => handleGenerateVideo(scId)}
          onSplitScene={handleSplitScene}
          onDuplicateScene={handleDuplicateScene}
          onDeleteScene={handleDeleteScene}
          versions={activeVersions}
          onRestoreVersion={handleRestoreVersion}
          isGeneratingImage={generatingImageForScene === activeSceneId}
          isGeneratingVoice={generatingVoiceForScene === activeSceneId}
          isGeneratingVideo={generatingVideoForScene === activeSceneId}
          selectedInstanceId={selectedInstanceId}
          onSelectInstance={handleSelectInstance}
          onUpdateInstance={handleUpdateInstance}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={handleSelectOverlay}
          onUpdateOverlay={handleUpdateOverlay}
          selectedDialogueId={selectedDialogueId}
          onSelectDialogue={handleSelectDialogue}
          onUpdateAnimationData={handleUpdateAnimationData}
          onAddCharacterToScene={handleAddCharacterToScene}
          onRemoveCharacterFromScene={handleRemoveCharacterFromScene}
          isRippleOn={isRippleOn}
          onToggleRipple={() => setIsRippleOn((prev) => !prev)}
        />
      </div>

      {/* 3. Bottom Multi-Track Professional Timeline */}
      <Timeline
        scenes={scenes}
        activeSceneId={activeSceneId}
        onSelectScene={handleSelectScene}
        playheadMs={currentTimeMs}
        onSeek={handleSeek}
        totalDurationMs={totalDurationMs}
        onUpdateScenes={handleUpdateScenes}
        onAddScene={handleAddScene}
        onSplitScene={handleSplitScene}
        onMergeScenes={handleMergeScenes}
        selectedMusic={selectedMusic}
        selectedInstanceId={selectedInstanceId}
        onSelectInstance={handleSelectInstance}
        selectedDialogueId={selectedDialogueId}
        onSelectDialogue={handleSelectDialogue}
        selectedOverlayId={selectedOverlayId}
        onSelectOverlay={handleSelectOverlay}
        isRippleOn={isRippleOn}
        onToggleRipple={() => setIsRippleOn((prev) => !prev)}
      />

      {/* 4. Real Media Assembly & Video Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        story={story}
        totalDurationMs={totalDurationMs}
        selectedMusic={selectedMusic}
        musicVolume={musicVolume}
        onExportSuccess={(downloadUrl) => {
          setExportVideoUrl(downloadUrl);
          setPreviewMode('export');
        }}
      />

      {/* 5. Story Details & Character Roles Modal */}
      {story && (
        <StoryDetailsModal
          isOpen={isStoryDetailsOpen}
          story={story}
          onClose={() => setIsStoryDetailsOpen(false)}
          onStoryUpdated={(updatedStory) => {
            setStory((prev) => (prev ? { ...prev, ...updatedStory } : null));
          }}
          onStoryRegenerated={loadStoryData}
          onOpenCharacterBuilder={() => setIsCharacterBuilderOpen(true)}
        />
      )}

      {/* 6. Custom Vector Character Builder Modal */}
      <CharacterBuilderModal
        isOpen={isCharacterBuilderOpen}
        character={null}
        onClose={() => setIsCharacterBuilderOpen(false)}
        onSave={async (charData) => {
          const created = await createCharacter(charData);
          if (story) {
            await editorService.linkCharacterToStory(story.storyId, created.id);
            const updatedChars = await editorService.fetchStoryCharacters(story.storyId);
            setStory((prev) => (prev ? { ...prev, characters: updatedChars } : null));
          }
        }}
      />
    </div>
  );
}
