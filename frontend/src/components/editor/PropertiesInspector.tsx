import React, { useState, useEffect, useRef } from 'react';
import { EditorScene, EditorCharacter, SceneVersionItem } from '../../types/editor';
import {
  estimateSpeechDurationMs,
  validateSceneTiming,
  formatDurationHuman,
  formatTimeMs,
} from '../../utils/timingEngine';
import { resolveAssetUrl } from '../../utils/urlHelper';
import { CharacterInstance, VectorSceneData, EducationalOverlay, EducationalOverlayType, SpeakingEmotion, SceneDialogue } from '../../types/animation';
import { CharacterAnimationInspector } from './animation/CharacterAnimationInspector';
import { OverlayInspector } from './animation/OverlayInspector';
import { DialogueInspector } from './animation/DialogueInspector';
import {
  getTTSVoices,
  previewVoice,
  SupportedVoice,
  uploadSceneBackground,
  setSceneBackground,
  updateBackgroundFit,
  removeSceneBackground,
  fetchStoryBackgrounds,
  StoryBackgroundImage,
  generateAllSceneDialogueAudios,
} from '../../services/editor.service';
import { EMOTION_OPTIONS } from '../../utils/emotionSuggester';
import {
  AlertTriangleIcon,
  CheckIcon,
  PlayIcon,
  PauseIcon,
  VolumeHighIcon,
  CloseIcon,
  TrashIcon,
  FilmIcon,
  PlusIcon,
  ScissorsIcon,
  SparklesIcon,
  ImageIcon,
  UploadIcon,
} from '../common/Icons';

interface PropertiesInspectorProps {
  scene: EditorScene | null;
  characters: EditorCharacter[];
  playheadMs: number;
  storyId?: string;
  onUpdateScene: (sceneId: string, updates: Partial<EditorScene>) => void;
  onUploadBackground?: (sceneId: string, file: File, fit?: 'cover' | 'contain') => Promise<void>;
  onSetBackground?: (sceneId: string, imageUrl: string, fit?: 'cover' | 'contain') => Promise<void>;
  onUpdateBackgroundFit?: (sceneId: string, fit: 'cover' | 'contain') => Promise<void>;
  onRemoveBackground?: (sceneId: string) => Promise<void>;
  onGenerateImage: (sceneId: string, promptOverride?: string) => Promise<void>;
  onGenerateVoice: (
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
  ) => Promise<void>;
  onRemoveVoice?: (sceneId: string) => Promise<void>;
  onGenerateVideo: (sceneId: string, workflow?: 'ffmpeg' | 'ai') => Promise<void>;
  onSplitScene: (sceneId: string, splitMs: number) => void;
  onDuplicateScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  versions: SceneVersionItem[];
  onRestoreVersion: (sceneId: string, versionId: string) => void;
  isGeneratingImage?: boolean;
  isGeneratingVoice?: boolean;
  isGeneratingVideo?: boolean;

  selectedInstanceId?: string | null;
  onSelectInstance?: (instanceId: string | null) => void;
  onUpdateInstance?: (instanceId: string, updates: Partial<CharacterInstance>) => void;
  onUpdateAnimationData?: (sceneId: string, newData: VectorSceneData) => void;
  onAddCharacterToScene?: (sceneId: string, characterId: 'pip_the_bear' | 'sammy_the_kid') => void;
  onRemoveCharacterFromScene?: (sceneId: string, instanceId: string) => void;
  isRippleOn?: boolean;
  onToggleRipple?: () => void;

  selectedOverlayId?: string | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  onUpdateOverlay?: (overlayId: string, updates: Partial<EducationalOverlay>) => void;
  onAddOverlay?: (sceneId: string, overlay: EducationalOverlay) => void;
  onDeleteOverlay?: (sceneId: string, overlayId: string) => void;
  onReorderOverlays?: (sceneId: string, overlays: EducationalOverlay[]) => void;

  selectedDialogueId?: string | null;
  onSelectDialogue?: (dialogueId: string | null) => void;
  onUpdateDialogue?: (dialogueId: string, updates: Partial<SceneDialogue>) => void;
  onDeleteDialogue?: (dialogueId: string) => Promise<void>;
  onAddDialogue?: (dialogue: SceneDialogue) => void;
  onSaveCharacterDefault?: (characterId: string, settings: { voice?: string; lang?: string; emotion?: SpeakingEmotion; emotionIntensity?: number }) => Promise<void>;
}

