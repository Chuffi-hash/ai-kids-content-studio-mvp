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
  generateSceneImage,
  getStoryVisualBible,
  updateStoryVisualBible,
  generateSceneBackgroundPrompt,
  getScenePromptHistory,
  saveScenePrompt,
  restoreScenePrompt,
  PromptHistoryEntry,
  StoryVisualBible,
} from '../../services/editor.service';
import { EMOTION_OPTIONS } from '../../utils/emotionSuggester';
import { FISH_VOICES_CATALOG } from '../characters/CharacterBuilderModal';
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
  SettingsIcon,
  CopyIcon,
  ArrowRightIcon,
  BookOpenIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CameraIcon,
} from '../common/Icons';
import { CollapsibleSection } from './CollapsibleSection';
import { getAllBackgroundAssets, BackgroundAsset, autoDirectStory } from '../../services/studio.service';
import ShotPlanningPanel from '../story/ShotPlanningPanel';


export type InspectorSection =
  | 'overview'
  | 'shots'
  | 'timing'
  | 'narration'
  | 'background'
  | 'characters'
  | 'dialogue'
  | 'overlays'
  | 'operations';

export function normalizeInspectorSection(tab?: string): InspectorSection {
  if (!tab || tab === 'scene' || tab === 'scene_settings' || tab === 'overview') return 'overview';
  if (tab === 'shots' || tab === 'shot_planning' || tab === 'cinematic_shots' || tab === 'director') return 'shots';
  if (tab === 'animation' || tab === 'rig' || tab === 'characters') return 'characters';
  if (tab === 'timing') return 'timing';
  if (tab === 'narration') return 'narration';
  if (tab === 'background') return 'background';
  if (tab === 'dialogue') return 'dialogue';
  if (tab === 'overlays') return 'overlays';
  if (tab === 'operations') return 'operations';
  return 'overview';
}

interface PropertiesInspectorProps {
  scene: EditorScene | null;
  characters: EditorCharacter[];
  playheadMs: number;
  storyId?: string;
  flowProjectId?: string | null;
  onUpdateScene: (sceneId: string, updates: Partial<EditorScene>) => void;
  onUploadBackground?: (sceneId: string, file: File, fit?: 'cover' | 'contain') => Promise<void>;
  onSetBackground?: (sceneId: string, imageUrl: string, fit?: 'cover' | 'contain') => Promise<void>;
  onUpdateBackgroundFit?: (sceneId: string, fit: 'cover' | 'contain') => Promise<void>;
  onRemoveBackground?: (sceneId: string) => Promise<void>;
  onGenerateImage: (
    sceneId: string,
    promptOverride?: string,
    options?: {
      cameraDirection?: string;
      cameraMovement?: string;
      aspectRatio?: string;
      visualStyle?: string;
      fit?: 'cover' | 'contain';
      previewOnly?: boolean;
    }
  ) => Promise<any>;
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
  onDuplicateOverlay?: (sceneId: string, overlayId: string) => void;
  onReorderOverlays?: (sceneId: string, overlays: EducationalOverlay[]) => void;

  selectedDialogueId?: string | null;
  onSelectDialogue?: (dialogueId: string | null) => void;
  onUpdateDialogue?: (dialogueId: string, updates: Partial<SceneDialogue>) => void;
  onDeleteDialogue?: (dialogueId: string) => Promise<void>;
  onAddDialogue?: (dialogue: SceneDialogue) => void;
  onSaveCharacterDefault?: (characterId: string, settings: { provider?: string; model?: string; voice?: string; lang?: string; emotion?: SpeakingEmotion; emotionIntensity?: number }) => Promise<void>;
  activeInspectorTab?: string;
  onTabChange?: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const PropertiesInspector: React.FC<PropertiesInspectorProps> = ({
  scene,
  characters,
  playheadMs,
  storyId,
  flowProjectId,
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
  onDuplicateOverlay,
  onReorderOverlays,
  selectedDialogueId,
  onSelectDialogue,
  onUpdateDialogue,
  onDeleteDialogue,
  onAddDialogue,
  onSaveCharacterDefault,
  activeInspectorTab: activeInspectorTabProp,
  onTabChange,
  isOpen = true,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  if (!scene) {
    return (
      <aside className="ed-inspector">
        <div className="ed-inspector-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Properties</h3>
          {onClose && (
            <button
              type="button"
              className="ed-icon-btn"
              onClick={onClose}
              title="Close inspector"
              style={{ width: '26px', height: '26px', fontSize: '11px', display: 'grid', placeItems: 'center' }}
            >
              ✕
            </button>
          )}
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
  const [localCameraMovement, setLocalCameraMovement] = useState<string>(
    (scene.animationData as any)?.cameraMovement || 'Static (no movement)'
  );
  const [localCameraRotation, setLocalCameraRotation] = useState<string>(
    (scene.animationData as any)?.cameraRotation || 'none'
  );
  const [localCameraRotationDegrees, setLocalCameraRotationDegrees] = useState<number>(
    typeof (scene.animationData as any)?.cameraRotationDegrees === 'number'
      ? (scene.animationData as any).cameraRotationDegrees
      : 10
  );
  const [localAspectRatio, setLocalAspectRatio] = useState<string>(
    (scene.animationData as any)?.background?.aspectRatio || '16:9'
  );
  const [localVisualStyle, setLocalVisualStyle] = useState<string>('Cinematic Storybook');
  const [isGeneratingBg, setIsGeneratingBg] = useState<boolean>(false);
  const [generatedPreview, setGeneratedPreview] = useState<{
    url: string;
    prompt?: string;
    imageId?: string;
  } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveVoiceConfirm, setShowRemoveVoiceConfirm] = useState(false);

  // Scene Background State (Phase 1 & Background Studio)
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [bgPickerTab, setBgPickerTab] = useState<'story' | 'studio'>('story');
  const [storyBackgrounds, setStoryBackgrounds] = useState<StoryBackgroundImage[]>([]);
  const [isLoadingStoryBackgrounds, setIsLoadingStoryBackgrounds] = useState(false);
  const [studioBackgrounds, setStudioBackgrounds] = useState<BackgroundAsset[]>([]);
  const [isLoadingStudioBackgrounds, setIsLoadingStudioBackgrounds] = useState(false);
  const [showRemoveBgConfirm, setShowRemoveBgConfirm] = useState(false);
  const [isAutoDirectingScene, setIsAutoDirectingScene] = useState(false);

  const [bgImgLoadError, setBgImgLoadError] = useState(false);
  const [previewImgError, setPreviewImgError] = useState(false);

  // V2 Story Visual Bible & Prompt Generation State (Google Flow Workflow A)
  const [visualBible, setVisualBible] = useState<StoryVisualBible | null>(null);
  const [isLoadingVisualBible, setIsLoadingVisualBible] = useState<boolean>(false);
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [showPromptHistory, setShowPromptHistory] = useState<boolean>(false);
  const [isGeneratingV2Prompt, setIsGeneratingV2Prompt] = useState<boolean>(false);
  const [copiedPromptToast, setCopiedPromptToast] = useState<boolean>(false);
  const [promptValidationInfo, setPromptValidationInfo] = useState<{
    valid: boolean;
    violations: string[];
  } | null>(null);
  const flowFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingFlowBg, setIsUploadingFlowBg] = useState<boolean>(false);

  const isBgExplicitlyRemoved = Boolean((scene.animationData as any)?.background?.removed);
  const currentBgUrl = isBgExplicitlyRemoved ? '' : (scene.animationData?.background?.imageUrl || scene.imageUrl || '');
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
    setLocalCameraMovement((scene.animationData as any)?.cameraMovement || 'Static (no movement)');
    setLocalCameraRotation((scene.animationData as any)?.cameraRotation || 'none');
    setLocalCameraRotationDegrees(
      typeof (scene.animationData as any)?.cameraRotationDegrees === 'number'
        ? (scene.animationData as any).cameraRotationDegrees
        : 10
    );
    setLocalAspectRatio((scene.animationData as any)?.background?.aspectRatio || '16:9');
    setShowRemoveVoiceConfirm(false);
    setAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioError(null);
    setBgImgLoadError(false);
    setPreviewImgError(false);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }

    const narrationCfg = (scene.animationData as any)?.narrationConfig;
    if (narrationCfg?.provider) {
      setSelectedProvider(narrationCfg.provider);
    }
    if (narrationCfg?.voice) {
      setSelectedVoice(narrationCfg.voice);
    }
    if (narrationCfg?.lang) {
      setSelectedLanguage(narrationCfg.lang);
    }
    if (narrationCfg?.emotion) {
      setVoiceEmotion(narrationCfg.emotion);
    }
    if (typeof narrationCfg?.emotionIntensity === 'number') {
      setVoiceEmotionIntensity(narrationCfg.emotionIntensity);
    }
    if (typeof narrationCfg?.speed === 'number') {
      setVoiceSpeed(narrationCfg.speed);
    }
  }, [
    scene.sceneId,
    scene.title,
    scene.narration,
    scene.visualPrompt,
    scene.cameraDirection,
    scene.audioUrl,
    (scene.animationData as any)?.narrationConfig,
    (scene.animationData as any)?.cameraMovement,
    (scene.animationData as any)?.cameraRotation,
    (scene.animationData as any)?.cameraRotationDegrees,
    (scene.animationData as any)?.background?.aspectRatio,
    (scene.animationData as any)?.background?.removed,
    (scene.animationData as any)?.background?.imageUrl,
    scene.imageUrl,
  ]);

  // Load Story Visual Bible
  useEffect(() => {
    if (storyId) {
      setIsLoadingVisualBible(true);
      getStoryVisualBible(storyId)
        .then((bible) => {
          setVisualBible(bible);
          const bibleStyle = bible?.artDirection?.style || bible?.artDirection?.primaryStyle;
          if (bibleStyle) {
            setLocalVisualStyle(bibleStyle);
          }
        })
        .catch((err) => console.warn('Could not load Visual Bible:', err))
        .finally(() => setIsLoadingVisualBible(false));
    }
  }, [storyId]);

  // Load Scene Prompt History
  useEffect(() => {
    if (scene.sceneId) {
      getScenePromptHistory(scene.sceneId)
        .then((hist) => setPromptHistory(hist))
        .catch((err) => console.warn('Could not load prompt history:', err));
    }
  }, [scene.sceneId]);

  // Kokoro TTS Studio state
  const [ttsVoices, setTtsVoices] = useState<SupportedVoice[]>([]);
  const [isKokoroAvailable, setIsKokoroAvailable] = useState<boolean>(true);
  const [fishAudioVoices, setFishAudioVoices] = useState<SupportedVoice[]>([]);
  const [isFishAudioAvailable, setIsFishAudioAvailable] = useState<boolean>(false);
  const [selectedProvider, setSelectedProvider] = useState<'kokoro' | 'fish_audio' | 'google'>('kokoro');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('hi');
  const [selectedVoice, setSelectedVoice] = useState<string>('hf_alpha');
  const [voiceEmotion, setVoiceEmotion] = useState<SpeakingEmotion>('neutral');
  const [voiceEmotionIntensity, setVoiceEmotionIntensity] = useState<number>(0);
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0);
  const [voiceEffect, setVoiceEffect] = useState<'normal' | 'robot' | 'cartoon' | 'whisper' | 'shout'>('normal');
  const [narratorGenderFilter, setNarratorGenderFilter] = useState<'all' | 'female' | 'male'>('all');

  // Preview state
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<boolean>(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Filtered narrator voices catalog
  const narratorVoicesList = React.useMemo(() => {
    let list: any[] = [];
    if (selectedProvider === 'fish_audio') {
      const presets = FISH_VOICES_CATALOG.map((f) => ({
        id: f.id,
        name: f.name,
        gender: f.gender,
        lang: f.lang,
        desc: f.desc,
      }));
      if (fishAudioVoices && fishAudioVoices.length > 0) {
        const customModels = fishAudioVoices.filter(
          (v) => !v.id.startsWith('fish_') && v.id !== 'fish_default'
        );
        list = [...presets, ...customModels];
      } else {
        list = presets;
      }
    } else {
      list = ttsVoices.filter((v: any) => {
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
      });
    }

    if (narratorGenderFilter !== 'all') {
      list = list.filter((v: any) => {
        const g = (v.gender || '').toLowerCase();
        if (narratorGenderFilter === 'female') return g.includes('female');
        if (narratorGenderFilter === 'male') return g.includes('male') && !g.includes('female');
        return true;
      });
    }

    return list;
  }, [selectedProvider, fishAudioVoices, ttsVoices, selectedLanguage, narratorGenderFilter]);

  // Keep selected voice valid when provider or filter shifts
  useEffect(() => {
    if (narratorVoicesList.length > 0 && !narratorVoicesList.some((v) => v.id === selectedVoice)) {
      setSelectedVoice(narratorVoicesList[0].id);
    }
  }, [narratorVoicesList, selectedVoice]);

  // Fetch TTS voices on mount
  useEffect(() => {
    getTTSVoices()
      .then((data) => {
        setTtsVoices(data.voices);
        setIsKokoroAvailable(data.isKokoroAvailable);
        if (data.fishAudioVoices) setFishAudioVoices(data.fishAudioVoices);
        setIsFishAudioAvailable(Boolean(data.isFishAudioAvailable));
        setSelectedProvider(data.isKokoroAvailable ? 'kokoro' : (data.isFishAudioAvailable ? 'fish_audio' : 'google'));
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
    const updatedAnim = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      narrationConfig: {
        provider: selectedProvider,
        voice: selectedVoice,
        lang: selectedLanguage,
        speed: voiceSpeed,
        emotion: voiceEmotion,
        emotionIntensity: voiceEmotionIntensity,
      },
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, updatedAnim as any);
    }
    onUpdateScene(scene.sceneId, { animationData: updatedAnim as any });
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
      if (localPrompt.trim().length > 0) {
        saveScenePrompt(scene.sceneId, {
          prompt: localPrompt,
          cameraPerspective: localCamera,
          aspectRatio: localAspectRatio,
        })
          .then((res) => {
            if (res.history) setPromptHistory(res.history);
          })
          .catch(() => {});
      }
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

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setBgError('Please select a valid PNG, JPEG, or WebP image file.');
      return;
    }

    const MAX_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setBgError('Image file exceeds the 15MB limit.');
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

  // -------------------------------------------------------------------------
  // Google Flow Manual Workflow Handlers (Workflow A - Zero API Cost)
  // -------------------------------------------------------------------------
  const handleGenerateV2Prompt = async () => {
    setIsGeneratingV2Prompt(true);
    setBgError(null);
    try {
      const res = await generateSceneBackgroundPrompt(scene.sceneId, {
        aspectRatio: localAspectRatio,
        cameraDirection: localCamera,
        visualStyle: localVisualStyle,
      });

      if (res.success && res.prompt) {
        setLocalPrompt(res.prompt);
        if (res.validation) {
          setPromptValidationInfo(res.validation);
        }
        if (res.history) {
          setPromptHistory(res.history);
        }
        onUpdateScene(scene.sceneId, {
          visualPrompt: res.prompt,
          cameraDirection: localCamera,
        });
      }
    } catch (err: any) {
      console.error('Failed to generate V2 scene prompt:', err);
      setBgError(err.message || 'Failed to generate V2 scene prompt');
    } finally {
      setIsGeneratingV2Prompt(false);
    }
  };

  const handleCopyV2Prompt = async () => {
    if (!localPrompt) return;
    try {
      await navigator.clipboard.writeText(localPrompt);
      setCopiedPromptToast(true);
      setTimeout(() => setCopiedPromptToast(false), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const handleOpenGoogleFlow = () => {
    window.open('https://labs.google/fx/tools/flow', '_blank', 'noopener,noreferrer');
  };

  const handleUploadFlowBackgroundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setBgError('Please select a valid PNG, JPEG, or WebP image file.');
      return;
    }

    const MAX_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setBgError('Image file exceeds the 15MB limit.');
      return;
    }

    setBgError(null);
    setIsUploadingFlowBg(true);
    try {
      const res = await uploadSceneBackground(
        scene.sceneId,
        file,
        currentBgFit,
        'google_flow_manual',
        localPrompt
      );
      if (res.scene) {
        onUpdateScene(scene.sceneId, res.scene);
      }
    } catch (err: any) {
      console.error('Flow background upload failed:', err);
      setBgError(err.message || 'Failed to upload Google Flow background image');
    } finally {
      setIsUploadingFlowBg(false);
      if (flowFileInputRef.current) flowFileInputRef.current.value = '';
    }
  };

  const handleRestorePrompt = async (versionId: string) => {
    try {
      const res = await restoreScenePrompt(scene.sceneId, versionId);
      if (res.success && res.prompt) {
        setLocalPrompt(res.prompt);
        if (res.history) {
          setPromptHistory(res.history);
        }
        onUpdateScene(scene.sceneId, {
          visualPrompt: res.prompt,
        });
      }
    } catch (err: any) {
      console.error('Failed to restore prompt version:', err);
      setBgError(err.message || 'Failed to restore prompt version');
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
    setBgPickerTab('story');
    setShowBgPicker(true);
    if (storyId) {
      setIsLoadingStoryBackgrounds(true);
      fetchStoryBackgrounds(storyId)
        .then((bgs) => setStoryBackgrounds(bgs))
        .catch((err) => console.warn('Failed to load story backgrounds:', err))
        .finally(() => setIsLoadingStoryBackgrounds(false));
    }
  };

  const handleOpenStudioBackgroundsModal = () => {
    setBgPickerTab('studio');
    setShowBgPicker(true);
    setIsLoadingStudioBackgrounds(true);
    getAllBackgroundAssets()
      .then((assets) => setStudioBackgrounds(assets))
      .catch((err) => console.warn('Failed to load studio backgrounds:', err))
      .finally(() => setIsLoadingStudioBackgrounds(false));
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

  const handleSelectStudioBackground = (bg: BackgroundAsset) => {
    setShowBgPicker(false);
    setBgError(null);
    if (onSetBackground) {
      onSetBackground(scene.sceneId, bg.imageUrl, currentBgFit);
    } else {
      setSceneBackground(scene.sceneId, bg.imageUrl, currentBgFit)
        .then((res) => {
          if (res.scene) onUpdateScene(scene.sceneId, res.scene);
        })
        .catch((err) => setBgError(err.message || 'Failed to set background'));
    }
  };

  const handleRemoveBackground = async () => {
    setShowRemoveBgConfirm(false);
    setBgError(null);
    if (onRemoveBackground) {
      await onRemoveBackground(scene.sceneId);
    } else {
      removeSceneBackground(scene.sceneId)
        .then((res) => {
          if (res.scene) onUpdateScene(scene.sceneId, res.scene);
        })
        .catch((err) => setBgError(err.message || 'Failed to remove background'));
    }
  };

  const handleShotTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const anim = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      shotType: val,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, anim as any);
    }
    onUpdateScene(scene.sceneId, { animationData: anim as any });
  };

  const handleTransitionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const anim = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      transition: {
        type: val,
        durationMs: val === 'fade' ? 600 : 0,
      },
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, anim as any);
    }
    onUpdateScene(scene.sceneId, { animationData: anim as any });
  };

  const handleCameraRotationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLocalCameraRotation(val);
    const anim = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      cameraRotation: val,
      cameraRotationDegrees: localCameraRotationDegrees,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, anim as any);
    } else {
      onUpdateScene(scene.sceneId, { animationData: anim as any });
    }
  };

  const handleCameraRotationDegreesChange = (val: number) => {
    const clamped = Math.max(0, Math.min(45, Math.round(val)));
    setLocalCameraRotationDegrees(clamped);
    const anim = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      cameraRotation: localCameraRotation,
      cameraRotationDegrees: clamped,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, anim as any);
    } else {
      onUpdateScene(scene.sceneId, { animationData: anim as any });
    }
  };

  const handleCameraMovementChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLocalCameraMovement(val);
    const anim = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      cameraMovement: val,
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, anim as any);
    } else {
      onUpdateScene(scene.sceneId, { animationData: anim as any });
    }
  };

  const handleAspectRatioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLocalAspectRatio(val);
    const currentBg = scene.animationData?.background;
    const anim = {
      ...(scene.animationData || {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
      }),
      background: {
        ...(currentBg || { imageUrl: scene.imageUrl || '', fit: 'cover' }),
        aspectRatio: val,
      },
    };
    if (onUpdateAnimationData) {
      onUpdateAnimationData(scene.sceneId, anim as any);
    } else {
      onUpdateScene(scene.sceneId, { animationData: anim as any });
    }
  };

  const handleVisualStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalVisualStyle(e.target.value);
  };

  const handleGenerateBackground = async () => {
    setIsGeneratingBg(true);
    setBgError(null);
    try {
      const opts: any = {
        cameraDirection: localCamera,
        cameraMovement: localCameraMovement,
        aspectRatio: localAspectRatio,
        visualStyle: localVisualStyle,
        fit: currentBgFit,
        previewOnly: true,
      };
      if (onGenerateImage) {
        const res = await onGenerateImage(scene.sceneId, localPrompt, opts);
        if (res && (res.url || res.imageUrl)) {
          setGeneratedPreview({
            url: res.url || res.imageUrl,
            prompt: res.prompt || localPrompt,
            imageId: res.imageId || res.image?.id,
          });
        }
      } else {
        const res = await generateSceneImage(
          scene.sceneId,
          storyId || '',
          [],
          localPrompt,
          opts
        );
        if (res && (res.url || (res as any).imageUrl)) {
          setGeneratedPreview({
            url: res.url || (res as any).imageUrl,
            prompt: res.prompt || localPrompt,
            imageId: res.imageId || (res as any).image?.id,
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to generate background:', err);
      setBgError(err.message || 'Failed to generate background');
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const handleApplyGeneratedBackground = async () => {
    if (!generatedPreview) return;
    setBgError(null);
    try {
      const meta = {
        source: 'ai_generated' as const,
        prompt: generatedPreview.prompt,
        cameraDirection: localCamera,
        aspectRatio: localAspectRatio,
      };
      if (onSetBackground) {
        await onSetBackground(scene.sceneId, generatedPreview.url, currentBgFit);
        const updatedAnim = {
          ...(scene.animationData || {
            version: 1,
            viewport: { width: 1280, height: 720 },
            characterInstances: [],
            animationClips: [],
          }),
          background: {
            imageUrl: generatedPreview.url,
            fit: currentBgFit,
            ...meta,
          },
          ...(localCameraMovement ? { cameraMovement: localCameraMovement } : {}),
        };
        onUpdateScene(scene.sceneId, {
          imageUrl: generatedPreview.url,
          cameraDirection: localCamera,
          animationData: updatedAnim as any,
        });
      } else {
        const res = await setSceneBackground(scene.sceneId, generatedPreview.url, currentBgFit, meta);
        if (res.scene) {
          onUpdateScene(scene.sceneId, res.scene);
        }
      }
      setGeneratedPreview(null);
    } catch (err: any) {
      console.error('Failed to apply generated background:', err);
      setBgError(err.message || 'Failed to apply generated background');
    }
  };

  const handleCancelGeneratedBackground = () => {
    setGeneratedPreview(null);
  };

  const canSplitAtPlayhead =
    playheadMs > scene.startMs + 500 && playheadMs < scene.endMs - 500;

  const [internalSection, setInternalSection] = useState<InspectorSection>(
    normalizeInspectorSection(activeInspectorTabProp)
  );
  const activeSection = normalizeInspectorSection(activeInspectorTabProp) || internalSection;

  // Collapsible inspector section states (smart defaults to minimize scrolling)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    // Background tab
    'bg-plate': true,
    'bg-bible': false,
    'bg-flow': true,
    'bg-inapp': false,
    // Overview tab
    'ov-details': true,
    'ov-media': true,
    // Timing tab
    'tm-duration': true,
    'tm-ripple': true,
    // Narration tab
    'nr-text': true,
    'nr-studio': true,
    'nr-player': true,
    // Characters tab
    'ch-list': true,
    'ch-add': true,
    'ch-story': false,
    // Operations tab
    'op-timeline': true,
    'op-history': true,
  });

  const isSectionOpen = (key: string, defaultVal = true) => {
    return collapsedSections[key] !== undefined ? collapsedSections[key] : defaultVal;
  };

  const toggleSection = (key: string, defaultVal = true) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [key]: !(prev[key] !== undefined ? prev[key] : defaultVal),
    }));
  };

  const sectionKeysForTab: Record<InspectorSection, string[]> = {
    overview: ['ov-details', 'ov-media'],
    timing: ['tm-duration', 'tm-ripple'],
    narration: ['nr-text', 'nr-studio', 'nr-player'],
    background: ['bg-plate', 'bg-bible', 'bg-flow', 'bg-inapp'],
    shots: ['sh-planning'],
    characters: ['ch-list', 'ch-add', 'ch-story'],
    dialogue: [],
    overlays: [],
    operations: ['op-timeline', 'op-history'],
  };

  const activeTabSectionKeys = sectionKeysForTab[activeSection] || [];
  const areAllSectionsOpenInTab =
    activeTabSectionKeys.length > 0 && activeTabSectionKeys.every((k) => isSectionOpen(k));

  const handleToggleAllSectionsInTab = () => {
    if (activeTabSectionKeys.length === 0) return;
    const nextState = !areAllSectionsOpenInTab;
    setCollapsedSections((prev) => {
      const updated = { ...prev };
      activeTabSectionKeys.forEach((k) => {
        updated[k] = nextState;
      });
      return updated;
    });
  };

  const handleSectionChange = (sec: InspectorSection) => {
    setInternalSection(sec);
    if (onTabChange) onTabChange(sec);
  };

  useEffect(() => {
    if (activeInspectorTabProp) {
      setInternalSection(normalizeInspectorSection(activeInspectorTabProp));
    }
  }, [activeInspectorTabProp]);

  useEffect(() => {
    if (selectedInstanceId) {
      handleSectionChange('characters');
    }
  }, [selectedInstanceId]);

  useEffect(() => {
    if (selectedDialogueId) {
      handleSectionChange('dialogue');
    }
  }, [selectedDialogueId]);

  useEffect(() => {
    if (selectedOverlayId) {
      handleSectionChange('overlays');
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
      durationMs: Math.min(5000, durationMs),
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
    if (onDuplicateOverlay) {
      onDuplicateOverlay(scene.sceneId, overlayId);
      return;
    }
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
      <div className="ed-inspector-header">
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {activeSection === 'overview' && 'Scene Overview'}
            {activeSection === 'shots' && 'Cinematic Shot Director'}
            {activeSection === 'timing' && 'Timing & Duration'}
            {activeSection === 'narration' && 'Narration Voice Studio'}
            {activeSection === 'background' && 'Stage Background'}
            {activeSection === 'characters' && (selectedCharacterInstance ? '2D Rig Editor' : 'Characters & 2D Rig')}
            {activeSection === 'dialogue' && 'Dialogue Voice & Lip-Sync'}
            {activeSection === 'overlays' && 'Educational Overlays'}
            {activeSection === 'operations' && 'Scene Operations'}
          </h3>
          <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>
            Scene {scene.number} &bull; <span style={{ color: scene.generationStatus === 'completed' ? '#34d399' : 'inherit' }}>{scene.generationStatus || 'draft'}</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {activeTabSectionKeys.length > 0 && (
            <button
              type="button"
              className="ed-collapse-all-btn"
              onClick={handleToggleAllSectionsInTab}
              title="Toggle expand or collapse all cards in this tab"
            >
              {areAllSectionsOpenInTab ? (
                <>
                  <ChevronUpIcon size={12} />
                  <span>Collapse All</span>
                </>
              ) : (
                <>
                  <ChevronDownIcon size={12} />
                  <span>Expand All</span>
                </>
              )}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="ed-icon-btn"
              onClick={onClose}
              title="Collapse inspector"
              style={{ width: '26px', height: '26px', fontSize: '11px', display: 'grid', placeItems: 'center' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="ed-inspector-content">
          {activeSection === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <CollapsibleSection
                id="ov-details"
                title="Scene Details & Visual Prompt"
                icon={<SparklesIcon size={14} color="#8b5cf6" />}
                isOpen={isSectionOpen('ov-details', true)}
                onToggle={() => toggleSection('ov-details', true)}
                variant="card"
              >
                <div className="ed-field-group">
                  <label className="ed-field-label">Scene Title</label>
                  <input
                    className="ed-input"
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                </div>

                <div className="ed-field-group">
                  <label className="ed-field-label">Visual Scene Prompt</label>
                  <textarea
                    className="ed-textarea"
                    value={localPrompt}
                    onChange={(e) => setLocalPrompt(e.target.value)}
                    onBlur={handlePromptBlur}
                    placeholder="Describe the visual composition, characters, action..."
                    rows={4}
                  />
                </div>

                <div className="ed-field-group">
                  <label className="ed-field-label">Camera Direction</label>
                  <select className="ed-select" value={localCamera} onChange={handleCameraChange}>
                    <option value="Eye-level wide shot">Eye-level wide shot</option>
                    <option value="Medium shot">Medium shot</option>
                    <option value="Close-up">Close-up</option>
                    <option value="High angle / Bird's eye view">High angle / Bird's eye view</option>
                    <option value="Bird's-eye view">Bird's-eye view</option>
                    <option value="Low-angle shot">Low-angle shot</option>
                    <option value="Over-the-shoulder shot">Over-the-shoulder shot</option>
                    <option value="Wide establishing shot">Wide establishing shot</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="ed-field-group">
                    <label className="ed-field-label">Shot Type (Cinematic Framing)</label>
                    <select
                      className="ed-select"
                      value={(scene.animationData as any)?.shotType || 'wide_establishing'}
                      onChange={handleShotTypeChange}
                    >
                      <option value="wide_establishing">Wide Establishing Shot</option>
                      <option value="medium_twoshot">Medium Two-Shot</option>
                      <option value="closeup_speaker">Close-Up (Speaker Focus)</option>
                      <option value="character_focus">Character Focus</option>
                    </select>
                  </div>

                  <div className="ed-field-group">
                    <label className="ed-field-label">Scene Transition</label>
                    <select
                      className="ed-select"
                      value={(scene.animationData as any)?.transition?.type || 'fade'}
                      onChange={handleTransitionChange}
                    >
                      <option value="fade">Smooth Crossfade (600ms)</option>
                      <option value="cut">Direct Cinematic Cut</option>
                    </select>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Media Generation Workflows */}
              {(() => {
                const hasVisual = Boolean(scene.imageUrl || scene.image?.imageUrl);
                const hasVideo = Boolean(scene.videoUrl);

                return (
                  <CollapsibleSection
                    id="ov-media"
                    title="Scene Media & Motion Workflows"
                    icon={<FilmIcon size={14} color="#34d399" />}
                    badge={
                      hasVideo ? (
                        <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <FilmIcon size={11} /> Video Ready
                        </span>
                      ) : hasVisual ? (
                        <span style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 600 }}>Image Ready</span>
                      ) : undefined
                    }
                    isOpen={isSectionOpen('ov-media', true)}
                    onToggle={() => toggleSection('ov-media', true)}
                    variant="card"
                  >
                    <div>
                      <button
                        className="ed-btn-action primary"
                        style={{ width: '100%' }}
                        onClick={() => {
                          handleTitleBlur();
                          handlePromptBlur();
                          onGenerateImage(scene.sceneId, localPrompt, {
                            cameraDirection: localCamera,
                            cameraMovement: localCameraMovement,
                            aspectRatio: localAspectRatio,
                            visualStyle: localVisualStyle,
                          });
                        }}
                        disabled={isGeneratingImage}
                      >
                        {isGeneratingImage ? 'Generating Image...' : hasVisual ? 'Regenerate Scene Image' : 'Generate Scene Image'}
                      </button>
                    </div>

                    <div style={{ background: 'var(--ed-surface-elevated)', padding: '10px', borderRadius: '6px', border: '1px solid var(--ed-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                  </CollapsibleSection>
                );
              })()}
            </div>
          )}

          {activeSection === 'timing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <CollapsibleSection
                id="tm-duration"
                title="Timecode & Duration"
                icon={<ScissorsIcon size={14} color="#c4b5fd" />}
                badge={<span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#c4b5fd' }}>{formatDurationHuman(durationMs)}</span>}
                isOpen={isSectionOpen('tm-duration', true)}
                onToggle={() => toggleSection('tm-duration', true)}
                variant="card"
              >
                <div className="ed-field-group">
                  <div className="ed-field-label">
                    <span>Start / End Timecode</span>
                    <span style={{ fontFamily: 'monospace' }}>{formatDurationHuman(durationMs)}</span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      background: 'var(--ed-surface-elevated)',
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
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                id="tm-ripple"
                title="Ripple Edit & Synchronization"
                badge={<span style={{ fontSize: '10px', color: isRippleOn ? '#c4b5fd' : '#94a3b8', fontWeight: 600 }}>{isRippleOn ? 'Ripple ON' : 'Ripple OFF'}</span>}
                isOpen={isSectionOpen('tm-ripple', true)}
                onToggle={() => toggleSection('tm-ripple', true)}
                variant="card"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ed-text-muted)' }}>
                  <span>Ripple Edit Mode: <strong style={{ color: isRippleOn ? '#c4b5fd' : '#94a3b8' }}>{isRippleOn ? 'ON' : 'OFF'}</strong></span>
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
              </CollapsibleSection>
            </div>
          )}

          {activeSection === 'narration' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <CollapsibleSection
                id="nr-text"
                title="Spoken Narration"
                icon={<BookOpenIcon size={14} color="#c4b5fd" />}
                badge={
                  scene.actualAudioDurationMs ? (
                    <span className="ed-audio-badge-verified" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <CheckIcon size={10} /> {(scene.actualAudioDurationMs / 1000).toFixed(1)}s Verified
                    </span>
                  ) : (
                    <span className="ed-audio-badge-estimated">
                      ~{formatDurationHuman(estimatedSpeechMs)} Est.
                    </span>
                  )
                }
                isOpen={isSectionOpen('nr-text', true)}
                onToggle={() => toggleSection('nr-text', true)}
                variant="card"
              >
                <textarea
                  className="ed-textarea"
                  value={localNarration}
                  onChange={(e) => setLocalNarration(e.target.value)}
                  onBlur={handleNarrationBlur}
                  placeholder="Type spoken narration for this scene..."
                />

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
              </CollapsibleSection>

              {/* Kokoro-82M / Fish Audio Voice Studio Controls */}
              <CollapsibleSection
                id="nr-studio"
                title="Scene Narrator Voice Studio"
                icon={<VolumeHighIcon size={14} color="#c4b5fd" />}
                badge={
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
                    {selectedProvider === 'kokoro' ? '● Kokoro-82M (Local)' : selectedProvider === 'fish_audio' ? '● Fish Audio (s2.1-pro-free)' : '● Google TTS (Cloud)'}
                  </span>
                }
                isOpen={isSectionOpen('nr-studio', true)}
                onToggle={() => toggleSection('nr-studio', true)}
                variant="card"
              >
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
                  onChange={(e) => {
                    const p = e.target.value as any;
                    setSelectedProvider(p);
                    if (p === 'fish_audio') {
                      setSelectedVoice('fish_default');
                    } else if (p === 'kokoro') {
                      setSelectedVoice(selectedLanguage === 'hi' ? 'hf_alpha' : 'af_heart');
                    } else {
                      setSelectedVoice(selectedLanguage === 'hi' ? 'hi-IN-Standard' : 'en-US-Standard');
                    }
                  }}
                >
                  <option value="kokoro">Kokoro-82M (Neural Local)</option>
                  <option value="fish_audio">Fish Audio (Cloud - Free s2.1-pro-free)</option>
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
                    if (l === 'hi') setSelectedVoice(selectedProvider === 'fish_audio' ? 'fish_default' : 'hf_alpha');
                    else if (l === 'en-gb') setSelectedVoice(selectedProvider === 'fish_audio' ? 'fish_default' : 'bf_emma');
                    else setSelectedVoice(selectedProvider === 'fish_audio' ? 'fish_default' : 'af_heart');
                  }}
                >
                  <option value="hi">🇮🇳 Hindi (हिन्दी) [Default]</option>
                  <option value="en-us">🇺🇸 English (US)</option>
                  <option value="en-gb">🇬🇧 English (UK)</option>
                </select>
              </div>
            </div>

            {selectedProvider === 'fish_audio' && (
              <div
                style={{
                  fontSize: '10px',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  color: '#93c5fd',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🎯 Model: <strong>s2.1-pro-free</strong> (Free Developer Tier)</span>
                  <span style={{ color: isFishAudioAvailable ? '#34d399' : '#f87171', fontWeight: 600 }}>
                    {isFishAudioAvailable ? '● Key Configured' : '○ Missing API Key'}
                  </span>
                </div>
                {!isFishAudioAvailable && (
                  <span style={{ fontSize: '9px', color: '#fca5a5' }}>
                    Set FISH_API_KEY in backend/.env to synthesize audio with Fish Audio.
                  </span>
                )}
              </div>
            )}

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

              {/* Gender Filter Pills */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                {(['all', 'female', 'male'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`ed-tool-btn ${narratorGenderFilter === g ? 'primary' : ''}`}
                    style={{
                      fontSize: '10px',
                      padding: '2px 8px',
                      flex: 1,
                      justifyContent: 'center',
                      background: narratorGenderFilter === g ? (selectedProvider === 'fish_audio' ? '#2563eb' : '#059669') : undefined,
                    }}
                    onClick={() => setNarratorGenderFilter(g)}
                  >
                    {g === 'all' ? 'All Voices' : g === 'female' ? '👩 Female' : '👨 Male'}
                  </button>
                ))}
              </div>

              <select
                className="ed-input"
                style={{ fontSize: '11px', padding: '4px 6px', height: '30px' }}
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
              >
                {narratorVoicesList.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender || 'voice'}{v.desc ? ` • ${v.desc}` : ''})
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
                  setVoiceEmotionIntensity(em === 'neutral' ? 0 : 15);
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
                      : voiceEmotionIntensity <= 20
                      ? '15% Subtle'
                      : voiceEmotionIntensity <= 40
                      ? '30% Moderate'
                      : voiceEmotionIntensity <= 65
                      ? '50% Strong'
                      : voiceEmotionIntensity <= 85
                      ? '75% Elevated'
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
                  { val: 15, label: '15% Subtle' },
                  { val: 30, label: '30% Mod' },
                  { val: 50, label: '50% Strong' },
                  { val: 75, label: '75% Elevated' },
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
        </CollapsibleSection>

          {/* Dedicated Audio Player Widget */}
          {scene.audioUrl && (
            <CollapsibleSection
              id="nr-player"
              title="Audio Playback & Transport"
              icon={<PlayIcon size={14} color="#34d399" />}
              badge={
                <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 600 }}>
                  {(scene.actualAudioDurationMs ? scene.actualAudioDurationMs / 1000 : audioDuration).toFixed(1)}s Verified
                </span>
              }
              isOpen={isSectionOpen('nr-player', true)}
              onToggle={() => toggleSection('nr-player', true)}
              variant="card"
            >
              <div className="ed-audio-player-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
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
            </CollapsibleSection>
          )}
        </div>
      )}

          {activeSection === 'background' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="file"
                ref={bgFileInputRef}
                style={{ display: 'none' }}
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUploadBackgroundFile}
              />
              <input
                type="file"
                ref={flowFileInputRef}
                style={{ display: 'none' }}
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUploadFlowBackgroundFile}
              />

              {/* 1. Stage Background */}
              <CollapsibleSection
                id="bg-plate"
                title="Stage Background"
                icon={<ImageIcon size={14} color="#8b5cf6" />}
                badge={
                  currentBgUrl ? (
                    <span className="ed-bg-badge-fit">
                      {currentBgFit.toUpperCase()} &bull; {(scene.animationData as any)?.background?.aspectRatio || '16:9'}
                    </span>
                  ) : (
                    <span className="ed-bg-badge-default">Default Stage</span>
                  )
                }
                isOpen={isSectionOpen('bg-plate', true)}
                onToggle={() => toggleSection('bg-plate', true)}
                variant="card"
              >
                {bgError && (
                  <div style={{ fontSize: '11px', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '6px 8px', borderRadius: '4px', marginBottom: '8px' }}>
                    {bgError}
                  </div>
                )}

                {/* Active Background Plate */}
                {currentBgUrl ? (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text)' }}>Active Background</span>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: ((scene.animationData as any)?.background?.source === 'google_flow_manual')
                              ? 'rgba(16, 185, 129, 0.15)'
                              : ((scene.animationData as any)?.background?.source === 'imported')
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(59, 130, 246, 0.15)',
                            color: ((scene.animationData as any)?.background?.source === 'google_flow_manual')
                              ? '#059669'
                              : ((scene.animationData as any)?.background?.source === 'imported')
                              ? '#d97706'
                              : '#2563eb',
                            border: ((scene.animationData as any)?.background?.source === 'google_flow_manual')
                              ? '1px solid rgba(16, 185, 129, 0.3)'
                              : ((scene.animationData as any)?.background?.source === 'imported')
                              ? '1px solid rgba(245, 158, 11, 0.3)'
                              : '1px solid rgba(59, 130, 246, 0.3)',
                          }}
                        >
                          {(scene.animationData as any)?.background?.source === 'google_flow_manual'
                            ? 'Google Flow'
                            : (scene.animationData as any)?.background?.source === 'imported'
                            ? 'Imported'
                            : 'AI Generated'}
                        </span>
                        <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                          {(scene.animationData as any)?.background?.aspectRatio || '16:9'}
                        </span>
                      </div>
                    </div>
                    <div className="ed-bg-preview-box">
                      <img
                        src={resolveAssetUrl(currentBgUrl)}
                        onError={() => setBgImgLoadError(true)}
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
                        title="Upload a new background image from your computer (PNG/JPEG/WebP)"
                      >
                        <UploadIcon size={12} />
                        <span>{isUploadingBg ? 'Uploading...' : 'Replace'}</span>
                      </button>
                      <button
                        type="button"
                        className="ed-btn-action studio"
                        onClick={handleOpenStudioBackgroundsModal}
                        title="Choose from reusable environments generated in Background Studio"
                      >
                        <SparklesIcon size={12} />
                        <span>From Studio</span>
                      </button>
                      <button
                        type="button"
                        className="ed-btn-action secondary"
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
                  <div style={{ marginBottom: '4px' }}>
                    <div className="ed-bg-empty-card">
                      <div className="ed-bg-empty-icon">
                        <ImageIcon size={24} />
                      </div>
                      <p className="ed-bg-empty-title">
                        No custom background
                      </p>
                      <p className="ed-bg-empty-desc">
                        Using default vector stage backdrop
                      </p>
                    </div>

                    <div className="ed-bg-actions-grid">
                      <button
                        type="button"
                        className="ed-btn-action primary ed-btn-full"
                        disabled={isUploadingBg}
                        onClick={() => bgFileInputRef.current?.click()}
                        title="Upload a new background image from your computer (PNG/JPEG/WebP)"
                      >
                        <UploadIcon size={13} />
                        <span>{isUploadingBg ? 'Uploading...' : 'Import Image (PNG/JPEG/WebP)'}</span>
                      </button>
                      <button
                        type="button"
                        className="ed-btn-action studio"
                        onClick={handleOpenStudioBackgroundsModal}
                        title="Choose from reusable environments generated in Background Studio"
                      >
                        <SparklesIcon size={13} />
                        <span>From Studio</span>
                      </button>
                      <button
                        type="button"
                        className="ed-btn-action secondary"
                        onClick={handleOpenStoryBackgroundsModal}
                        title="Choose from images already used in this story"
                      >
                        <ImageIcon size={13} />
                        <span>From Story</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Generated Preview (Review Before Apply) */}
                {generatedPreview && (
                  <div
                    style={{
                      border: '1px solid #7c3aed',
                      borderRadius: '8px',
                      padding: '10px',
                      background: 'rgba(124, 58, 237, 0.06)',
                      marginBottom: '8px',
                      marginTop: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <SparklesIcon size={12} /> Generated Preview (Review Before Apply)
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>Unsaved</span>
                    </div>
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: '6px', overflow: 'hidden', background: '#000', marginBottom: '8px' }}>
                      {!previewImgError ? (
                        <img
                          src={resolveAssetUrl(generatedPreview.url)}
                          alt="AI Generated Background Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={() => setPreviewImgError(true)}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontSize: '11px', padding: '8px', textAlign: 'center' }}>
                          Preview image failed to load.
                        </div>
                      )}
                    </div>
                    {generatedPreview.prompt && (
                      <div style={{ fontSize: '10px', color: '#64748b', background: 'rgba(0,0,0,0.03)', padding: '6px 8px', borderRadius: '4px', marginBottom: '8px', maxHeight: '50px', overflowY: 'auto' }}>
                        <strong style={{ color: '#475569' }}>Prompt:</strong> {generatedPreview.prompt}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        type="button"
                        className="ed-btn-action primary"
                        style={{ fontSize: '11px', padding: '6px 8px', background: '#059669', borderColor: '#059669' }}
                        onClick={handleApplyGeneratedBackground}
                      >
                        Apply to Scene
                      </button>
                      <button
                        type="button"
                        className="ed-btn-action"
                        style={{ fontSize: '11px', padding: '6px 8px' }}
                        onClick={handleCancelGeneratedBackground}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </CollapsibleSection>

              {/* 2. Story Visual Bible Context */}
              <CollapsibleSection
                id="bg-bible"
                title="Story Visual Bible Context"
                icon={<SparklesIcon size={14} color="#8b5cf6" />}
                badge={
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: 'rgba(139, 92, 246, 0.15)',
                      color: '#7c3aed',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                    }}
                  >
                    v{visualBible?.version || 1} Active
                  </span>
                }
                isOpen={isSectionOpen('bg-bible', false)}
                onToggle={() => toggleSection('bg-bible', false)}
                variant="card"
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '10px', color: '#64748b' }}>
                  <span style={{ background: 'var(--ed-surface, #fff)', border: '1px solid var(--ed-border)', padding: '2px 6px', borderRadius: '4px' }}>
                    <strong style={{ color: '#475569' }}>Style:</strong> {visualBible?.artDirection?.style || visualBible?.artDirection?.primaryStyle || localVisualStyle}
                  </span>
                  <span style={{ background: 'var(--ed-surface, #fff)', border: '1px solid var(--ed-border)', padding: '2px 6px', borderRadius: '4px' }}>
                    <strong style={{ color: '#475569' }}>Setting:</strong> {visualBible?.worldIdentity?.settingType || (visualBible?.worldIdentity?.worldDescription ? visualBible.worldIdentity.worldDescription.slice(0, 35) + '...' : 'Story World')}
                  </span>
                  <span style={{ background: 'var(--ed-surface, #fff)', border: '1px solid var(--ed-border)', padding: '2px 6px', borderRadius: '4px' }}>
                    <strong style={{ color: '#475569' }}>Lighting/Mood:</strong> {visualBible?.lightingAndColor?.lightingQuality || visualBible?.lightingAndColorIdentity?.dominantMood || 'Warm & Storybook'}
                  </span>
                </div>
              </CollapsibleSection>

        {/* WORKFLOW A: Google Flow Manual Workflow (Zero API Cost) */}
        <CollapsibleSection
          id="bg-flow"
          title="Google Flow Workflow"
          subtitle="Character-Free Environment Prompts & Import"
          icon={<SparklesIcon size={14} color="#059669" />}
          badge={
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#047857',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '2px 6px',
                borderRadius: '8px',
              }}
            >
              Zero Cost &bull; Jio Google AI Pro
            </span>
          }
          isOpen={isSectionOpen('bg-flow', true)}
          onToggle={() => toggleSection('bg-flow', true)}
          variant="workflow-a"
        >
          <p style={{ fontSize: '11px', color: '#475569', margin: 0, lineHeight: 1.4 }}>
            Generate character-free environment prompts, copy to Google Flow, and import the generated background image back into this scene.
          </p>

          {/* Stepper Guide */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '4px',
              fontSize: '9px',
              fontWeight: 600,
              color: '#065f46',
              textAlign: 'center',
            }}
          >
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '4px 2px', borderRadius: '4px' }}>1. Generate Prompt</div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '4px 2px', borderRadius: '4px' }}>2. Copy Prompt</div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '4px 2px', borderRadius: '4px' }}>3. Open Flow</div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '4px 2px', borderRadius: '4px' }}>4. Import Back</div>
          </div>

          {/* Perspective & Aspect Ratio */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="ed-field-group" style={{ margin: 0 }}>
              <label className="ed-field-label" style={{ fontSize: '11px' }}>Camera Perspective (Still Image)</label>
              <select className="ed-select" value={localCamera} onChange={handleCameraChange}>
                <option value="Eye-level wide shot">Eye-level wide shot</option>
                <option value="Medium shot">Medium shot</option>
                <option value="Close-up">Close-up</option>
                <option value="High angle / Bird's eye view">High angle / Bird's eye view</option>
                <option value="Bird's-eye view">Bird's-eye view</option>
                <option value="Low-angle shot">Low-angle shot</option>
                <option value="Wide establishing shot">Wide establishing shot</option>
              </select>
            </div>

            <div className="ed-field-group" style={{ margin: 0 }}>
              <label className="ed-field-label" style={{ fontSize: '11px' }}>Aspect Ratio</label>
              <select className="ed-select" value={localAspectRatio} onChange={handleAspectRatioChange}>
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait / Reels)</option>
                <option value="1:1">1:1 (Square)</option>
                <option value="4:5">4:5 (Social)</option>
              </select>
            </div>
          </div>

          {/* V2 Scene Background Prompt Textarea */}
          <div className="ed-field-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label className="ed-field-label" style={{ margin: 0, fontWeight: 600 }}>
                Visual Scene Prompt (Environment Plate Only)
              </label>
              <span style={{ fontSize: '10px', color: '#059669', fontWeight: 600 }}>
                Characters Excluded
              </span>
            </div>
            <textarea
              className="ed-textarea"
              rows={4}
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              onBlur={handlePromptBlur}
              placeholder="Click 'Generate Scene Prompt' below to synthesize a rich, character-free environment prompt using the Story Visual Bible..."
              style={{ fontSize: '11px', lineHeight: 1.45, fontFamily: 'monospace' }}
            />
          </div>

          {/* Validation & Negative Directives Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '10px' }}>
            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#047857', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              ✓ Character-Free Plate
            </span>
            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#047857', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              ✓ Middleground Reserved for Rigs
            </span>
            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#047857', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              ✓ Aspect Ratio: {localAspectRatio}
            </span>
          </div>

          {/* Workflow A Action Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <button
              type="button"
              className="ed-btn-action primary"
              style={{ fontSize: '11px', padding: '7px 10px', background: '#059669', borderColor: '#059669' }}
              disabled={isGeneratingV2Prompt}
              onClick={handleGenerateV2Prompt}
              title="Generate a character-free prompt aligned with Story Visual Bible"
            >
              <SparklesIcon size={13} />
              <span>{isGeneratingV2Prompt ? 'Generating...' : (localPrompt ? 'Regenerate Prompt' : 'Generate Scene Prompt')}</span>
            </button>

            <button
              type="button"
              className="ed-btn-action"
              style={{
                fontSize: '11px',
                padding: '7px 10px',
                background: copiedPromptToast ? '#10b981' : undefined,
                color: copiedPromptToast ? '#fff' : undefined,
                borderColor: copiedPromptToast ? '#10b981' : undefined,
              }}
              disabled={!localPrompt}
              onClick={handleCopyV2Prompt}
              title="Copy prompt text to clipboard for Google Flow"
            >
              {copiedPromptToast ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
              <span>{copiedPromptToast ? 'Copied to Clipboard!' : 'Copy Prompt'}</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              className="ed-btn-action"
              style={{ fontSize: '11px', padding: '7px 10px' }}
              onClick={handleOpenGoogleFlow}
              title="Open Google Flow in a new tab (https://labs.google/fx/tools/flow)"
            >
              <span>Open Google Flow</span>
              <span style={{ fontSize: '10px' }}>↗</span>
            </button>

            <button
              type="button"
              className="ed-btn-action primary"
              style={{ fontSize: '11px', padding: '7px 10px', background: '#2563eb', borderColor: '#2563eb' }}
              disabled={isUploadingFlowBg}
              onClick={() => flowFileInputRef.current?.click()}
              title="Import image downloaded from Google Flow"
            >
              <UploadIcon size={13} />
              <span>{isUploadingFlowBg ? 'Importing...' : 'Import from Flow'}</span>
            </button>
          </div>

          {/* Prompt History Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
            <button
              type="button"
              className="ed-tool-btn"
              style={{ fontSize: '11px', padding: '3px 8px', color: '#64748b' }}
              onClick={() => setShowPromptHistory(!showPromptHistory)}
            >
              <span>Prompt History ({promptHistory.length})</span>
              <span style={{ fontSize: '9px', marginLeft: '4px' }}>{showPromptHistory ? '▲' : '▼'}</span>
            </button>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>Auto-saved on edit</span>
          </div>

          {/* Prompt History List */}
          {showPromptHistory && (
            <div
              style={{
                border: '1px solid var(--ed-border)',
                borderRadius: '6px',
                padding: '8px',
                background: 'var(--ed-surface, #fff)',
                maxHeight: '140px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {promptHistory.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
                  No previous prompt versions recorded yet.
                </div>
              ) : (
                promptHistory.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      borderBottom: '1px solid var(--ed-border-subtle, #f1f5f9)',
                      paddingBottom: '6px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#334155' }}>
                          v{item.version}
                        </span>
                        <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span
                          style={{
                            fontSize: '8px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            background: item.source === 'google_flow_manual' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                            color: item.source === 'google_flow_manual' ? '#059669' : '#64748b',
                          }}
                        >
                          {item.source === 'google_flow_manual' ? 'Flow' : item.source === 'user_edit' ? 'Edit' : 'Auto'}
                        </span>
                      </div>
                      <p style={{ fontSize: '10px', color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.prompt}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ed-tool-btn"
                      style={{ fontSize: '10px', padding: '2px 6px' }}
                      onClick={() => handleRestorePrompt(item.id)}
                      title="Restore this prompt version"
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Continuity Tip for Multi-Scene Storytelling */}
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              fontSize: '10px',
              color: '#92400e',
              lineHeight: 1.4,
            }}
          >
            <strong>💡 Continuity Tip for Google Flow:</strong> To keep lighting and terrain locked across scenes, upload your previous scene's generated background as an <em>Image Ingredient / Reference</em> in Google Flow alongside this prompt.
          </div>
        </CollapsibleSection>

        {/* WORKFLOW B: In-App AI Generation (Pollinations / ComfyUI) */}
        <CollapsibleSection
          id="bg-inapp"
          title="In-App AI Background Generation (Workflow B)"
          subtitle="Direct Pollinations / ComfyUI API"
          icon={<SparklesIcon size={14} color="#8b5cf6" />}
          badge={
            <span
              style={{
                fontSize: '9px',
                fontWeight: 600,
                color: '#8b5cf6',
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                padding: '2px 6px',
                borderRadius: '8px',
              }}
            >
              Direct API
            </span>
          }
          isOpen={isSectionOpen('bg-inapp', false)}
          onToggle={() => toggleSection('bg-inapp', false)}
          variant="workflow-b"
        >
          <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>
            Generate directly in the studio using connected backend image providers.
          </p>

          {/* Camera Movement (Video Motion) */}
          <div className="ed-field-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="ed-field-label" style={{ margin: 0 }}>Camera Movement (Video Motion)</label>
              <span style={{ fontSize: '9px', color: '#94a3b8' }}>FFmpeg / Video</span>
            </div>
            <select className="ed-select" value={localCameraMovement} onChange={handleCameraMovementChange}>
              <option value="Static (no movement)">Static (no movement)</option>
              <option value="Slow zoom in">Slow zoom in</option>
              <option value="Slow zoom out">Slow zoom out</option>
              <option value="Pan left">Pan left</option>
              <option value="Pan right">Pan right</option>
              <option value="Tilt up">Tilt up</option>
              <option value="Tilt down">Tilt down</option>
            </select>
          </div>

          {/* Camera Rotation (2D Scene Roll) */}
          <div className="ed-field-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="ed-field-label" style={{ margin: 0 }}>Camera Rotation (2D Roll)</label>
              <span style={{ fontSize: '9px', color: '#94a3b8' }}>Vector Stage</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginTop: '4px' }}>
              <select className="ed-select" value={localCameraRotation} onChange={handleCameraRotationChange}>
                <option value="none">None (0°)</option>
                <option value="clockwise">Rotate Clockwise</option>
                <option value="anticlockwise">Rotate Anticlockwise</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="number"
                  className="ed-input"
                  style={{ padding: '4px 6px', fontSize: '12px' }}
                  min={0}
                  max={45}
                  step={1}
                  value={localCameraRotationDegrees}
                  disabled={localCameraRotation === 'none'}
                  onChange={(e) => handleCameraRotationDegreesChange(parseFloat(e.target.value) || 0)}
                  title="Rotation roll amount in degrees (0° - 45°)"
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>deg</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="ed-btn-action primary"
            style={{ width: '100%', fontSize: '11px', padding: '7px 8px', background: '#7c3aed', borderColor: '#7c3aed' }}
            disabled={isGeneratingBg}
            onClick={handleGenerateBackground}
          >
            {isGeneratingBg ? 'Generating In-App Image...' : 'Generate Image In-App'}
          </button>
        </CollapsibleSection>
      </div>
          )}

          {activeSection === 'characters' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
              {/* Scene Characters List */}
              <CollapsibleSection
                id="ch-list"
                title={`Scene Characters (${characterInstances.length})`}
                subtitle="Positioned 2D Rigs in current scene"
                badge={
                  <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>
                    {characterInstances.length} Active
                  </span>
                }
                isOpen={isSectionOpen('ch-list', true)}
                onToggle={() => toggleSection('ch-list', true)}
                variant="card"
              >
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
              </CollapsibleSection>

              {/* Add Character Section */}
              <CollapsibleSection
                id="ch-add"
                title="Add Vector Character Rig"
                subtitle="Insert animated modular characters into canvas"
                isOpen={isSectionOpen('ch-add', true)}
                onToggle={() => toggleSection('ch-add', true)}
                variant="card"
              >
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
              </CollapsibleSection>

              {/* Story Character References */}
              {characters.length > 0 && (
                <CollapsibleSection
                  id="ch-story"
                  title="Story Characters in this Scene"
                  subtitle="Characters involved in scene narrative"
                  badge={
                    <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>
                      {(scene.characterIds?.length || 0)} Selected
                    </span>
                  }
                  isOpen={isSectionOpen('ch-story', false)}
                  onToggle={() => toggleSection('ch-story', false)}
                  variant="card"
                >
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
                </CollapsibleSection>
              )}
            </div>
              )}
            </div>
          )}

          {activeSection === 'dialogue' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
          )}

          {activeSection === 'overlays' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
          )}

          {activeSection === 'operations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Scene Operations */}
              <CollapsibleSection
                id="op-timeline"
                title="Timeline & Scene Actions"
                subtitle="Split, duplicate or delete this scene"
                isOpen={isSectionOpen('op-timeline', true)}
                onToggle={() => toggleSection('op-timeline', true)}
                variant="card"
              >
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
              </CollapsibleSection>

              {/* Version History */}
              {versions && versions.length > 0 && (
                <CollapsibleSection
                  id="op-history"
                  title="Version History"
                  subtitle="Restore previous scene edits"
                  badge={
                    <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>
                      {versions.length} Available
                    </span>
                  }
                  isOpen={isSectionOpen('op-history', true)}
                  onToggle={() => toggleSection('op-history', true)}
                  variant="card"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                    {versions.map((ver) => (
                      <div
                        key={ver.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          background: 'var(--ed-surface-elevated)',
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
                </CollapsibleSection>
              )}
            </div>
          )}

          {activeSection === 'shots' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <ShotPlanningPanel
                storyId={storyId || ''}
                activeSceneId={scene.sceneId}
                scenes={[scene]}
                flowProjectId={flowProjectId}
              />
            </div>
          )}
        </div>

      {showBgPicker && (
        <div className="ed-bg-modal-overlay" onClick={() => setShowBgPicker(false)}>
          <div className="ed-bg-modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '560px', maxWidth: '94vw' }}>
            <div className="ed-bg-modal-header">
              <div className="ed-bg-modal-tabs">
                <button
                  type="button"
                  className={`ed-bg-tab-btn ${bgPickerTab === 'story' ? 'active' : ''}`}
                  onClick={() => handleOpenStoryBackgroundsModal()}
                >
                  <ImageIcon size={13} />
                  <span>Story Backgrounds ({storyBackgrounds.length})</span>
                </button>
                <button
                  type="button"
                  className={`ed-bg-tab-btn ${bgPickerTab === 'studio' ? 'active' : ''}`}
                  onClick={() => handleOpenStudioBackgroundsModal()}
                >
                  <SparklesIcon size={13} />
                  <span>Background Studio Library ({studioBackgrounds.length})</span>
                </button>
              </div>
              <button
                type="button"
                className="ed-bg-modal-close-btn"
                onClick={() => setShowBgPicker(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="ed-bg-modal-body">
              {bgPickerTab === 'studio' ? (
                isLoadingStudioBackgrounds ? (
                  <div className="ed-bg-picker-empty">
                    <SparklesIcon size={32} />
                    <div className="ed-bg-picker-empty-title">Loading Background Studio Environments...</div>
                  </div>
                ) : studioBackgrounds.length === 0 ? (
                  <div className="ed-bg-picker-empty">
                    <div style={{ color: '#8b5cf6', marginBottom: '8px' }}>
                      <SparklesIcon size={36} />
                    </div>
                    <div className="ed-bg-picker-empty-title">No Backgrounds Generated in Studio Yet</div>
                    <p className="ed-bg-picker-empty-desc">
                      Generate reusable storybook forest paths, bedrooms, villages, and skies in Background Studio.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="ed-btn-action studio"
                        onClick={() => {
                          setShowBgPicker(false);
                          window.open('/backgrounds', '_blank');
                        }}
                      >
                        <SparklesIcon size={13} />
                        <span>Open Background Studio</span>
                      </button>
                      <button
                        type="button"
                        className="ed-btn-action secondary"
                        onClick={() => {
                          setShowBgPicker(false);
                          bgFileInputRef.current?.click();
                        }}
                      >
                        <UploadIcon size={13} />
                        <span>Upload From Computer</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ed-bg-picker-grid">
                    {studioBackgrounds.map((bg) => (
                      <div
                        key={bg.id}
                        className="ed-bg-picker-item"
                        onClick={() => handleSelectStudioBackground(bg)}
                        title={`${bg.name || bg.environmentType} (${bg.aspectRatio})`}
                      >
                        <img
                          src={resolveAssetUrl(bg.imageUrl)}
                          alt={bg.name || bg.environmentType}
                          className="ed-bg-picker-thumb"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="ed-bg-picker-caption">
                          {bg.name || bg.environmentType}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : isLoadingStoryBackgrounds ? (
                <div className="ed-bg-picker-empty">
                  <ImageIcon size={32} />
                  <div className="ed-bg-picker-empty-title">Loading Story Backgrounds...</div>
                </div>
              ) : storyBackgrounds.length === 0 ? (
                <div className="ed-bg-picker-empty">
                  <div style={{ color: 'var(--ed-text-muted)', marginBottom: '8px' }}>
                    <ImageIcon size={36} />
                  </div>
                  <div className="ed-bg-picker-empty-title">No Previous Backgrounds in This Story</div>
                  <p className="ed-bg-picker-empty-desc">
                    Upload an image or import from Background Studio to use as the backdrop for this scene.
                  </p>
                  <button
                    type="button"
                    className="ed-btn-action primary"
                    onClick={() => {
                      setShowBgPicker(false);
                      bgFileInputRef.current?.click();
                    }}
                  >
                    <UploadIcon size={13} />
                    <span>Upload New Image</span>
                  </button>
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
                      <img
                        src={resolveAssetUrl(bg.imageUrl)}
                        alt={`Scene ${bg.sceneNumber}`}
                        className="ed-bg-picker-thumb"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div className="ed-bg-picker-caption">Scene {bg.sceneNumber}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ed-bg-modal-footer">
              <button
                type="button"
                className="ed-btn-action secondary"
                onClick={() => {
                  setShowBgPicker(false);
                  bgFileInputRef.current?.click();
                }}
              >
                <UploadIcon size={12} />
                <span>Upload From Computer</span>
              </button>
              <button
                type="button"
                className="ed-btn-action"
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