export const PropertiesInspector: React.FC<PropertiesInspectorProps> = ({
  scene,
  characters,
  playheadMs,
  storyId,
  onUpdateScene,
  onUploadBackground,
  onSetBackground,
  onUpdateBackgroundFit,
  onRemoveBackground,
  onGenerateImage,
  onGenerateVoice,
  onRemoveVoice,
  onGenerateVideo,
  onSplitScene,
  onDuplicateScene,
  onDeleteScene,
  versions,
  onRestoreVersion,
  isGeneratingImage,
  isGeneratingVoice,
  isGeneratingVideo,
  selectedInstanceId,
  onSelectInstance,
  onUpdateInstance,
  onUpdateAnimationData,
  onAddCharacterToScene,
  onRemoveCharacterFromScene,
  isRippleOn,
  onToggleRipple,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlay,
  onAddOverlay,
  onDeleteOverlay,
  onReorderOverlays,
  selectedDialogueId,
  onSelectDialogue,
  onUpdateDialogue,
  onDeleteDialogue,
  onAddDialogue,
  onSaveCharacterDefault,
}) => {
  if (!scene) {
    return (
      <aside className="ed-inspector">
        <div className="ed-inspector-header">
          <h3>Properties</h3>
        </div>
        <div style={{ padding: '24px', color: 'var(--ed-text-muted)', fontSize: '13px' }}>
          Select a scene from the timeline or asset panel to edit its properties.
        </div>
      </aside>
    );
  }

  // Local editing state for inputs
  const [localTitle, setLocalTitle] = useState(scene.title);
  const [localNarration, setLocalNarration] = useState(scene.narration);
  const [localPrompt, setLocalPrompt] = useState(scene.visualPrompt || '');
  const [localCamera, setLocalCamera] = useState(scene.cameraDirection || 'Eye level wide establishing shot');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveVoiceConfirm, setShowRemoveVoiceConfirm] = useState(false);

  // Scene Background State (Phase 1)
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [storyBackgrounds, setStoryBackgrounds] = useState<StoryBackgroundImage[]>([]);
  const [isLoadingStoryBackgrounds, setIsLoadingStoryBackgrounds] = useState(false);
  const [showRemoveBgConfirm, setShowRemoveBgConfirm] = useState(false);

  const currentBgUrl = scene.animationData?.background?.imageUrl || scene.imageUrl;
  const currentBgFit = scene.animationData?.background?.fit || 'cover';

  // Dedicated audio player state for scene inspector
  const audioPlayerRef = React.useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioVolume, setAudioVolume] = useState<number>(1.0);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    setLocalTitle(scene.title);
    setLocalNarration(scene.narration);
    setLocalPrompt(scene.visualPrompt || '');
    setLocalCamera(scene.cameraDirection || 'Eye level wide establishing shot');
    setShowRemoveVoiceConfirm(false);
    setAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioError(null);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
  }, [scene.sceneId, scene.title, scene.narration, scene.visualPrompt, scene.cameraDirection, scene.audioUrl]);

  // Kokoro TTS Studio state
  const [ttsVoices, setTtsVoices] = useState<SupportedVoice[]>([]);
  const [isKokoroAvailable, setIsKokoroAvailable] = useState<boolean>(true);
  const [selectedProvider, setSelectedProvider] = useState<'kokoro' | 'google'>('kokoro');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('hi');
  const [selectedVoice, setSelectedVoice] = useState<string>('hf_alpha');
  const [voiceEmotion, setVoiceEmotion] = useState<SpeakingEmotion>('neutral');
  const [voiceEmotionIntensity, setVoiceEmotionIntensity] = useState<number>(0);
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0);
  const [voiceEffect, setVoiceEffect] = useState<'normal' | 'robot' | 'cartoon' | 'whisper' | 'shout'>('normal');

  // Preview state
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<boolean>(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch TTS voices on mount
  useEffect(() => {
    getTTSVoices()
      .then((data) => {
        setTtsVoices(data.voices);
        setIsKokoroAvailable(data.isKokoroAvailable);
        setSelectedProvider(data.isKokoroAvailable ? 'kokoro' : 'google');
        if (data.voices.length > 0) {
          const hasHfAlpha = data.voices.some((v) => v.id === 'hf_alpha');
          setSelectedVoice(hasHfAlpha ? 'hf_alpha' : data.voices[0].id);
        }
      })
      .catch((err) => console.warn('Could not load TTS voices:', err));
  }, []);

  // Scene narrator voice is configured independently from scene character voices

  const handlePreviewVoice = async () => {
    try {
      setIsPreviewingVoice(true);
      const res = await previewVoice({
        voice: selectedVoice,
        provider: selectedProvider,
        speed: voiceSpeed,
        effect: voiceEffect,
        lang: selectedLanguage,
        emotion: voiceEmotion,
        emotionIntensity: voiceEmotionIntensity,
      });
      setPreviewAudioUrl(res.audioUrl);
      setTimeout(() => {
        if (previewAudioRef.current) {
          previewAudioRef.current.currentTime = 0;
          previewAudioRef.current.play().then(() => setIsPlayingPreview(true)).catch(() => {});
        }
      }, 50);
    } catch (e: any) {
      alert(`Voice preview failed: ${e.message || String(e)}`);
    } finally {
      setIsPreviewingVoice(false);
    }
  };

  const handleGenerateVoiceClick = () => {
    onGenerateVoice(scene.sceneId, {
      provider: selectedProvider,
      voice: selectedVoice,
      speed: voiceSpeed,
      effect: voiceEffect,
      lang: selectedLanguage,
      emotion: voiceEmotion,
      emotionIntensity: voiceEmotionIntensity,
    });
  };


  const durationMs = scene.endMs > scene.startMs ? scene.endMs - scene.startMs : scene.estimatedDurationMs || 5000;
  const timingValidation = validateSceneTiming(scene);
  const estimatedSpeechMs = estimateSpeechDurationMs(localNarration);

  const [durationInputVal, setDurationInputVal] = useState<string>(
    (durationMs / 1000).toFixed(1)
  );

  useEffect(() => {
    setDurationInputVal((durationMs / 1000).toFixed(1));
  }, [durationMs]);

  const handleTitleBlur = () => {
    if (localTitle !== scene.title) {
      onUpdateScene(scene.sceneId, { title: localTitle });
    }
  };

  const handleNarrationBlur = () => {
    if (localNarration !== scene.narration) {
      onUpdateScene(scene.sceneId, { narration: localNarration });
    }
  };

  const handlePromptBlur = () => {
    if (localPrompt !== scene.visualPrompt) {
      onUpdateScene(scene.sceneId, { visualPrompt: localPrompt });
    }
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLocalCamera(val);
    onUpdateScene(scene.sceneId, { cameraDirection: val });
  };

  const handleDurationInputBlur = () => {
    const parsed = parseFloat(durationInputVal);
    if (!Number.isFinite(parsed) || isNaN(parsed)) {
      setDurationInputVal((durationMs / 1000).toFixed(1));
      return;
    }
    const clampedSec = Math.max(1.5, Math.min(300, parsed));
    const newDur = Math.round(clampedSec * 1000);
    setDurationInputVal(clampedSec.toFixed(1));
    if (Math.abs(newDur - durationMs) >= 50) {
      onUpdateScene(scene.sceneId, {
        endMs: scene.startMs + newDur,
        estimatedDurationMs: newDur,
      });
    }
  };

  const handleDurationStep = (deltaSec: number) => {
    const newDur = Math.max(1500, Math.min(300000, durationMs + deltaSec * 1000));
    setDurationInputVal((newDur / 1000).toFixed(1));
    onUpdateScene(scene.sceneId, {
      endMs: scene.startMs + newDur,
      estimatedDurationMs: newDur,
    });
  };

  const handleFitToVoice = () => {
    if (scene.actualAudioDurationMs) {
      const newDur = Math.max(1500, scene.actualAudioDurationMs + 500); // 500ms safety pad
      setDurationInputVal((newDur / 1000).toFixed(1));
      onUpdateScene(scene.sceneId, {
        endMs: scene.startMs + newDur,
        estimatedDurationMs: newDur,
      });
    }
  };

  const handleToggleCharacter = (charId: string) => {
    const current = scene.characterIds || [];
    const next = current.includes(charId)
      ? current.filter((id) => id !== charId)
      : [...current, charId];
    onUpdateScene(scene.sceneId, { characterIds: next });
  };

  const [isBatchGeneratingDialogue, setIsBatchGeneratingDialogue] = useState(false);

  const handleBatchGenerateDialogueAudio = async () => {
    if (!scene?.sceneId) return;
    setIsBatchGeneratingDialogue(true);
    try {
      const res = await generateAllSceneDialogueAudios(scene.sceneId);
      if (res.success && res.dialogueLines) {
        if (onUpdateAnimationData && scene.animationData) {
          onUpdateAnimationData(scene.sceneId, {
            ...scene.animationData,
            dialogueLines: res.dialogueLines,
          });
        }
        onUpdateScene(scene.sceneId, {
          ...(scene.animationData
            ? {
                animationData: {
                  ...scene.animationData,
                  dialogueLines: res.dialogueLines,
                },
              }
            : {}),
        });
      }
    } catch (err: any) {
      console.error('Failed to generate dialogue audio:', err);
    } finally {
      setIsBatchGeneratingDialogue(false);
    }
  };

  const dialogueList: Array<{ speaker: string; text: string }> =
    (scene.dialogue && scene.dialogue.length > 0)
      ? scene.dialogue
      : ((scene.animationData?.dialogueLines && scene.animationData.dialogueLines.length > 0)
          ? scene.animationData.dialogueLines.map((d) => ({ speaker: d.characterName, text: d.text }))
          : ((scene.animationData?.dialogue as any) || []));
  const actionList: Array<{ characterName: string; action: string; pose?: string }> =
    scene.characterActions || (scene.animationData?.characterActions as any) || [];

  const handleUpdateDialogue = (newDialogue: Array<{ speaker: string; text: string }>) => {
    let updatedDialogueLines = scene.animationData?.dialogueLines;
    if (updatedDialogueLines && updatedDialogueLines.length > 0) {
      updatedDialogueLines = newDialogue.map((nd, i) => {
        const existing = updatedDialogueLines?.[i];
        if (existing) {
          return {
            ...existing,
            characterName: nd.speaker,
            text: nd.text,
          };
        }
        return {
          id: `dlg-${Date.now()}-${i}`,
          characterName: nd.speaker,
          text: nd.text,
          startMs: 1000 + i * 2500,
          durationMs: 2500,
        };
      });
    } else {
      updatedDialogueLines = newDialogue.map((nd, i) => ({
        id: `dlg-${Date.now()}-${i}`,
        characterName: nd.speaker,
        text: nd.text,
        startMs: 1000 + i * 2500,
        durationMs: 2500,
      }));
    }

    const updatedAnimationData = scene.animationData
      ? { ...scene.animationData, dialogue: newDialogue, dialogueLines: updatedDialogueLines }
      : undefined;
    onUpdateScene(scene.sceneId, {
      dialogue: newDialogue,
      ...(updatedAnimationData ? { animationData: updatedAnimationData } : {}),
    });
    if (updatedAnimationData && onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, updatedAnimationData);
    }
  };

  const handleUpdateActions = (newActions: Array<{ characterName: string; action: string; pose?: string }>) => {
    const updatedAnimationData = scene.animationData
      ? { ...scene.animationData, characterActions: newActions }
      : undefined;
    onUpdateScene(scene.sceneId, {
      characterActions: newActions,
      ...(updatedAnimationData ? { animationData: updatedAnimationData } : {}),
    });
    if (updatedAnimationData && onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, updatedAnimationData);
    }
  };

  // -------------------------------------------------------------------------
  // Scene Background Handlers (Phase 1)
  // -------------------------------------------------------------------------
  const handleUploadBackgroundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png' && file.type !== 'image/jpeg' && file.type !== 'image/jpg') {
      setBgError('Please select a valid PNG or JPEG image file.');
      return;
    }

    setBgError(null);
    setIsUploadingBg(true);
    try {
      if (onUploadBackground) {
        await onUploadBackground(scene.sceneId, file, currentBgFit);
      } else {
        const res = await uploadSceneBackground(scene.sceneId, file, currentBgFit);
        if (res.scene) {
          onUpdateScene(scene.sceneId, res.scene);
        }
      }
    } catch (err: any) {
      console.error('Background upload failed:', err);
      setBgError(err.message || 'Failed to upload background image');
    } finally {
      setIsUploadingBg(false);
      if (bgFileInputRef.current) bgFileInputRef.current.value = '';
    }
  };

  const handleToggleFit = (newFit: 'cover' | 'contain') => {
    setBgError(null);
    if (onUpdateBackgroundFit) {
      onUpdateBackgroundFit(scene.sceneId, newFit);
    } else {
      updateBackgroundFit(scene.sceneId, newFit)
        .then((res) => {
          if (res.scene) onUpdateScene(scene.sceneId, res.scene);
        })
        .catch((err) => setBgError(err.message || 'Failed to update fit mode'));
    }
  };

  const handleOpenStoryBackgroundsModal = () => {
    setShowBgPicker(true);
    if (storyId) {
      setIsLoadingStoryBackgrounds(true);
      fetchStoryBackgrounds(storyId)
        .then((bgs) => setStoryBackgrounds(bgs))
        .catch((err) => console.warn('Failed to load story backgrounds:', err))
        .finally(() => setIsLoadingStoryBackgrounds(false));
    }
  };

  const handleSelectStoryBackground = (imageUrl: string) => {
    setShowBgPicker(false);
    setBgError(null);
    if (onSetBackground) {
      onSetBackground(scene.sceneId, imageUrl, currentBgFit);
    } else {
      setSceneBackground(scene.sceneId, imageUrl, currentBgFit)
        .then((res) => {
          if (res.scene) onUpdateScene(scene.sceneId, res.scene);
        })
        .catch((err) => setBgError(err.message || 'Failed to set background'));
    }
  };

  const handleRemoveBackground = () => {
    setShowRemoveBgConfirm(false);
    setBgError(null);
    if (onRemoveBackground) {
      onRemoveBackground(scene.sceneId);
    } else {
      removeSceneBackground(scene.sceneId)
        .then((res) => {
          if (res.scene) onUpdateScene(scene.sceneId, res.scene);
        })
        .catch((err) => setBgError(err.message || 'Failed to remove background'));
    }
  };

  const canSplitAtPlayhead =
    playheadMs > scene.startMs + 500 && playheadMs < scene.endMs - 500;

  const [activeInspectorTab, setActiveInspectorTab] = useState<'scene' | 'animation' | 'dialogue' | 'overlays'>('scene');

  useEffect(() => {
    if (selectedInstanceId) {
      setActiveInspectorTab('animation');
    }
  }, [selectedInstanceId]);

  useEffect(() => {
    if (selectedDialogueId) {
      setActiveInspectorTab('dialogue');
    }
  }, [selectedDialogueId]);

  useEffect(() => {
    if (selectedOverlayId) {
      setActiveInspectorTab('overlays');
    }
  }, [selectedOverlayId]);

  const handleUpdateDialogueLine = (dlgId: string, updates: Partial<SceneDialogue>) => {
    if (onUpdateDialogue) {
      onUpdateDialogue(dlgId, updates);
      return;
    }
    const currentLines = scene.animationData?.dialogueLines || [];
    const updatedLines = currentLines.map((d) => (d.id === dlgId ? { ...d, ...updates } : d));
    const nextAnim: VectorSceneData = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      dialogueLines: updatedLines,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, nextAnim);
    }
    onUpdateScene(scene.sceneId, { animationData: nextAnim });
  };

  const handleDeleteDialogueLine = async (dlgId: string) => {
    if (onDeleteDialogue) {
      await onDeleteDialogue(dlgId);
      return;
    }
    const currentLines = scene.animationData?.dialogueLines || [];
    const updatedLines = currentLines.filter((d) => d.id !== dlgId);
    const nextAnim: VectorSceneData = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      dialogueLines: updatedLines,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, nextAnim);
    }
    onUpdateScene(scene.sceneId, { animationData: nextAnim });
  };

  const handleAddDialogueLine = (newDlg: SceneDialogue) => {
    if (onAddDialogue) {
      onAddDialogue(newDlg);
      return;
    }
    const currentLines = scene.animationData?.dialogueLines || [];
    const updatedLines = [...currentLines, newDlg];
    const nextAnim: VectorSceneData = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      dialogueLines: updatedLines,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, nextAnim);
    }
    onUpdateScene(scene.sceneId, { animationData: nextAnim });
  };

  const characterInstances = scene.animationData?.characterInstances || [];
  const selectedCharacterInstance = characterInstances.find((i) => i.instanceId === selectedInstanceId) || null;

  const currentAnimationData: VectorSceneData = scene.animationData || {
    version: 1,
    viewport: { width: 1280, height: 720 },
    characterInstances: [],
    animationClips: [],
  };

  const overlays = currentAnimationData.overlays || [];

  const handleAddOverlayByType = (type: EducationalOverlayType) => {
    const id = `overlay-${type}-${Date.now().toString(36)}`;
    const baseOverlay: EducationalOverlay = {
      id,
      type,
      x: 640,
      y: 360,
      startMs: 0,
      durationMs: durationMs,
      layerPosition: type === 'route_line' ? 'below_characters' : 'above_characters',
      color: type === 'location_pin' ? '#ef4444' : type === 'route_line' ? '#38bdf8' : type === 'highlight_ring' ? '#f59e0b' : type === 'arrow_pointer' ? '#10b981' : '#ffffff',
      title: type === 'location_pin' ? 'Location Pin' : type === 'route_line' ? 'Expedition Route' : type === 'highlight_ring' ? 'Key Region' : type === 'arrow_pointer' ? 'Point of Interest' : 'Fact Badge',
    };

    if (type === 'route_line') {
      baseOverlay.targetX = 840;
      baseOverlay.targetY = 260;
      baseOverlay.strokeWidth = 4;
      baseOverlay.progressDurationMs = Math.min(3000, durationMs);
    } else if (type === 'highlight_ring') {
      baseOverlay.radius = 60;
      baseOverlay.pulseSpeedMs = 1500;
    } else if (type === 'arrow_pointer') {
      baseOverlay.targetX = 540;
      baseOverlay.targetY = 260;
      baseOverlay.strokeWidth = 4;
    } else if (type === 'callout_label') {
      baseOverlay.targetX = 640;
      baseOverlay.targetY = 300;
      baseOverlay.label = 'Mount Everest Peak';
      baseOverlay.title = 'Elevation: 8,849 meters';
      baseOverlay.hasConnectorLine = true;
    } else if (type === 'location_pin') {
      baseOverlay.icon = 'pin';
      baseOverlay.label = 'Mount Everest';
    } else if (type === 'spotlight') {
      baseOverlay.x = 640;
      baseOverlay.y = 500;
      baseOverlay.radius = 140;
      baseOverlay.color = '#fef08a';
      baseOverlay.title = 'Stage Spotlight';
      baseOverlay.layerPosition = 'below_characters';
    } else if (type === 'glow') {
      baseOverlay.x = 640;
      baseOverlay.y = 420;
      baseOverlay.radius = 90;
      baseOverlay.color = '#38bdf8';
      baseOverlay.title = 'Atmospheric Glow';
      baseOverlay.layerPosition = 'below_characters';
    } else if (type === 'sparkles') {
      baseOverlay.x = 640;
      baseOverlay.y = 360;
      baseOverlay.radius = 80;
      baseOverlay.color = '#fde047';
      baseOverlay.title = 'Magic Sparkles';
    } else if (type === 'flying_birds') {
      baseOverlay.x = 80;
      baseOverlay.y = 120;
      baseOverlay.targetX = 1200;
      baseOverlay.targetY = 90;
      baseOverlay.color = '#334155';
      baseOverlay.title = 'Flying Birds';
    } else if (type === 'moving_clouds') {
      baseOverlay.x = 100;
      baseOverlay.y = 90;
      baseOverlay.targetX = 1000;
      baseOverlay.targetY = 90;
      baseOverlay.width = 160;
      baseOverlay.height = 55;
      baseOverlay.fillColor = '#ffffff';
      baseOverlay.title = 'Drifting Clouds';
      baseOverlay.layerPosition = 'below_characters';
    } else if (type === 'title_card') {
      baseOverlay.x = 640;
      baseOverlay.y = 180;
      baseOverlay.color = '#38bdf8';
      baseOverlay.fillColor = '#0f172a';
      baseOverlay.textColor = '#ffffff';
      baseOverlay.title = 'LESSON: OUR BLUE PLANET';
      baseOverlay.label = 'Educational Adventure';
    } else if (type === 'rain') {
      baseOverlay.color = '#38bdf8';
      baseOverlay.strokeWidth = 1.8;
      baseOverlay.title = 'Monsoon Rain';
      baseOverlay.layerPosition = 'above_characters';
    } else if (type === 'snowfall') {
      baseOverlay.color = '#ffffff';
      baseOverlay.title = 'Gentle Snowfall';
      baseOverlay.layerPosition = 'above_characters';
    } else if (type === 'wind') {
      baseOverlay.color = '#e2e8f0';
      baseOverlay.strokeWidth = 2;
      baseOverlay.title = 'Wind Gusts';
      baseOverlay.layerPosition = 'above_characters';
    } else if (type === 'falling_leaves') {
      baseOverlay.color = '#f59e0b';
      baseOverlay.title = 'Falling Autumn Leaves';
      baseOverlay.layerPosition = 'above_characters';
    } else if (type === 'sunshine_rays') {
      baseOverlay.color = '#fef08a';
      baseOverlay.title = 'Volumetric Sunbeams';
      baseOverlay.layerPosition = 'below_characters';
    } else if (type === 'heat_shimmer') {
      baseOverlay.color = '#fde047';
      baseOverlay.y = 480;
      baseOverlay.title = 'Summer Heat Shimmer';
      baseOverlay.layerPosition = 'above_characters';
    } else if (type === 'fog_mist') {
      baseOverlay.color = '#f8fafc';
      baseOverlay.y = 520;
      baseOverlay.title = 'Morning Fog & Mist';
      baseOverlay.layerPosition = 'below_characters';
    } else if (type === 'lightning') {
      baseOverlay.color = '#ffffff';
      baseOverlay.title = 'Thunder Lightning Flash';
      baseOverlay.layerPosition = 'above_characters';
    } else if (type === 'water_splashes') {
      baseOverlay.x = 640;
      baseOverlay.y = 540;
      baseOverlay.radius = 40;
      baseOverlay.color = '#38bdf8';
      baseOverlay.title = 'Water Splashes';
      baseOverlay.layerPosition = 'above_characters';
    } else if (type === 'butterflies') {
      baseOverlay.x = 300;
      baseOverlay.y = 400;
      baseOverlay.color = '#f43f5e';
      baseOverlay.title = 'Fluttering Butterflies';
      baseOverlay.layerPosition = 'above_characters';
    }

    if (onAddOverlay) {
      onAddOverlay(scene.sceneId, baseOverlay);
      return;
    }

    const updatedOverlays = [...overlays, baseOverlay];
    const updatedAnimationData: VectorSceneData = {
      ...currentAnimationData,
      overlays: updatedOverlays,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, updatedAnimationData);
    }
    onUpdateScene(scene.sceneId, { animationData: updatedAnimationData });
    if (onSelectOverlay) onSelectOverlay(baseOverlay.id);
  };

  const handleUpdateOverlayInternal = (overlayId: string, updates: Partial<EducationalOverlay>) => {
    if (onUpdateOverlay) {
      onUpdateOverlay(overlayId, updates);
      return;
    }
    const updatedOverlays = overlays.map((o) => (o.id === overlayId ? { ...o, ...updates } : o));
    const updatedAnimationData: VectorSceneData = {
      ...currentAnimationData,
      overlays: updatedOverlays,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, updatedAnimationData);
    }
    onUpdateScene(scene.sceneId, { animationData: updatedAnimationData });
  };

  const handleDeleteOverlayInternal = (overlayId: string) => {
    if (onDeleteOverlay) {
      onDeleteOverlay(scene.sceneId, overlayId);
      return;
    }
    const updatedOverlays = overlays.filter((o) => o.id !== overlayId);
    const updatedAnimationData: VectorSceneData = {
      ...currentAnimationData,
      overlays: updatedOverlays,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, updatedAnimationData);
    }
    onUpdateScene(scene.sceneId, { animationData: updatedAnimationData });
    if (selectedOverlayId === overlayId && onSelectOverlay) {
      onSelectOverlay(null);
    }
  };

  const handleDuplicateOverlayInternal = (overlayId: string) => {
    const target = overlays.find((o) => o.id === overlayId);
    if (!target) return;
    const duplicated: EducationalOverlay = {
      ...target,
      id: `overlay-${target.type}-${Date.now().toString(36)}`,
      x: target.x + 20,
      y: target.y + 20,
      ...(target.targetX !== undefined ? { targetX: target.targetX + 20 } : {}),
      ...(target.targetY !== undefined ? { targetY: target.targetY + 20 } : {}),
      title: `${target.title || target.type} (Copy)`,
    };
    const updatedOverlays = [...overlays, duplicated];
    const updatedAnimationData: VectorSceneData = {
      ...currentAnimationData,
      overlays: updatedOverlays,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, updatedAnimationData);
    }
    onUpdateScene(scene.sceneId, { animationData: updatedAnimationData });
    if (onSelectOverlay) onSelectOverlay(duplicated.id);
  };

  const handleReorderOverlayDirection = (overlayId: string, direction: 'up' | 'down') => {
    const idx = overlays.findIndex((o) => o.id === overlayId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === overlays.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const reordered = [...overlays];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, moved);

    if (onReorderOverlays) {
      onReorderOverlays(scene.sceneId, reordered);
      return;
    }
    const updatedAnimationData: VectorSceneData = {
      ...currentAnimationData,
      overlays: reordered,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, updatedAnimationData);
    }
    onUpdateScene(scene.sceneId, { animationData: updatedAnimationData });
  };

  return (
    <aside className="ed-inspector">
      <div className="ed-inspector-header" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Inspector — Scene {scene.number}</h3>
          <span
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: scene.generationStatus === 'completed' ? '#34d399' : '#94a3b8',
            }}
          >
            {scene.generationStatus || 'draft'}
          </span>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--ed-bg)', padding: '2px', borderRadius: '6px' }}>
          <button
            type="button"
            className="ed-tool-btn"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '11px',
              background: activeInspectorTab === 'scene' ? 'var(--ed-surface-elevated)' : 'transparent',
              color: activeInspectorTab === 'scene' ? 'var(--ed-text)' : 'var(--ed-text-muted)',
              fontWeight: activeInspectorTab === 'scene' ? 600 : 400,
            }}
            onClick={() => setActiveInspectorTab('scene')}
          >
            Scene Settings
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '11px',
              background: activeInspectorTab === 'animation' ? 'var(--ed-surface-elevated)' : 'transparent',
              color: activeInspectorTab === 'animation' ? '#93c5fd' : 'var(--ed-text-muted)',
              fontWeight: activeInspectorTab === 'animation' ? 600 : 400,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onClick={() => setActiveInspectorTab('animation')}
          >
            <SparklesIcon size={12} />
            <span>2D Rig ({characterInstances.length})</span>
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '11px',
              background: activeInspectorTab === 'dialogue' ? 'var(--ed-surface-elevated)' : 'transparent',
              color: activeInspectorTab === 'dialogue' ? '#f472b6' : 'var(--ed-text-muted)',
              fontWeight: activeInspectorTab === 'dialogue' ? 600 : 400,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onClick={() => setActiveInspectorTab('dialogue')}
          >
            <span style={{ fontSize: '12px' }}>👄</span>
            <span>Dialogue ({scene.animationData?.dialogueLines?.length || 0})</span>
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '11px',
              background: activeInspectorTab === 'overlays' ? 'var(--ed-surface-elevated)' : 'transparent',
              color: activeInspectorTab === 'overlays' ? '#67e8f9' : 'var(--ed-text-muted)',
              fontWeight: activeInspectorTab === 'overlays' ? 600 : 400,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onClick={() => setActiveInspectorTab('overlays')}
          >
            <span>📍</span>
            <span>Overlays ({overlays.length})</span>
          </button>
        </div>
      </div>

      {activeInspectorTab === 'animation' ? (
        <div className="ed-inspector-content">
          {selectedCharacterInstance && scene.animationData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ed-border)', paddingBottom: '8px' }}>
                <button
                  type="button"
                  className="ed-tool-btn"
                  onClick={() => onSelectInstance && onSelectInstance(null)}
                  style={{ fontSize: '11px' }}
                >
                  ← All Characters
                </button>
                <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
                  Selected Rig
                </span>
              </div>

              <CharacterAnimationInspector
                instance={selectedCharacterInstance}
                animationData={scene.animationData}
                sceneDurationMs={durationMs}
                sceneId={scene.sceneId}
                characters={characters}
                onUpdateInstance={(id, updates) => onUpdateInstance && onUpdateInstance(id, updates)}
                onUpdateAnimationData={(newData) => onUpdateAnimationData && onUpdateAnimationData(scene.sceneId, newData)}
                onRemoveInstance={(id) => onRemoveCharacterFromScene && onRemoveCharacterFromScene(scene.sceneId, id)}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="ed-field-group">
                <div className="ed-field-label">
                  <span>Characters in this Scene ({characterInstances.length})</span>
                </div>

                {characterInstances.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {characterInstances.map((inst) => (
                      <div
                        key={inst.instanceId}
                        className="ed-asset-item-card"
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderColor: inst.instanceId === selectedInstanceId ? 'var(--ed-accent)' : undefined,
                        }}
                        onClick={() => onSelectInstance && onSelectInstance(inst.instanceId)}
                      >
                        <div className="ed-asset-info">
                          <div className="ed-asset-title">{inst.name}</div>
                          <div className="ed-asset-subtitle">
                            Scale: {Math.round(inst.scale * 100)}% • Z: {inst.zIndex}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="ed-tool-btn primary"
                          style={{ fontSize: '11px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectInstance) onSelectInstance(inst.instanceId);
                          }}
                        >
                          Edit Rig
                        </button>
                        <button
                          type="button"
                          className="ed-tool-btn"
                          style={{ fontSize: '11px', color: '#f87171', padding: '4px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onRemoveCharacterFromScene) onRemoveCharacterFromScene(scene.sceneId, inst.instanceId);
                          }}
                          title="Remove character"
                        >
                          <TrashIcon size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '20px 12px',
                      background: 'var(--ed-bg)',
                      borderRadius: '8px',
                      border: '1px solid var(--ed-border)',
                      color: 'var(--ed-text-muted)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <SparklesIcon size={24} color="#8b5cf6" />
                    <span style={{ fontWeight: 600, color: 'var(--ed-text)', fontSize: '13px' }}>
                      No 2D Characters in Scene
                    </span>
                    <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.4 }}>
                      Add a modular SVG character rig below to animate walking, waving, and motion paths.
                    </p>
                  </div>
                )}
              </div>

              {/* Add Character Section */}
              <div className="ed-field-group" style={{ borderTop: '1px solid var(--ed-border)', paddingTop: '12px' }}>
                <span className="ed-field-label">Add Vector Character Rig</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    className="ed-btn-action primary"
                    style={{ fontSize: '11px', padding: '8px 4px', textAlign: 'center' }}
                    onClick={() => onAddCharacterToScene && onAddCharacterToScene(scene.sceneId, 'pip_the_bear')}
                  >
                    + Pip the Bear
                  </button>
                  <button
                    type="button"
                    className="ed-btn-action primary"
                    style={{ fontSize: '11px', padding: '8px 4px', textAlign: 'center' }}
                    onClick={() => onAddCharacterToScene && onAddCharacterToScene(scene.sceneId, 'sammy_the_kid')}
                  >
                    + Sammy the Kid
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeInspectorTab === 'dialogue' ? (
        <div className="ed-inspector-content">
          <DialogueInspector
            scene={scene}
            characters={characters}
            selectedDialogueId={selectedDialogueId || null}
            onSelectDialogue={(id) => (onSelectDialogue ? onSelectDialogue(id) : undefined)}
            onUpdateDialogue={handleUpdateDialogueLine}
            onDeleteDialogue={handleDeleteDialogueLine}
            onAddDialogue={handleAddDialogueLine}
            onSaveCharacterDefault={onSaveCharacterDefault}
          />
        </div>
      ) : activeInspectorTab === 'overlays' ? (
        <div className="ed-inspector-content">
          <OverlayInspector
            animationData={currentAnimationData}
            selectedOverlayId={selectedOverlayId || null}
            onSelectOverlay={(id) => {
              if (onSelectOverlay) onSelectOverlay(id);
            }}
            onAddOverlay={handleAddOverlayByType}
            onUpdateOverlay={handleUpdateOverlayInternal}
            onDeleteOverlay={handleDeleteOverlayInternal}
            onDuplicateOverlay={handleDuplicateOverlayInternal}
            onReorderOverlay={handleReorderOverlayDirection}
            playheadMs={playheadMs}
          />
        </div>
      ) : (
        <div className="ed-inspector-content">
        {/* Title */}
        <div className="ed-field-group">
          <label className="ed-field-label">Scene Title</label>
          <input
            className="ed-input"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleTitleBlur}
          />
        </div>

        {/* Timing Section */}
        <div className="ed-field-group">
          <div className="ed-field-label">
            <span>Timing & Duration</span>
            <span style={{ fontFamily: 'monospace' }}>{formatDurationHuman(durationMs)}</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              fontSize: '12px',
              fontFamily: 'monospace',
              background: 'var(--ed-bg)',
              padding: '8px',
              borderRadius: '6px',
            }}
          >
            <div>Start: {formatTimeMs(scene.startMs)}</div>
            <div>End: {formatTimeMs(scene.endMs)}</div>
          </div>

          {/* Duration Adjust: Direct Numeric Input & Steppers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Duration:</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                step="0.5"
                min="1.5"
                max="300"
                className="ed-input"
                style={{ width: '64px', padding: '4px 6px', fontSize: '12px', textAlign: 'center', fontFamily: 'monospace' }}
                value={durationInputVal}
                onChange={(e) => setDurationInputVal(e.target.value)}
                onBlur={handleDurationInputBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleDurationInputBlur();
                  }
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)', fontFamily: 'monospace' }}>s</span>
            </div>
            <button className="ed-tool-btn" onClick={() => handleDurationStep(-1)} title="Decrease duration by 1s">
              -1s
            </button>
            <button className="ed-tool-btn" onClick={() => handleDurationStep(1)} title="Increase duration by 1s">
              +1s
            </button>
            {scene.actualAudioDurationMs && scene.actualAudioDurationMs > durationMs && (
              <button
                className="ed-tool-btn"
                style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444', color: '#fca5a5' }}
                onClick={handleFitToVoice}
              >
                Fit to Voice
              </button>
            )}
          </div>

          {/* Ripple Mode Indicator & Explanation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'var(--ed-text-muted)' }}>
            <span>Ripple Edit: <strong style={{ color: isRippleOn ? '#c4b5fd' : '#94a3b8' }}>{isRippleOn ? 'ON' : 'OFF'}</strong></span>
            {onToggleRipple && (
              <button
                type="button"
                onClick={onToggleRipple}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8b5cf6',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                  fontSize: '11px',
                }}
              >
                Toggle
              </button>
            )}
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '10px', color: '#64748b', lineHeight: 1.3 }}>
            {isRippleOn
              ? 'Downstream scenes shift automatically when this scene duration changes.'
              : 'Subsequent scenes do not shift; timing remains untouched.'}
          </p>

          {/* Timing Warning Alert */}
          {!timingValidation.isValid && (
            <div className="ed-warning-box">
              <AlertTriangleIcon size={14} color="#f59e0b" />
              <span>{timingValidation.warning}</span>
            </div>
          )}
        </div>

        {/* Narration Section */}
        <div className="ed-field-group">
          <div className="ed-field-label">
            <span>Narration Text</span>
            {scene.actualAudioDurationMs ? (
              <span className="ed-audio-badge-verified" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <CheckIcon size={11} /> {(scene.actualAudioDurationMs / 1000).toFixed(1)}s Verified
              </span>
            ) : (
              <span className="ed-audio-badge-estimated">
                ~{formatDurationHuman(estimatedSpeechMs)} Est.
              </span>
            )}
          </div>
          <textarea
            className="ed-textarea"
            value={localNarration}
            onChange={(e) => setLocalNarration(e.target.value)}
            onBlur={handleNarrationBlur}
            placeholder="Type spoken narration for this scene..."
          />

          {/* Kokoro-82M Voice Studio Controls */}
          <div
            className="ed-voice-studio-panel"
            style={{
              background: 'var(--ed-bg)',
              border: '1px solid var(--ed-border)',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              marginTop: '4px',
              marginBottom: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🎙️ Scene Narrator Voice Studio
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: selectedProvider === 'kokoro' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: selectedProvider === 'kokoro' ? '#34d399' : '#fbbf24',
                  fontWeight: 600,
                }}
              >
                {selectedProvider === 'kokoro' ? '● Kokoro-82M (Local)' : '● Google TTS (Cloud)'}
              </span>
            </div>

            {/* Provider & Language Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--ed-text-muted)', display: 'block', marginBottom: '3px' }}>
                  TTS Provider
                </label>
                <select
                  className="ed-input"
                  style={{ fontSize: '11px', padding: '4px 6px', height: '28px' }}
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value as any)}
                >
                  <option value="kokoro">Kokoro-82M (Neural)</option>
                  <option value="google">Google TTS (Fallback)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '10px', color: 'var(--ed-text-muted)', display: 'block', marginBottom: '3px' }}>
                  Language / Accent
                </label>
                <select
                  className="ed-input"
                  style={{ fontSize: '11px', padding: '4px 6px', height: '28px' }}
                  value={selectedLanguage}
                  onChange={(e) => {
                    const l = e.target.value;
                    setSelectedLanguage(l);
                    if (l === 'hi') setSelectedVoice('hf_alpha');
                    else if (l === 'en-gb') setSelectedVoice('bf_emma');
                    else setSelectedVoice('af_heart');
                  }}
                >
                  <option value="hi">🇮🇳 Hindi (हिन्दी) [Default]</option>
                  <option value="en-us">🇺🇸 English (US)</option>
                  <option value="en-gb">🇬🇧 English (UK)</option>
                </select>
              </div>
            </div>

            {/* Voice Selection & Preview */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <label style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>Scene Narrator Voice</label>
                <button
                  type="button"
                  className="ed-tool-btn"
                  style={{ fontSize: '10px', padding: '2px 8px', color: '#c4b5fd', borderColor: '#8b5cf6' }}
                  onClick={handlePreviewVoice}
                  disabled={isPreviewingVoice}
                >
                  {isPreviewingVoice ? 'Previewing...' : '🔊 Audition Voice'}
                </button>
              </div>
              <select
                className="ed-input"
                style={{ fontSize: '11px', padding: '4px 6px', height: '30px' }}
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
              >
                {ttsVoices
                  .filter((v) => {
                    if (selectedLanguage === 'hi') {
                      return v.lang === 'hi' || v.id.startsWith('hf_') || v.id.startsWith('hm_');
                    }
                    if (selectedLanguage === 'en-gb') {
                      return v.lang === 'en-gb' || v.id.startsWith('bf_') || v.id.startsWith('bm_');
                    }
                    if (selectedLanguage === 'en-us') {
                      return v.lang === 'en-us' || v.id.startsWith('af_') || v.id.startsWith('am_');
                    }
                    return true;
                  })
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.gender}, {v.accent || v.lang})
                    </option>
                  ))}
              </select>
            </div>

            {/* Speaking Emotion */}
            <div>
              <label style={{ fontSize: '10px', color: 'var(--ed-text-muted)', display: 'block', marginBottom: '3px' }}>
                Narrator Speaking Emotion
              </label>
              <select
                className="ed-input"
                style={{ fontSize: '11px', padding: '4px 6px', height: '30px' }}
                value={voiceEmotion}
                onChange={(e) => {
                  const em = e.target.value as SpeakingEmotion;
                  setVoiceEmotion(em);
                  setVoiceEmotionIntensity(em === 'happy' ? 60 : (em === 'neutral' ? 0 : 50));
                }}
              >
                {EMOTION_OPTIONS.map((emo) => (
                  <option key={emo.id} value={emo.id}>
                    {emo.emoji} {emo.label} — {emo.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Narrator Emotion Intensity Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--ed-text-muted)' }}>Emotion Intensity</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#c4b5fd' }}>
                    {voiceEmotionIntensity <= 0
                      ? '0% Neutral'
                      : voiceEmotionIntensity <= 25
                      ? '25% Subtle'
                      : voiceEmotionIntensity <= 50
                      ? '50% Moderate'
                      : voiceEmotionIntensity === 60
                      ? '60% Happy'
                      : voiceEmotionIntensity <= 75
                      ? '75% Strong'
                      : '100% Max'}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--ed-text)', minWidth: '38px', textAlign: 'right' }}>
                    {voiceEmotionIntensity}%
                  </span>
                </div>
              </div>
              <input
                type="range"
                className="ed-inspector-slider"
                min="0"
                max="100"
                step="1"
                value={voiceEmotionIntensity}
                onChange={(e) => setVoiceEmotionIntensity(parseInt(e.target.value, 10) || 0)}
              />
              <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                {[
                  { val: 0, label: '0% Min' },
                  { val: 25, label: '25% Subtle' },
                  { val: 50, label: '50% Mod' },
                  { val: 60, label: '60% Happy' },
                  { val: 75, label: '75% Strong' },
                  { val: 100, label: '100% Max' },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => setVoiceEmotionIntensity(p.val)}
                    style={{
                      fontSize: '9px',
                      padding: '2px 5px',
                      borderRadius: '4px',
                      border: voiceEmotionIntensity === p.val ? '1px solid #8b5cf6' : '1px solid var(--ed-border)',
                      background: voiceEmotionIntensity === p.val ? 'rgba(139, 92, 246, 0.25)' : 'var(--ed-surface-elevated)',
                      color: voiceEmotionIntensity === p.val ? '#c4b5fd' : 'var(--ed-text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* In-line Voice Preview Player */}
            {previewAudioUrl && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(139, 92, 246, 0.12)',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                }}
              >
                <audio
                  ref={previewAudioRef}
                  src={resolveAssetUrl(previewAudioUrl)}
                  onEnded={() => setIsPlayingPreview(false)}
                  onError={() => setIsPlayingPreview(false)}
                />
                <button
                  type="button"
                  className="ed-tool-btn primary"
                  style={{ width: '24px', height: '24px', padding: 0, justifyContent: 'center' }}
                  onClick={() => {
                    if (previewAudioRef.current) {
                      if (isPlayingPreview) {
                        previewAudioRef.current.pause();
                        setIsPlayingPreview(false);
                      } else {
                        previewAudioRef.current.play();
                        setIsPlayingPreview(true);
                      }
                    }
                  }}
                >
                  {isPlayingPreview ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
                </button>
                <span style={{ fontSize: '11px', color: '#e2e8f0', flex: 1 }}>
                  Auditioning: <strong>{ttsVoices.find((v) => v.id === selectedVoice)?.name.split('(')[0] || selectedVoice}</strong> ({voiceEffect})
                </span>
                <button
                  type="button"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                  onClick={() => setPreviewAudioUrl(null)}
                  title="Dismiss preview"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Speech Speed Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <label style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>Speech Speed</label>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#c4b5fd' }}>
                  {voiceSpeed.toFixed(2)}x {voiceSpeed === 1.0 ? '(Normal)' : voiceSpeed < 1.0 ? '(Slower)' : '(Faster)'}
                </span>
              </div>
              <input
                type="range"
                className="ed-inspector-slider"
                min="0.5"
                max="2.0"
                step="0.05"
                value={voiceSpeed}
                onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
              />
            </div>

            {/* Narrator Voice Style / Effect Pills */}
            <div>
              <label style={{ fontSize: '10px', color: 'var(--ed-text-muted)', display: 'block', marginBottom: '4px' }}>
                Narrator Voice Style & Audio Effect
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                <button
                  type="button"
                  className={`ed-tool-btn ${voiceEffect === 'normal' ? 'primary' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '5px 2px',
                    justifyContent: 'center',
                    background: voiceEffect === 'normal' ? '#7c3aed' : undefined,
                    color: voiceEffect === 'normal' ? '#ffffff' : undefined,
                  }}
                  onClick={() => setVoiceEffect('normal')}
                >
                  ✨ Normal
                </button>
                <button
                  type="button"
                  className={`ed-tool-btn ${voiceEffect === 'robot' ? 'primary' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '5px 2px',
                    justifyContent: 'center',
                    background: voiceEffect === 'robot' ? '#7c3aed' : undefined,
                    color: voiceEffect === 'robot' ? '#ffffff' : undefined,
                  }}
                  onClick={() => setVoiceEffect('robot')}
                  title="Electronic synthesized robotic voice"
                >
                  🤖 Robot
                </button>
                <button
                  type="button"
                  className={`ed-tool-btn ${voiceEffect === 'cartoon' ? 'primary' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '5px 2px',
                    justifyContent: 'center',
                    background: voiceEffect === 'cartoon' ? '#7c3aed' : undefined,
                    color: voiceEffect === 'cartoon' ? '#ffffff' : undefined,
                  }}
                  onClick={() => setVoiceEffect('cartoon')}
                  title="Playful high-pitched cartoon creature"
                >
                  🐿️ Cartoon
                </button>
                <button
                  type="button"
                  className={`ed-tool-btn ${voiceEffect === 'whisper' ? 'primary' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '5px 2px',
                    justifyContent: 'center',
                    background: voiceEffect === 'whisper' ? '#7c3aed' : undefined,
                    color: voiceEffect === 'whisper' ? '#ffffff' : undefined,
                  }}
                  onClick={() => setVoiceEffect('whisper')}
                  title="Soft intimate whisper delivery"
                >
                  🤫 Whisper
                </button>
                <button
                  type="button"
                  className={`ed-tool-btn ${voiceEffect === 'shout' ? 'primary' : ''}`}
                  style={{
                    fontSize: '10px',
                    padding: '5px 2px',
                    justifyContent: 'center',
                    background: voiceEffect === 'shout' ? '#7c3aed' : undefined,
                    color: voiceEffect === 'shout' ? '#ffffff' : undefined,
                  }}
                  onClick={() => setVoiceEffect('shout')}
                  title="Loud shouting projection"
                >
                  📢 Shout
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
              {scene.actualAudioDurationMs
                ? `Actual voice: ${formatDurationHuman(scene.actualAudioDurationMs)}`
                : 'No audio generated'}
            </span>
            <button
              className="ed-btn-action primary"
              style={{ fontSize: '11px', padding: '6px 12px' }}
              onClick={handleGenerateVoiceClick}
              disabled={isGeneratingVoice || !localNarration.trim()}
            >
              {isGeneratingVoice ? 'Generating...' : scene.audioUrl ? 'Regenerate Voice' : 'Generate Voice (TTS)'}
            </button>
          </div>

          {/* Outdated Narration Warning Banner */}
          {Boolean(scene.audioUrl && localNarration.trim() !== (scene.narration || '').trim()) && (
            <div className="ed-warning-box" style={{ background: 'rgba(234, 179, 8, 0.1)', borderColor: '#eab308', color: '#fef08a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangleIcon size={14} color="#eab308" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Narration text changed</div>
                <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.9 }}>Existing voice audio does not match the edited text.</div>
                <button
                  className="ed-tool-btn"
                  style={{ marginTop: '6px', background: '#eab308', color: '#1a1a1a', fontWeight: 'bold' }}
                  onClick={handleGenerateVoiceClick}
                  disabled={isGeneratingVoice}
                >
                  {isGeneratingVoice ? 'Regenerating...' : 'Regenerate Voice'}
                </button>
              </div>
            </div>
          )}

          {/* Dedicated Audio Player Widget */}
          {scene.audioUrl && (
            <div className="ed-audio-player-card">
              <audio
                ref={audioPlayerRef}
                src={resolveAssetUrl(scene.audioUrl)}
                preload="metadata"
                onLoadedMetadata={(e) => {
                  setAudioDuration(e.currentTarget.duration);
                  setAudioError(null);
                }}
                onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
                onEnded={() => {
                  setAudioPlaying(false);
                  setAudioCurrentTime(0);
                }}
                onError={() => {
                  setAudioError('Audio file could not be loaded from storage.');
                  setAudioPlaying(false);
                }}
              />

              {audioError ? (
                <div style={{ color: '#f87171', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangleIcon size={13} color="#f87171" />
                    <span>{audioError}</span>
                  </span>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    style={{ fontSize: '10px' }}
                    onClick={() => {
                      if (audioPlayerRef.current) {
                        audioPlayerRef.current.load();
                        setAudioError(null);
                      }
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {/* Row 1: Transport & Scrubber */}
                  <div className="ed-audio-transport-row">
                    <button
                      type="button"
                      className="ed-audio-btn-sm"
                      onClick={() => {
                        if (!audioPlayerRef.current) return;
                        if (audioPlaying) {
                          audioPlayerRef.current.pause();
                          setAudioPlaying(false);
                        } else {
                          audioPlayerRef.current
                            .play()
                            .then(() => setAudioPlaying(true))
                            .catch((err) => {
                              console.error('Playback error:', err);
                              setAudioError('Playback failed');
                              setAudioPlaying(false);
                            });
                        }
                      }}
                      title={audioPlaying ? 'Pause Audio' : 'Play Audio'}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {audioPlaying ? <PauseIcon size={11} color="#ffffff" /> : <PlayIcon size={11} color="#ffffff" />}
                    </button>

                    <input
                      type="range"
                      className="ed-audio-scrubber"
                      min="0"
                      max={audioDuration || (scene.actualAudioDurationMs ? scene.actualAudioDurationMs / 1000 : 1)}
                      step="0.05"
                      value={audioCurrentTime}
                      onChange={(e) => {
                        const newTime = parseFloat(e.target.value);
                        if (audioPlayerRef.current) {
                          audioPlayerRef.current.currentTime = newTime;
                        }
                        setAudioCurrentTime(newTime);
                      }}
                    />

                    <div className="ed-audio-time">
                      {formatTimeMs(Math.round(audioCurrentTime * 1000))} / {formatTimeMs(Math.round((audioDuration || (scene.actualAudioDurationMs ? scene.actualAudioDurationMs / 1000 : 0)) * 1000))}
                    </div>
                  </div>

                  {/* Row 2: Volume, Badge & Actions */}
                  <div className="ed-audio-controls-row">
                    <div className="ed-audio-vol-group">
                      <span title="Volume" style={{ display: 'inline-flex', alignItems: 'center', color: '#94a3b8' }}>
                        <VolumeHighIcon size={12} />
                      </span>
                      <input
                        type="range"
                        className="ed-audio-vol-slider"
                        min="0"
                        max="1"
                        step="0.05"
                        value={audioVolume}
                        onChange={(e) => {
                          const newVol = parseFloat(e.target.value);
                          setAudioVolume(newVol);
                          if (audioPlayerRef.current) {
                            audioPlayerRef.current.volume = newVol;
                          }
                        }}
                        title={`Volume: ${Math.round(audioVolume * 100)}%`}
                      />
                      <span className="ed-audio-vol-label">{Math.round(audioVolume * 100)}%</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="ed-audio-badge-verified" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <CheckIcon size={11} /> {(scene.actualAudioDurationMs ? scene.actualAudioDurationMs / 1000 : audioDuration).toFixed(1)}s Verified
                      </span>

                      {onRemoveVoice && (
                        showRemoveVoiceConfirm ? (
                          <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="ed-tool-btn"
                              style={{ fontSize: '10px', padding: '2px 5px', background: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                              onClick={() => {
                                setShowRemoveVoiceConfirm(false);
                                onRemoveVoice(scene.sceneId);
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="ed-tool-btn"
                              style={{ fontSize: '10px', padding: '2px 5px' }}
                              onClick={() => setShowRemoveVoiceConfirm(false)}
                            >
                              <CloseIcon size={10} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="ed-tool-btn"
                            style={{ fontSize: '10px', color: '#f87171', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => setShowRemoveVoiceConfirm(true)}
                            title="Remove narration audio from this scene"
                          >
                            <TrashIcon size={12} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Scene Background (2D Stage) Section */}
        <div className="ed-field-group ed-background-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label className="ed-field-label" style={{ margin: 0, fontWeight: 600 }}>Scene Background</label>
            {currentBgUrl ? (
              <span className="ed-bg-badge-fit">{currentBgFit.toUpperCase()}</span>
            ) : (
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Default Stage</span>
            )}
          </div>

          <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 8px 0', lineHeight: 1.4 }}>
            Upload or select a scenic background. Reusable characters animate independently on top.
          </p>

          <input
            type="file"
            ref={bgFileInputRef}
            style={{ display: 'none' }}
            accept="image/png,image/jpeg"
            onChange={handleUploadBackgroundFile}
          />

          {bgError && (
            <div style={{ fontSize: '11px', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '6px 8px', borderRadius: '4px', marginBottom: '8px' }}>
              {bgError}
            </div>
          )}

          {currentBgUrl ? (
            <div>
              <div className="ed-bg-preview-box">
                <img
                  src={currentBgUrl}
                  alt="Scene Background"
                  className={currentBgFit === 'contain' ? 'fit-contain' : 'fit-cover'}
                />
              </div>

              {/* Fit Mode Toggle */}
              <div style={{ marginTop: '8px' }}>
                <label className="ed-field-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Fit Mode</label>
                <div className="ed-bg-fit-toggles">
                  <button
                    type="button"
                    className={`ed-bg-fit-btn ${currentBgFit === 'cover' ? 'active' : ''}`}
                    onClick={() => handleToggleFit('cover')}
                    title="Fill 16:9 frame (crops edges if needed)"
                  >
                    Cover (Fill)
                  </button>
                  <button
                    type="button"
                    className={`ed-bg-fit-btn ${currentBgFit === 'contain' ? 'active' : ''}`}
                    onClick={() => handleToggleFit('contain')}
                    title="Preserve aspect ratio (letterbox / pillarbox with dark stage backdrop)"
                  >
                    Contain (Fit)
                  </button>
                </div>
              </div>

              {/* Actions row */}
              <div className="ed-bg-actions-row">
                <button
                  type="button"
                  className="ed-btn-action"
                  disabled={isUploadingBg}
                  onClick={() => bgFileInputRef.current?.click()}
                  title="Upload a new background image from your computer (PNG/JPEG)"
                >
                  <UploadIcon size={12} />
                  <span>{isUploadingBg ? 'Uploading...' : 'Replace'}</span>
                </button>
                <button
                  type="button"
                  className="ed-btn-action"
                  onClick={handleOpenStoryBackgroundsModal}
                  title="Choose from images already used in this story"
                >
                  <ImageIcon size={12} />
                  <span>From Story</span>
                </button>
                <button
                  type="button"
                  className="ed-btn-action danger"
                  onClick={() => setShowRemoveBgConfirm(true)}
                  title="Remove background and restore default stage"
                >
                  <TrashIcon size={12} />
                  <span>Remove</span>
                </button>
              </div>

              {showRemoveBgConfirm && (
                <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px' }}>
                  <p style={{ fontSize: '11px', color: '#f87171', margin: '0 0 6px 0' }}>
                    Remove custom background and restore default stylized stage?
                  </p>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="ed-tool-btn"
                      style={{ fontSize: '10px', padding: '2px 8px' }}
                      onClick={() => setShowRemoveBgConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="ed-tool-btn"
                      style={{ fontSize: '10px', padding: '2px 8px', background: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                      onClick={handleRemoveBackground}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div
                style={{
                  border: '1px dashed #cbd5e1',
                  borderRadius: '6px',
                  padding: '16px 10px',
                  textAlign: 'center',
                  background: 'rgba(248, 250, 252, 0.5)',
                  marginBottom: '8px',
                }}
              >
                <div style={{ color: '#94a3b8', marginBottom: '6px' }}>
                  <ImageIcon size={24} />
                </div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#475569', margin: '0 0 2px 0' }}>
                  No custom background
                </p>
                <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>
                  Using default vector stage backdrop
                </p>
              </div>

              <div className="ed-bg-actions-row">
                <button
                  type="button"
                  className="ed-btn-action primary"
                  disabled={isUploadingBg}
                  onClick={() => bgFileInputRef.current?.click()}
                  style={{ flex: 1 }}
                >
                  <UploadIcon size={13} />
                  <span>{isUploadingBg ? 'Uploading...' : 'Upload Image (PNG/JPEG)'}</span>
                </button>
                <button
                  type="button"
                  className="ed-btn-action"
                  onClick={handleOpenStoryBackgroundsModal}
                  title="Choose from images already used in this story"
                >
                  <ImageIcon size={13} />
                  <span>From Story</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Visual & Video Media Section */}
        <div className="ed-field-group">
          <label className="ed-field-label">Visual Scene Prompt</label>
          <textarea
            className="ed-textarea"
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onBlur={handlePromptBlur}
            placeholder="Describe the visual composition, characters, action..."
          />

          <label className="ed-field-label" style={{ marginTop: '4px' }}>Camera Direction</label>
          <select className="ed-select" value={localCamera} onChange={handleCameraChange}>
            <option value="Eye level wide establishing shot">Eye level wide establishing shot</option>
            <option value="Medium close-up">Medium close-up</option>
            <option value="Dramatic low angle looking up">Dramatic low angle looking up</option>
            <option value="High angle bird's eye view">High angle bird's eye view</option>
            <option value="Over-the-shoulder shot">Over-the-shoulder shot</option>
            <option value="Dynamic tracking pan left-to-right">Dynamic tracking pan left-to-right</option>
            <option value="Soft bokeh macro focus">Soft bokeh macro focus</option>
          </select>

          {/* Media Generation Workflows */}
          {(() => {
            const hasVisual = Boolean(scene.imageUrl || scene.image?.imageUrl);
            const hasVideo = Boolean(scene.videoUrl);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                {/* 1. Still Image Generation */}
                <div>
                  <button
                    className="ed-btn-action primary"
                    style={{ width: '100%' }}
                    onClick={() => onGenerateImage(scene.sceneId, localPrompt)}
                    disabled={isGeneratingImage}
                  >
                    {isGeneratingImage ? 'Generating Image...' : hasVisual ? 'Regenerate Scene Image' : 'Generate Scene Image'}
                  </button>
                </div>

                {/* 2. Video Clip Generation Workflows */}
                <div style={{ background: 'var(--ed-bg)', padding: '10px', borderRadius: '6px', border: '1px solid var(--ed-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase' }}>
                      Scene Video Generation
                    </span>
                    {hasVideo && (
                      <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 600, background: 'rgba(52, 211, 153, 0.1)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(52, 211, 153, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <FilmIcon size={11} /> Video Ready
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {/* Workflow 2: Ken Burns Motion from Image */}
                    <button
                      type="button"
                      className="ed-btn-action"
                      style={{ fontSize: '11px', padding: '6px 8px', textAlign: 'center' }}
                      onClick={() => onGenerateVideo(scene.sceneId, 'ffmpeg')}
                      disabled={isGeneratingVideo || !hasVisual}
                      title={!hasVisual ? 'Generate an image first to enable Ken Burns motion rendering' : 'Render smooth Ken Burns motion video from current image'}
                    >
                      {isGeneratingVideo ? 'Rendering...' : hasVideo ? 'Re-render Motion' : 'Render Motion (FFmpeg)'}
                    </button>

                    {/* Workflow 1: AI Video Provider */}
                    <button
                      type="button"
                      className="ed-btn-action"
                      style={{ fontSize: '11px', padding: '6px 8px', textAlign: 'center' }}
                      onClick={() => onGenerateVideo(scene.sceneId, 'ai')}
                      disabled={isGeneratingVideo}
                      title="Generate video using AI video model (e.g. Replicate/Runway)"
                    >
                      {isGeneratingVideo ? 'Generating...' : 'Generate AI Video'}
                    </button>
                  </div>

                  {/* Clarifying prerequisite hint if no image exists yet */}
                  {!hasVisual && (
                    <div style={{ fontSize: '11px', color: 'var(--ed-text-faint)', lineHeight: 1.3 }}>
                      Generate an image above first to enable FFmpeg Ken Burns motion rendering, or generate AI video directly.
                    </div>
                  )}

                  {hasVideo && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckIcon size={11} color="#34d399" />
                      <span>Playable in center preview & timeline. Original still image is preserved.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Structured Dialogue Section */}
        <div className="ed-field-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="ed-field-label">Structured Dialogue</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {(dialogueList.length > 0 || (scene.animationData?.dialogueLines?.length || 0) > 0) && (
                <button
                  type="button"
                  className="ed-tool-btn primary"
                  style={{ fontSize: '10px', padding: '2px 8px' }}
                  disabled={isBatchGeneratingDialogue}
                  onClick={handleBatchGenerateDialogueAudio}
                  title="Generate Kokoro-82M speech audio for all dialogue lines in this scene"
                >
                  {isBatchGeneratingDialogue ? '⏳ Generating Audio...' : '⚡ Generate All Audio'}
                </button>
              )}
              <button
                type="button"
                className="ed-tool-btn"
                style={{ fontSize: '10px', padding: '2px 6px' }}
                onClick={() => {
                  const defaultSpeaker = characters[0]?.name || (characterInstances[0]?.name) || 'Narrator';
                  handleUpdateDialogue([...dialogueList, { speaker: defaultSpeaker, text: '' }]);
                }}
              >
                + Add Line
              </button>
            </div>
          </div>

          {dialogueList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {dialogueList.map((dlg, idx) => {
                const matchingLine = (scene.animationData?.dialogueLines || []).find(
                  (l) => l.text === dlg.text && l.characterName === dlg.speaker
                ) || scene.animationData?.dialogueLines?.[idx];
                const hasAudio = Boolean(matchingLine?.audioUrl);

                return (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--ed-bg)',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--ed-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        className="ed-input"
                        style={{ flex: '0 0 100px', fontSize: '11px', padding: '3px 6px' }}
                        value={dlg.speaker}
                        placeholder="Speaker"
                        onChange={(e) => {
                          const updated = [...dialogueList];
                          updated[idx] = { ...updated[idx], speaker: e.target.value };
                          handleUpdateDialogue(updated);
                        }}
                      />
                      <input
                        className="ed-input"
                        style={{ flex: 1, fontSize: '11px', padding: '3px 6px' }}
                        value={dlg.text}
                        placeholder="Dialogue line..."
                        onChange={(e) => {
                          const updated = [...dialogueList];
                          updated[idx] = { ...updated[idx], text: e.target.value };
                          handleUpdateDialogue(updated);
                        }}
                      />
                      <button
                        type="button"
                        className="ed-tool-btn"
                        style={{ color: '#f87171', padding: '3px 5px' }}
                        onClick={() => {
                          const updated = dialogueList.filter((_, i) => i !== idx);
                          handleUpdateDialogue(updated);
                        }}
                        title="Delete dialogue line"
                      >
                        <TrashIcon size={11} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', fontSize: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {hasAudio ? (
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '3px',
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: '#60a5fa',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                            title="Dialogue audio file ready"
                          >
                            🔊 Audio Ready
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '3px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#f87171',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                            title="No audio generated yet — click 'Generate All Audio'"
                          >
                            🔇 Audio Pending
                          </span>
                        )}
                        {matchingLine?.voice && (
                          <span style={{ color: 'var(--ed-text-muted)' }}>Voice: {matchingLine.voice}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', fontStyle: 'italic' }}>
              No structured dialogue in this scene yet. Click "+ Add Line" to add speaker lines.
            </div>
          )}
        </div>

        {/* Character Actions Section */}
        <div className="ed-field-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="ed-field-label">Character Actions</label>
            <button
              type="button"
              className="ed-tool-btn primary"
              style={{ fontSize: '10px', padding: '2px 6px' }}
              onClick={() => {
                const defaultChar = characters[0]?.name || (characterInstances[0]?.name) || 'Hero';
                handleUpdateActions([...actionList, { characterName: defaultChar, action: 'waves happily', pose: 'wave' }]);
              }}
            >
              + Add Action
            </button>
          </div>

          {actionList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {actionList.map((act, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--ed-bg)',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--ed-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      className="ed-input"
                      style={{ flex: '0 0 90px', fontSize: '11px', padding: '3px 6px' }}
                      value={act.characterName}
                      placeholder="Character"
                      onChange={(e) => {
                        const updated = [...actionList];
                        updated[idx] = { ...updated[idx], characterName: e.target.value };
                        handleUpdateActions(updated);
                      }}
                    />
                    <input
                      className="ed-input"
                      style={{ flex: 1, fontSize: '11px', padding: '3px 6px' }}
                      value={act.action}
                      placeholder="Action description..."
                      onChange={(e) => {
                        const updated = [...actionList];
                        updated[idx] = { ...updated[idx], action: e.target.value };
                        handleUpdateActions(updated);
                      }}
                    />
                    <select
                      className="ed-select"
                      style={{ flex: '0 0 75px', fontSize: '11px', padding: '3px 4px' }}
                      value={act.pose || 'idle'}
                      onChange={(e) => {
                        const updated = [...actionList];
                        updated[idx] = { ...updated[idx], pose: e.target.value };
                        handleUpdateActions(updated);
                      }}
                    >
                      <option value="idle">idle</option>
                      <option value="walk">walk</option>
                      <option value="wave">wave</option>
                      <option value="jump">jump</option>
                    </select>
                    <button
                      type="button"
                      className="ed-tool-btn"
                      style={{ color: '#f87171', padding: '3px 5px' }}
                      onClick={() => {
                        const updated = actionList.filter((_, i) => i !== idx);
                        handleUpdateActions(updated);
                      }}
                      title="Delete action"
                    >
                      <TrashIcon size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', fontStyle: 'italic' }}>
              No character actions set. Click "+ Add Action" to record choreographed character actions.
            </div>
          )}
        </div>

        {/* 2D Character Animation Summary & Access */}
        <div style={{ background: 'var(--ed-bg)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--ed-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <SparklesIcon size={12} color="#8b5cf6" />
              <span>2D Character Animation</span>
            </span>
            <span style={{ fontSize: '10px', color: '#c4b5fd', background: 'rgba(139, 92, 246, 0.16)', padding: '1px 6px', borderRadius: '4px' }}>
              {characterInstances.length} {characterInstances.length === 1 ? 'character' : 'characters'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="ed-btn-action primary"
              style={{ flex: 1, fontSize: '11px', padding: '6px 8px' }}
              onClick={() => setActiveInspectorTab('animation')}
            >
              {characterInstances.length > 0 ? 'Edit Animation Rigs' : '+ Add 2D Character Rig'}
            </button>
          </div>
        </div>

        {/* Character References */}
        {characters.length > 0 && (
          <div className="ed-field-group">
            <label className="ed-field-label">Characters in this Scene</label>
            <div className="ed-char-chips">
              {characters.map((char) => {
                const isSelected = scene.characterIds?.includes(char.id);
                return (
                  <button
                    key={char.id}
                    type="button"
                    className={`ed-char-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggleCharacter(char.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>{isSelected ? <CheckIcon size={11} /> : <PlusIcon size={11} />}</span>
                    <span>{char.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Version History */}
        {versions && versions.length > 0 && (
          <div className="ed-field-group">
            <label className="ed-field-label">Version History ({versions.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: 'var(--ed-bg)',
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}
                >
                  <div>
                    <strong>v{ver.versionNumber}</strong> • {new Date(ver.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    style={{ fontSize: '10px' }}
                    onClick={() => onRestoreVersion(scene.sceneId, ver.id)}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scene Operations */}
        <div className="ed-field-group" style={{ borderTop: '1px solid var(--ed-border)', paddingTop: '14px' }}>
          <label className="ed-field-label">Scene Operations</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              className="ed-btn-action"
              onClick={() => onSplitScene(scene.sceneId, playheadMs)}
              disabled={!canSplitAtPlayhead}
              title={
                canSplitAtPlayhead
                  ? `Split scene at playhead position (${formatTimeMs(playheadMs)})`
                  : 'Place playhead inside this scene to split'
              }
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <ScissorsIcon size={13} />
              <span>Split Scene at Playhead</span>
            </button>

            <button
              type="button"
              className="ed-btn-action"
              onClick={() => onDuplicateScene(scene.sceneId)}
            >
              Duplicate Scene
            </button>

            {showDeleteConfirm ? (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', padding: '8px' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#fca5a5' }}>
                  Delete Scene {scene.number}? This will ripple subsequent scenes.
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      onDeleteScene(scene.sceneId);
                    }}
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="ed-btn-action"
                style={{ color: '#f87171', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={() => setShowDeleteConfirm(true)}
              >
                <TrashIcon size={13} />
                <span>Delete Scene</span>
              </button>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Story Backgrounds Picker Modal */}
      {showBgPicker && (
        <div className="ed-bg-modal-overlay" onClick={() => setShowBgPicker(false)}>
          <div className="ed-bg-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ed-bg-modal-header">
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Select From Story Backgrounds</h4>
              <button
                type="button"
                className="ed-tool-btn"
                style={{ padding: '2px 8px' }}
                onClick={() => setShowBgPicker(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '12px', maxHeight: '360px', overflowY: 'auto' }}>
              {isLoadingStoryBackgrounds ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '12px' }}>
                  Loading backgrounds...
                </div>
              ) : storyBackgrounds.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '12px' }}>
                  No previous backgrounds found in this story.
                  <div style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      className="ed-btn-action primary"
                      onClick={() => {
                        setShowBgPicker(false);
                        bgFileInputRef.current?.click();
                      }}
                      style={{ margin: '0 auto' }}
                    >
                      <UploadIcon size={12} />
                      <span>Upload New Image</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ed-bg-picker-grid">
                  {storyBackgrounds.map((bg, idx) => (
                    <div
                      key={bg.imageUrl + idx}
                      className="ed-bg-picker-item"
                      onClick={() => handleSelectStoryBackground(bg.imageUrl)}
                      title={`Used in Scene ${bg.sceneNumber}`}
                    >
                      <img src={bg.imageUrl} alt={`Scene ${bg.sceneNumber}`} />
                      <div className="ed-bg-picker-caption">Scene {bg.sceneNumber}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '8px 12px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="ed-btn-action"
                style={{ fontSize: '11px' }}
                onClick={() => {
                  setShowBgPicker(false);
                  bgFileInputRef.current?.click();
                }}
              >
                <UploadIcon size={11} />
                <span>Upload New</span>
              </button>
              <button
                type="button"
                className="ed-tool-btn"
                style={{ fontSize: '11px' }}
                onClick={() => setShowBgPicker(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

