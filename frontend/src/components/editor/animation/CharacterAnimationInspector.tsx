import React, { useState, useEffect, useRef } from 'react';
import {
  CharacterInstance,
  AnimationClip,
  VectorSceneData,
  AnimationActionType,
  MotionPath,
  FacialExpression,
  SpeakingDirection,
  SpeakingEmotion,
  ExpressionCue,
  SceneDialogue,
  CharacterVoiceConfig,
  CharacterPerformanceOverride,
} from '../../../types/animation';
import { EditorCharacter } from '../../../types/editor';
import { getVectorRig } from '../../../assets/characters/defaultCharacters';
import { TrashIcon, CheckIcon, PlayIcon, PauseIcon, SparklesIcon, MicIcon } from '../../common/Icons';
import { resolveAssetUrl } from '../../../utils/urlHelper';
import {
  generateSceneDialogueAudio,
  generateAllSceneDialogueAudios,
  deleteSceneDialogue,
  previewVoice,
} from '../../../services/editor.service';
import {
  updateCharacterVoice,
  getCharacterVoice,
} from '../../../services/character.service';
import {
  EMOTION_OPTIONS,
  EMOTION_TO_FACIAL_EXPRESSION,
  suggestEmotionForText,
} from '../../../utils/emotionSuggester';

export interface CharacterAnimationInspectorProps {
  instance: CharacterInstance;
  animationData: VectorSceneData;
  sceneDurationMs: number;
  sceneId?: string;
  characters?: EditorCharacter[];
  onUpdateInstance: (instanceId: string, updates: Partial<CharacterInstance>) => void;
  onUpdateAnimationData: (newData: VectorSceneData) => void;
  onRemoveInstance: (instanceId: string) => void;
}

const FACIAL_EXPRESSIONS: Array<{ id: FacialExpression; label: string; emoji: string; desc: string }> = [
  { id: 'neutral', label: 'Neutral', emoji: '😐', desc: 'Resting expression' },
  { id: 'happy', label: 'Happy', emoji: '😊', desc: 'Cheerful smile' },
  { id: 'sad', label: 'Sad', emoji: '😢', desc: 'Gentle downturn' },
  { id: 'angry', label: 'Angry', emoji: '😠', desc: 'Determined brow' },
  { id: 'surprised', label: 'Surprised', emoji: '😲', desc: 'Wide round mouth' },
  { id: 'scared', label: 'Scared', emoji: '😨', desc: 'Tense high brow' },
  { id: 'confused', label: 'Confused', emoji: '🤨', desc: 'Inquisitive look' },
  { id: 'curious', label: 'Curious', emoji: '🤔', desc: 'Puzzled tilt' },
];

export const KOKORO_VOICES = [
  {
    group: 'Hindi (हिन्दी)',
    lang: 'hi',
    voices: [
      { id: 'hf_alpha', name: 'Alpha (Female • Clear & Storyteller)' },
      { id: 'hf_beta', name: 'Beta (Female • Warm & Expressive)' },
      { id: 'hm_omega', name: 'Omega (Male • Resonant & Warm)' },
      { id: 'hm_psi', name: 'Psi (Male • Deep & Storyteller)' },
    ],
  },
  {
    group: 'American Female',
    lang: 'en',
    voices: [
      { id: 'af_heart', name: 'Heart (Warm & Engaging)' },
      { id: 'af_bella', name: 'Bella (Friendly & Playful)' },
      { id: 'af_nicole', name: 'Nicole (Soft & Gentle)' },
      { id: 'af_sarah', name: 'Sarah (Clear Storyteller)' },
      { id: 'af_nova', name: 'Nova (Bright & Cheerful)' },
      { id: 'af_sky', name: 'Sky (Bright & Cheerful)' },
      { id: 'af_alloy', name: 'Alloy (Energetic & Dynamic)' },
      { id: 'af_aoede', name: 'Aoede (Melodic & Friendly)' },
      { id: 'af_jessica', name: 'Jessica (Expressive & Warm)' },
      { id: 'af_kore', name: 'Kore (Calm & Clear)' },
      { id: 'af_river', name: 'River (Gentle Narrator)' },
    ],
  },
  {
    group: 'American Male',
    lang: 'en',
    voices: [
      { id: 'am_adam', name: 'Adam (Warm & Friendly)' },
      { id: 'am_echo', name: 'Echo (Lively & Animated)' },
      { id: 'am_eric', name: 'Eric (Enthusiastic & Bright)' },
      { id: 'am_fenrir', name: 'Fenrir (Deep Storyteller)' },
      { id: 'am_liam', name: 'Liam (Young & Cheerful)' },
      { id: 'am_michael', name: 'Michael (Natural Narrator)' },
      { id: 'am_onyx', name: 'Onyx (Deep & Resonant)' },
      { id: 'am_puck', name: 'Puck (Playful & Mischievous)' },
      { id: 'am_santa', name: 'Santa (Jolly & Booming)' },
    ],
  },
  {
    group: 'British Female',
    lang: 'en',
    voices: [
      { id: 'bf_alice', name: 'Alice (Refined & Pleasant)' },
      { id: 'bf_emma', name: 'Emma (Warm English Accent)' },
      { id: 'bf_isabella', name: 'Isabella (Clear & Articulate)' },
      { id: 'bf_lily', name: 'Lily (Sweet & Gentle)' },
    ],
  },
  {
    group: 'British Male',
    lang: 'en',
    voices: [
      { id: 'bm_george', name: 'George (Wise & Warm Bear)' },
      { id: 'bm_daniel', name: 'Daniel (Distinguished Storyteller)' },
      { id: 'bm_fable', name: 'Fable (Expressive Storyteller)' },
      { id: 'bm_lewis', name: 'Lewis (Friendly & Calm)' },
    ],
  },
];

const SPEAKING_DIRECTIONS: Array<{ id: SpeakingDirection; label: string; emoji: string }> = [
  { id: 'cheerful', label: 'Cheerful', emoji: '😄' },
  { id: 'excited', label: 'Excited', emoji: '🤩' },
  { id: 'calm', label: 'Calm', emoji: '😌' },
  { id: 'sad', label: 'Sad', emoji: '🥺' },
  { id: 'worried', label: 'Worried', emoji: '😟' },
  { id: 'curious', label: 'Curious', emoji: '🧐' },
  { id: 'serious', label: 'Serious', emoji: '😐' },
];

export const CharacterAnimationInspector: React.FC<CharacterAnimationInspectorProps> = ({
  instance,
  animationData,
  sceneDurationMs,
  sceneId,
  characters = [],
  onUpdateInstance,
  onUpdateAnimationData,
  onRemoveInstance,
}) => {
  const rig = getVectorRig(instance.characterId);
  const clips = animationData.animationClips || [];

  // -------------------------------------------------------------
  // Animation Clip Management
  // -------------------------------------------------------------
  let clip = clips.find((c) => c.instanceId === instance.instanceId);
  if (!clip) {
    clip = {
      clipId: `clip-${Date.now()}`,
      instanceId: instance.instanceId,
      action: 'walk',
      startMs: 0,
      durationMs: sceneDurationMs || 5000,
      loop: true,
      motionMode: 'in_place',
    };
  }

  const handleUpdateClip = (clipUpdates: Partial<AnimationClip>) => {
    const existingIndex = clips.findIndex((c) => c.instanceId === instance.instanceId);
    let updatedClips: AnimationClip[];

    if (existingIndex >= 0) {
      updatedClips = clips.map((c, i) => (i === existingIndex ? { ...c, ...clipUpdates } : c));
    } else {
      updatedClips = [...clips, { ...clip!, ...clipUpdates }];
    }

    onUpdateAnimationData({
      ...animationData,
      animationClips: updatedClips,
    });
  };

  const handleLayerOrder = (direction: 'up' | 'down') => {
    const delta = direction === 'up' ? 1 : -1;
    onUpdateInstance(instance.instanceId, {
      zIndex: Math.max(0, (instance.zIndex || 1) + delta),
    });
  };

  // -------------------------------------------------------------
  // Facial Expression Management
  // -------------------------------------------------------------
  const expressionCues = animationData.expressionCues || [];
  const instanceCues = expressionCues.filter(
    (c) =>
      c.instanceId === instance.instanceId ||
      c.characterInstanceId === instance.instanceId ||
      (c.characterId && c.characterId === instance.characterId)
  );
  const currentExpression: FacialExpression =
    instance.expression ||
    instanceCues[0]?.expression ||
    'neutral';

  const handleSetExpression = (expr: FacialExpression) => {
    // 1. Immediately update instance expression on the character instance
    onUpdateInstance(instance.instanceId, { expression: expr });

    // 2. Filter out any previous expression cues for this character instance
    const filtered = expressionCues.filter(
      (c) =>
        c.instanceId !== instance.instanceId &&
        c.characterInstanceId !== instance.instanceId &&
        c.characterId !== instance.characterId
    );

    // 3. Create new cue with all identifiers populated and spanning the scene duration
    const newCue: ExpressionCue = {
      id: `cue-exp-${Date.now()}`,
      instanceId: instance.instanceId,
      characterInstanceId: instance.instanceId,
      characterId: instance.characterId,
      expression: expr,
      startMs: 0,
      durationMs: Math.max(60000, sceneDurationMs || 5000),
    };

    onUpdateAnimationData({
      ...animationData,
      expressionCues: [...filtered, newCue],
    });
  };

  // -------------------------------------------------------------
  // Timed Expression Cues Management
  // -------------------------------------------------------------
  const [newCueTimeSec, setNewCueTimeSec] = useState<number>(1.0);
  const [newCueDurationSec, setNewCueDurationSec] = useState<number>(2.0);
  const [newCueExpression, setNewCueExpression] = useState<FacialExpression>('happy');

  const handleAddTimedExpressionCue = () => {
    const cue: ExpressionCue = {
      id: `cue-exp-${Date.now()}`,
      instanceId: instance.instanceId,
      characterInstanceId: instance.instanceId,
      characterId: instance.characterId,
      expression: newCueExpression,
      startMs: Math.round(newCueTimeSec * 1000),
      durationMs: Math.round(newCueDurationSec * 1000),
    };
    onUpdateAnimationData({
      ...animationData,
      expressionCues: [...expressionCues, cue],
    });
  };

  const handleRemoveExpressionCue = (cueId?: string) => {
    if (!cueId) return;
    const filtered = expressionCues.filter((c) => c.id !== cueId);
    onUpdateAnimationData({
      ...animationData,
      expressionCues: filtered,
    });
  };

  // -------------------------------------------------------------
  // Character Voice Settings (Kokoro-82M) & Scene Performance
  // -------------------------------------------------------------
  // Find matching character in story/catalogue
  const matchedChar = characters.find((c) => c.id === instance.characterId);
  const scenePerformance = animationData.characterPerformances?.[instance.instanceId];
  const initialVoiceConfig: CharacterVoiceConfig =
    matchedChar?.canonicalAppearance?.voiceConfig ||
    instance.appearance?.voiceConfig || {
      lang: 'hi',
      voiceId: 'hf_alpha',
      emotion: 'neutral',
      speed: 1.0,
      style: 'calm',
      effect: 'normal',
    };

  const initialLang: 'hi' | 'en' =
    (scenePerformance?.lang === 'en' || initialVoiceConfig.lang === 'en') ? 'en' : 'hi';

  const [voiceLang, setVoiceLang] = useState<'hi' | 'en'>(initialLang);
  const [voiceId, setVoiceId] = useState<string>(scenePerformance?.voiceId || initialVoiceConfig.voiceId || 'hf_alpha');
  const [voiceEmotion, setVoiceEmotion] = useState<SpeakingEmotion>(scenePerformance?.emotion || initialVoiceConfig.emotion || 'neutral');
  const [voiceSpeed, setVoiceSpeed] = useState<number>(scenePerformance?.speed ?? initialVoiceConfig.speed ?? 1.0);
  const [voiceEffect, setVoiceEffect] = useState<'normal' | 'cartoon' | 'robot' | 'whisper' | 'shout'>(
    scenePerformance?.effect || initialVoiceConfig.effect || 'normal'
  );

  const [isSavingVoice, setIsSavingVoice] = useState<boolean>(false);
  const [voiceSavedMsg, setVoiceSavedMsg] = useState<string | null>(null);
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);

  // Sync state when instance or matchedChar or scenePerformance changes
  useEffect(() => {
    const override = animationData.characterPerformances?.[instance.instanceId];
    const config =
      matchedChar?.canonicalAppearance?.voiceConfig ||
      instance.appearance?.voiceConfig;
    
    const effLang: 'hi' | 'en' = (override?.lang === 'en' || config?.lang === 'en') ? 'en' : 'hi';
    const effVoice = override?.voiceId || config?.voiceId || (effLang === 'hi' ? 'hf_alpha' : 'af_heart');
    const effEmotion = override?.emotion || config?.emotion || 'neutral';
    const effSpeed = override?.speed ?? config?.speed ?? 1.0;
    const effEffect = override?.effect || config?.effect || 'normal';

    setVoiceLang(effLang);
    setVoiceId(effVoice);
    setVoiceEmotion(effEmotion);
    setVoiceSpeed(effSpeed);
    setVoiceEffect(effEffect);
  }, [instance.characterId, instance.instanceId, matchedChar, animationData.characterPerformances]);

  const handleUpdateSceneVoice = (updates: Partial<CharacterPerformanceOverride>) => {
    const nextLang: 'hi' | 'en' = updates.lang ? (updates.lang === 'en' ? 'en' : 'hi') : voiceLang;
    const nextVoice = updates.voiceId ?? voiceId;
    const nextEmotion = updates.emotion ?? voiceEmotion;
    const nextSpeed = updates.speed ?? voiceSpeed;
    const nextEffect = updates.effect ?? voiceEffect;

    if (updates.lang !== undefined) setVoiceLang(updates.lang === 'en' ? 'en' : 'hi');
    if (updates.voiceId !== undefined) setVoiceId(updates.voiceId);
    if (updates.emotion !== undefined) setVoiceEmotion(updates.emotion);
    if (updates.speed !== undefined) setVoiceSpeed(updates.speed);
    if (updates.effect !== undefined) setVoiceEffect(updates.effect);

    const existingPerformances = animationData.characterPerformances || {};
    const updatedPerformance: CharacterPerformanceOverride = {
      ...existingPerformances[instance.instanceId],
      lang: nextLang,
      voiceId: nextVoice,
      emotion: nextEmotion,
      speed: nextSpeed,
      effect: nextEffect,
    };

    onUpdateAnimationData({
      ...animationData,
      characterPerformances: {
        ...existingPerformances,
        [instance.instanceId]: updatedPerformance,
      },
    });
  };

  const handleUpdateScenePerformance = handleUpdateSceneVoice;

  const handleAuditionVoice = async () => {
    if (isAuditioning) {
      if (auditionAudioRef.current) {
        auditionAudioRef.current.pause();
        auditionAudioRef.current = null;
      }
      setIsAuditioning(false);
      return;
    }

    setIsAuditioning(true);
    try {
      const sampleText = voiceLang === 'hi'
        ? `नमस्ते! मैं ${instance.name || 'आपका दोस्त'} हूँ, और मैं एक रोमांचक कहानी के लिए पूरी तरह तैयार हूँ!`
        : `Hello! I am ${instance.name || 'your friend'}, ready for an amazing story adventure!`;

      const res = await previewVoice({
        voice: voiceId,
        lang: voiceLang,
        emotion: voiceEmotion,
        speed: voiceSpeed,
        effect: voiceEffect,
        sampleText,
      });

      const audio = new Audio(resolveAssetUrl(res.audioUrl));
      auditionAudioRef.current = audio;
      audio.onended = () => {
        setIsAuditioning(false);
        auditionAudioRef.current = null;
      };
      await audio.play();
    } catch (err: any) {
      console.error('Audition failed:', err);
      setIsAuditioning(false);
    }
  };

  const handleSaveDefaultVoice = async () => {
    if (!instance.characterId) return;
    setIsSavingVoice(true);
    setVoiceSavedMsg(null);

    const newConfig: CharacterVoiceConfig = {
      lang: voiceLang,
      voiceId,
      emotion: voiceEmotion,
      speed: voiceSpeed,
      style: voiceEmotion as any,
      effect: voiceEffect,
    };

    try {
      await updateCharacterVoice(instance.characterId, newConfig);

      // Also persist to current instance appearance
      if (instance.appearance) {
        onUpdateInstance(instance.instanceId, {
          appearance: {
            ...instance.appearance,
            voiceConfig: newConfig,
          },
        });
      }

      setVoiceSavedMsg(`Default saved (${voiceLang.toUpperCase()} • ${voiceId})!`);
      setTimeout(() => setVoiceSavedMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to save default voice:', err);
      setVoiceSavedMsg('Save failed');
    } finally {
      setIsSavingVoice(false);
    }
  };

  // -------------------------------------------------------------
  // Character Dialogue & Lip-Sync Management
  // -------------------------------------------------------------
  const allDialogues = animationData.dialogueLines || [];
  const characterDialogues = allDialogues.filter(
    (d) =>
      d.characterInstanceId === instance.instanceId ||
      d.characterId === instance.characterId ||
      d.characterName === instance.name ||
      (d.characterName && instance.name && d.characterName.toLowerCase() === instance.name.toLowerCase()) ||
      (d.characterName && instance.name && (
        (d.characterName.toLowerCase().includes('earth') && (instance.name.toLowerCase().includes('earth') || instance.name.toLowerCase().includes('terra'))) ||
        (d.characterName.toLowerCase().includes('terra') && (instance.name.toLowerCase().includes('earth') || instance.name.toLowerCase().includes('terra'))) ||
        (d.characterName.toLowerCase().includes('pip') && instance.name.toLowerCase().includes('pip')) ||
        (d.characterName.toLowerCase().includes('sammy') && instance.name.toLowerCase().includes('sammy'))
      ))
  );

  const [newDialogueText, setNewDialogueText] = useState<string>('');
  const [newDialogueLang, setNewDialogueLang] = useState<'hi' | 'en'>(voiceLang);
  const [newDialogueVoice, setNewDialogueVoice] = useState<string>(voiceId);
  const [newDialogueEmotion, setNewDialogueEmotion] = useState<SpeakingEmotion>(voiceEmotion);
  const [newDialogueFacialExpression, setNewDialogueFacialExpression] = useState<FacialExpression>(
    EMOTION_TO_FACIAL_EXPRESSION[voiceEmotion] || 'neutral'
  );
  const [newDialogueStartSec, setNewDialogueStartSec] = useState<number>(0);
  const [isGeneratingDialogue, setIsGeneratingDialogue] = useState<boolean>(false);
  const [isSuggestingEmotion, setIsSuggestingEmotion] = useState<boolean>(false);
  const [suggestionBadge, setSuggestionBadge] = useState<string | null>(null);
  const [dialogueError, setDialogueError] = useState<string | null>(null);
  const [activeDialogueAudioId, setActiveDialogueAudioId] = useState<string | null>(null);
  const dialogueAudioRef = useRef<HTMLAudioElement | null>(null);

  // Sync new dialogue lang & voice with scene performance when it changes
  useEffect(() => {
    setNewDialogueLang(voiceLang);
    setNewDialogueVoice(voiceId);
    setNewDialogueEmotion(voiceEmotion);
    setNewDialogueFacialExpression(EMOTION_TO_FACIAL_EXPRESSION[voiceEmotion] || 'neutral');
  }, [voiceLang, voiceId, voiceEmotion]);

  const handleAutoSuggestEmotion = () => {
    if (!newDialogueText.trim()) return;
    setIsSuggestingEmotion(true);
    try {
      const suggestion = suggestEmotionForText(newDialogueText.trim());
      setNewDialogueEmotion(suggestion.emotion);
      setNewDialogueFacialExpression(suggestion.facialExpression);
      setSuggestionBadge(`${suggestion.emotion.toUpperCase()} (${Math.round(suggestion.confidence * 100)}%): ${suggestion.rationale}`);
      setTimeout(() => setSuggestionBadge(null), 5000);
    } catch (e) {
      console.warn('Suggest emotion error:', e);
    } finally {
      setIsSuggestingEmotion(false);
    }
  };

  const handlePlayDialogue = (dialogue: SceneDialogue) => {
    if (!dialogue.audioUrl) return;

    if (activeDialogueAudioId === dialogue.id) {
      if (dialogueAudioRef.current) {
        dialogueAudioRef.current.pause();
        dialogueAudioRef.current = null;
      }
      setActiveDialogueAudioId(null);
      return;
    }

    if (dialogueAudioRef.current) {
      dialogueAudioRef.current.pause();
    }

    const audio = new Audio(resolveAssetUrl(dialogue.audioUrl));
    dialogueAudioRef.current = audio;
    setActiveDialogueAudioId(dialogue.id);

    audio.onended = () => {
      setActiveDialogueAudioId(null);
      dialogueAudioRef.current = null;
    };
    audio.play().catch(console.error);
  };

  const handleGenerateDialogue = async () => {
    if (!newDialogueText.trim() || !sceneId) return;

    setIsGeneratingDialogue(true);
    setDialogueError(null);

    try {
      const res = await generateSceneDialogueAudio(sceneId, {
        characterId: instance.characterId,
        characterInstanceId: instance.instanceId,
        characterName: instance.name,
        text: newDialogueText.trim(),
        lang: newDialogueLang,
        voice: newDialogueVoice || voiceId,
        emotion: newDialogueEmotion,
        facialExpression: newDialogueFacialExpression,
        speakingDirection: newDialogueEmotion as any,
        speed: voiceSpeed,
        startMs: Math.round(newDialogueStartSec * 1000),
      });

      if (res.success && res.dialogue) {
        const existingDialogues = animationData.dialogueLines || [];
        onUpdateAnimationData({
          ...animationData,
          dialogueLines: [...existingDialogues, res.dialogue],
        });
        setNewDialogueText('');
        // Suggest start time after this dialogue
        const nextStartSec = (res.dialogue.startMs + res.dialogue.durationMs + 300) / 1000;
        setNewDialogueStartSec(Math.min(sceneDurationMs / 1000, Number(nextStartSec.toFixed(1))));
      }
    } catch (err: any) {
      console.error('Failed to generate dialogue audio:', err);
      setDialogueError(err.message || 'Failed to generate dialogue audio');
    } finally {
      setIsGeneratingDialogue(false);
    }
  };

  const handleDeleteDialogue = async (dialogueId: string) => {
    if (sceneId) {
      try {
        await deleteSceneDialogue(sceneId, dialogueId);
      } catch (e) {
        console.warn('Backend dialogue deletion notice:', e);
      }
    }
    const updated = (animationData.dialogueLines || []).filter((d) => d.id !== dialogueId);
    onUpdateAnimationData({
      ...animationData,
      dialogueLines: updated,
    });
  };

  const [isBatchGenerating, setIsBatchGenerating] = useState<boolean>(false);

  const handleGenerateAllDialogues = async () => {
    if (!sceneId) return;
    setIsBatchGenerating(true);
    setDialogueError(null);
    try {
      const res = await generateAllSceneDialogueAudios(sceneId);
      if (res.success && res.dialogueLines) {
        onUpdateAnimationData({
          ...animationData,
          dialogueLines: res.dialogueLines,
        });
      }
    } catch (err: any) {
      console.error('Failed to batch generate dialogue audio:', err);
      setDialogueError(err.message || 'Failed to generate dialogue audios');
    } finally {
      setIsBatchGenerating(false);
    }
  };

  return (
    <div className="char-animation-inspector" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Header / Identity */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--ed-text)' }}>
            {instance.name || rig.name}
          </h4>
          <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
            Vector Rig • {rig.species}
          </span>
        </div>
        <button
          type="button"
          className="ed-tool-btn danger"
          onClick={() => onRemoveInstance(instance.instanceId)}
          title="Remove character from scene"
          style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <TrashIcon size={12} />
          <span>Remove</span>
        </button>
      </div>

      {/* 2. Facial Expressions Selector */}
      <div className="ed-inspector-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label className="ed-field-label" style={{ margin: 0 }}>Facial Expression</label>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#c4b5fd',
              fontWeight: 600,
            }}
          >
            Active: {currentExpression.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
          {FACIAL_EXPRESSIONS.map((expr) => {
            const isSelected = currentExpression === expr.id;
            return (
              <button
                key={expr.id}
                type="button"
                className={`ed-tool-btn ${isSelected ? 'primary' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '6px 2px',
                  borderRadius: '6px',
                  border: isSelected ? '2px solid #8b5cf6' : '1px solid var(--ed-border)',
                  background: isSelected ? 'rgba(139, 92, 246, 0.25)' : 'var(--ed-surface-elevated)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => handleSetExpression(expr.id)}
                title={`${expr.label}: ${expr.desc}`}
              >
                <span style={{ fontSize: '18px', lineHeight: 1.2 }}>{expr.emoji}</span>
                <span style={{ fontSize: '10px', marginTop: '2px', fontWeight: isSelected ? 700 : 500 }}>
                  {expr.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Timed Expression Cues (Within-Scene Keyframing) */}
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--ed-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text)' }}>
              Timed Expression Changes ({instanceCues.filter(c => c.startMs > 0 || c.durationMs < 50000).length})
            </span>
          </div>

          {/* List of active timed expression cues */}
          {instanceCues.filter(c => c.startMs > 0 || c.durationMs < 50000).map((cue) => (
            <div
              key={cue.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                borderRadius: '4px',
                background: 'var(--ed-surface-elevated)',
                border: '1px solid var(--ed-border)',
                marginBottom: '4px',
                fontSize: '11px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{FACIAL_EXPRESSIONS.find(e => e.id === cue.expression)?.emoji}</span>
                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{cue.expression}</span>
                <span style={{ color: 'var(--ed-text-muted)' }}>
                  @ {(cue.startMs / 1000).toFixed(1)}s (for {(cue.durationMs / 1000).toFixed(1)}s)
                </span>
              </div>
              <button
                type="button"
                className="ed-tool-btn danger"
                style={{ padding: '2px 5px', fontSize: '10px' }}
                onClick={() => handleRemoveExpressionCue(cue.id)}
                title="Remove timed expression cue"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Add timed cue mini-form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '4px', alignItems: 'center', marginTop: '6px' }}>
            <select
              className="ed-select"
              value={newCueExpression}
              onChange={(e) => setNewCueExpression(e.target.value as FacialExpression)}
              style={{ fontSize: '11px', padding: '3px 4px' }}
            >
              {FACIAL_EXPRESSIONS.map((expr) => (
                <option key={expr.id} value={expr.id}>
                  {expr.emoji} {expr.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="Start(s)"
              value={newCueTimeSec}
              onChange={(e) => setNewCueTimeSec(parseFloat(e.target.value) || 0)}
              className="ed-input"
              style={{ fontSize: '11px', padding: '3px 4px' }}
              title="Start time in seconds"
            />
            <input
              type="number"
              min="0.5"
              step="0.5"
              placeholder="Dur(s)"
              value={newCueDurationSec}
              onChange={(e) => setNewCueDurationSec(parseFloat(e.target.value) || 1)}
              className="ed-input"
              style={{ fontSize: '11px', padding: '3px 4px' }}
              title="Duration in seconds"
            />
            <button
              type="button"
              className="ed-tool-btn primary"
              onClick={handleAddTimedExpressionCue}
              style={{ fontSize: '10px', padding: '3px 6px', whiteSpace: 'nowrap' }}
              title="Add expression keyframe at this time"
            >
              + Cue
            </button>
          </div>
        </div>
      </div>

      {/* 3. Character Voice Settings & Scene Performance (Kokoro-82M) */}
      <div className="ed-inspector-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label className="ed-field-label" style={{ margin: 0 }}>Voice & Performance</label>
            {scenePerformance ? (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: 'rgba(139, 92, 246, 0.2)',
                  color: '#c4b5fd',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                }}
              >
                SCENE OVERRIDE
              </span>
            ) : (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: 'rgba(148, 163, 184, 0.15)',
                  color: '#94a3b8',
                }}
              >
                CHAR DEFAULT
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 5px',
              borderRadius: '3px',
              background: '#047857',
              color: '#ecfdf5',
              letterSpacing: '0.04em',
            }}
          >
            KOKORO-82M
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
          {/* Language Selector */}
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Language</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '3px' }}>
              <button
                type="button"
                className={`ed-tool-btn ${voiceLang === 'hi' ? 'primary' : ''}`}
                style={{
                  fontSize: '11px',
                  fontWeight: voiceLang === 'hi' ? 700 : 400,
                  background: voiceLang === 'hi' ? '#047857' : undefined,
                  borderColor: voiceLang === 'hi' ? '#059669' : undefined,
                }}
                onClick={() => {
                  const defaultHindiVoice = 'hf_alpha';
                  handleUpdateSceneVoice({ lang: 'hi', voiceId: defaultHindiVoice });
                }}
              >
                🇮🇳 Hindi (हिन्दी) [Default]
              </button>
              <button
                type="button"
                className={`ed-tool-btn ${voiceLang === 'en' ? 'primary' : ''}`}
                style={{
                  fontSize: '11px',
                  fontWeight: voiceLang === 'en' ? 700 : 400,
                }}
                onClick={() => {
                  const defaultEngVoice = instance.characterId === 'pip_the_bear' ? 'bm_george' : 'af_heart';
                  handleUpdateSceneVoice({ lang: 'en', voiceId: defaultEngVoice });
                }}
              >
                🇬🇧/🇺🇸 English
              </button>
            </div>
          </div>

          {/* Assigned Voice Dropdown */}
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
              Assigned Voice ({voiceLang === 'hi' ? '4 Hindi' : '28 English'} Styles)
            </span>
            <select
              className="ed-select"
              value={voiceId}
              onChange={(e) => {
                const vid = e.target.value;
                const isHindi = vid.startsWith('hf_') || vid.startsWith('hm_');
                handleUpdateSceneVoice({
                  voiceId: vid,
                  lang: isHindi ? 'hi' : 'en',
                });
              }}
              style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
            >
              {KOKORO_VOICES
                .filter((grp) => (voiceLang === 'hi' ? grp.lang === 'hi' : grp.lang === 'en'))
                .map((grp) => (
                  <optgroup key={grp.group} label={grp.group}>
                    {grp.voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>

          {/* Speaking Emotion (All 14 calibrated delivery styles) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Speaking Emotion</span>
              <select
                className="ed-select"
                value={voiceEmotion}
                onChange={(e) => {
                  const em = e.target.value as SpeakingEmotion;
                  handleUpdateSceneVoice({ emotion: em });
                }}
                style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
              >
                {EMOTION_OPTIONS.map((emo) => (
                  <option key={emo.id} value={emo.id}>
                    {emo.emoji} {emo.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Voice Effect</span>
              <select
                className="ed-select"
                value={voiceEffect}
                onChange={(e) => handleUpdateSceneVoice({ effect: e.target.value as any })}
                style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
              >
                <option value="normal">Normal (Natural)</option>
                <option value="cartoon">Cartoon (Playful)</option>
                <option value="robot">Robot (Toy)</option>
                <option value="whisper">Whisper (Soft)</option>
                <option value="shout">Shout (Elevated)</option>
              </select>
            </div>
          </div>

          {/* Speed slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
              <span style={{ color: 'var(--ed-text-muted)' }}>Speed</span>
              <span style={{ fontWeight: 600 }}>{voiceSpeed.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              className="ed-inspector-slider"
              min="0.5"
              max="2.0"
              step="0.05"
              value={voiceSpeed}
              onChange={(e) => handleUpdateSceneVoice({ speed: parseFloat(e.target.value) })}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button
              type="button"
              className="ed-tool-btn"
              onClick={handleAuditionVoice}
              style={{ flex: 1, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              {isAuditioning ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
              <span>{isAuditioning ? 'Stop' : `Audition (${voiceLang.toUpperCase()})`}</span>
            </button>
            <button
              type="button"
              className="ed-tool-btn primary"
              onClick={handleSaveDefaultVoice}
              disabled={isSavingVoice}
              style={{ flex: 1, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
              title="Save this language and voice as the permanent default for this character"
            >
              <CheckIcon size={12} />
              <span>{isSavingVoice ? 'Saving...' : 'Save As Global'}</span>
            </button>
          </div>

          {voiceSavedMsg && (
            <div style={{ fontSize: '11px', color: '#10b981', textAlign: 'center', marginTop: '2px' }}>
              ✓ {voiceSavedMsg}
            </div>
          )}
        </div>
      </div>

      {/* 4. Character Dialogue & Lip-Sync Manager */}
      <div className="ed-inspector-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label className="ed-field-label" style={{ margin: 0 }}>Dialogue & Lip-Sync</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
              {characterDialogues.length} line{characterDialogues.length !== 1 ? 's' : ''}
            </span>
            {characterDialogues.length > 0 && (
              <button
                type="button"
                className="ed-tool-btn primary"
                disabled={isBatchGenerating}
                onClick={handleGenerateAllDialogues}
                style={{ fontSize: '10px', padding: '2px 8px' }}
                title="Synthesize Kokoro-82M speech audio for all dialogue lines in this scene"
              >
                {isBatchGenerating ? '⏳ Generating...' : '⚡ Generate All Audio'}
              </button>
            )}
          </div>
        </div>

        {/* Existing Dialogue Lines */}
        {characterDialogues.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
            {characterDialogues.map((dlg) => {
              const isPlaying = activeDialogueAudioId === dlg.id;
              const visemeCount = dlg.visemeCues?.length || 0;
              const startSec = (dlg.startMs / 1000).toFixed(1);
              const durSec = (dlg.durationMs / 1000).toFixed(1);
              const lineLang = dlg.lang || voiceLang;
              const lineEmotion = dlg.emotion || dlg.speakingDirection || 'neutral';
              const lineFacialExp = dlg.facialExpression || EMOTION_TO_FACIAL_EXPRESSION[lineEmotion as SpeakingEmotion] || 'neutral';

              return (
                <div
                  key={dlg.id}
                  style={{
                    backgroundColor: 'var(--ed-surface-elevated)',
                    border: '1px solid var(--ed-border)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--ed-text)', fontStyle: 'italic', flex: 1 }}>
                      "{dlg.text}"
                    </div>
                    <button
                      type="button"
                      className="ed-tool-btn danger"
                      onClick={() => handleDeleteDialogue(dlg.id)}
                      title="Delete dialogue"
                      style={{ padding: '2px 4px', fontSize: '10px' }}
                    >
                      <TrashIcon size={11} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--ed-text-muted)', marginTop: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '1px 4px',
                          borderRadius: '3px',
                          background: lineLang === 'hi' ? '#065f46' : '#1e3a8a',
                          color: '#ffffff',
                          fontWeight: 600,
                          fontSize: '9px',
                        }}
                      >
                        {lineLang === 'hi' ? '🇮🇳 हिन्दी' : '🇬🇧 EN'}
                      </span>
                      <span
                        style={{
                          textTransform: 'capitalize',
                          color: '#c4b5fd',
                          fontWeight: 600,
                          padding: '1px 4px',
                          borderRadius: '3px',
                          background: 'rgba(139, 92, 246, 0.15)',
                        }}
                      >
                        {EMOTION_OPTIONS.find(e => e.id === lineEmotion)?.emoji || '💬'} {lineEmotion}
                      </span>
                      <span
                        style={{
                          textTransform: 'capitalize',
                          color: '#67e8f9',
                          fontWeight: 500,
                          padding: '1px 4px',
                          borderRadius: '3px',
                          background: 'rgba(6, 182, 212, 0.15)',
                        }}
                      >
                        Face: {lineFacialExp}
                      </span>
                      <span>•</span>
                      <span>{startSec}s - {(Number(startSec) + Number(durSec)).toFixed(1)}s</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {dlg.audioUrl ? (
                        <span
                          style={{
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#60a5fa',
                            fontWeight: 600,
                          }}
                          title="Audio file ready"
                        >
                          🔊 Audio
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            fontWeight: 600,
                          }}
                          title="No audio generated yet — click Generate All Audio"
                        >
                          🔇 No Audio
                        </span>
                      )}

                      {visemeCount > 0 ? (
                        <span
                          style={{
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            fontWeight: 600,
                          }}
                          title={`${visemeCount} synchronized visemes`}
                        >
                          👄 {visemeCount}v
                        </span>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: '9px' }}>No visemes</span>
                      )}

                      {dlg.audioUrl && (
                        <button
                          type="button"
                          className="ed-tool-btn"
                          onClick={() => handlePlayDialogue(dlg)}
                          style={{ padding: '2px 6px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                        >
                          {isPlaying ? <PauseIcon size={10} /> : <PlayIcon size={10} />}
                          <span>{isPlaying ? 'Pause' : 'Play'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add New Spoken Dialogue Form */}
        <div
          style={{
            backgroundColor: 'var(--ed-surface-elevated)',
            border: '1px dashed var(--ed-border)',
            borderRadius: '6px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text)' }}>
              + Add Character Dialogue
            </span>
            <button
              type="button"
              className="ed-tool-btn"
              onClick={handleAutoSuggestEmotion}
              disabled={isSuggestingEmotion || !newDialogueText.trim()}
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                color: '#c4b5fd',
                borderColor: '#8b5cf6',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
              title="Automatically detect speaking emotion and facial expression from dialogue text"
            >
              <SparklesIcon size={10} />
              <span>{isSuggestingEmotion ? 'Analyzing...' : 'Suggest Emotion'}</span>
            </button>
          </div>

          {suggestionBadge && (
            <div
              style={{
                fontSize: '10px',
                padding: '3px 6px',
                borderRadius: '4px',
                background: 'rgba(139, 92, 246, 0.2)',
                color: '#ddd6fe',
                border: '1px solid rgba(139, 92, 246, 0.3)',
              }}
            >
              ✨ {suggestionBadge}
            </div>
          )}

          <textarea
            className="ed-input"
            rows={2}
            placeholder={voiceLang === 'hi' ? `यह पात्र क्या बोलता है? (उदा. नमस्ते दोस्तों!)` : `What does ${instance.name || 'this character'} say?`}
            value={newDialogueText}
            onChange={(e) => setNewDialogueText(e.target.value)}
            style={{ fontSize: '11px', resize: 'vertical' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>Language</span>
              <select
                className="ed-select"
                value={newDialogueLang}
                onChange={(e) => {
                  const l = e.target.value as 'hi' | 'en';
                  setNewDialogueLang(l);
                  if (l === 'hi' && !newDialogueVoice.startsWith('h')) {
                    setNewDialogueVoice('hf_alpha');
                  } else if (l === 'en' && newDialogueVoice.startsWith('h')) {
                    setNewDialogueVoice('af_heart');
                  }
                }}
                style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
              >
                <option value="hi">🇮🇳 Hindi (हिन्दी)</option>
                <option value="en">🇬🇧 English</option>
              </select>
            </div>

            <div>
              <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>Speaking Emotion</span>
              <select
                className="ed-select"
                value={newDialogueEmotion}
                onChange={(e) => {
                  const em = e.target.value as SpeakingEmotion;
                  setNewDialogueEmotion(em);
                  setNewDialogueFacialExpression(EMOTION_TO_FACIAL_EXPRESSION[em] || 'neutral');
                }}
                style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
              >
                {EMOTION_OPTIONS.map((emo) => (
                  <option key={emo.id} value={emo.id}>
                    {emo.emoji} {emo.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>Facial Expression Override</span>
              <select
                className="ed-select"
                value={newDialogueFacialExpression}
                onChange={(e) => setNewDialogueFacialExpression(e.target.value as FacialExpression)}
                style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
              >
                {FACIAL_EXPRESSIONS.map((expr) => (
                  <option key={expr.id} value={expr.id}>
                    {expr.emoji} {expr.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>Start Time (s)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max={sceneDurationMs / 1000}
                className="ed-input"
                value={newDialogueStartSec}
                onChange={(e) => setNewDialogueStartSec(parseFloat(e.target.value) || 0)}
                style={{ fontSize: '11px', marginTop: '2px' }}
              />
            </div>
          </div>

          <button
            type="button"
            className="ed-btn-action primary"
            onClick={handleGenerateDialogue}
            disabled={isGeneratingDialogue || !newDialogueText.trim() || !sceneId}
            style={{ fontSize: '11px', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '2px' }}
          >
            <MicIcon size={12} />
            <span>{isGeneratingDialogue ? 'Synthesizing Audio & Lip-Sync...' : '🎙️ Generate Dialogue & Lip-Sync'}</span>
          </button>

          {dialogueError && (
            <div style={{ fontSize: '10px', color: '#ef4444' }}>
              ⚠ {dialogueError}
            </div>
          )}
        </div>
      </div>

      {/* 5. Transform & Placement */}
      <div className="ed-inspector-section">
        <label className="ed-field-label">Transform & Placement</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>X (Canvas px)</span>
            <input
              type="number"
              className="ed-input"
              value={instance.x}
              onChange={(e) => onUpdateInstance(instance.instanceId, { x: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Y (Canvas px)</span>
            <input
              type="number"
              className="ed-input"
              value={instance.y}
              onChange={(e) => onUpdateInstance(instance.instanceId, { y: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Scale ({Math.round(instance.scale * 100)}%)</span>
            <input
              type="range"
              className="ed-inspector-slider"
              min="0.3"
              max="2.5"
              step="0.05"
              value={instance.scale}
              onChange={(e) => onUpdateInstance(instance.instanceId, { scale: parseFloat(e.target.value) })}
            />
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Rotation ({instance.rotation}°)</span>
            <input
              type="range"
              className="ed-inspector-slider"
              min="-180"
              max="180"
              step="5"
              value={instance.rotation}
              onChange={(e) => onUpdateInstance(instance.instanceId, { rotation: parseInt(e.target.value, 10) })}
            />
          </div>
        </div>

        {/* Flip & Layer ordering */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <button
            type="button"
            className={`ed-tool-btn ${instance.flipX ? 'primary' : ''}`}
            onClick={() => onUpdateInstance(instance.instanceId, { flipX: !instance.flipX })}
            style={{ flex: 1, fontSize: '11px' }}
          >
            {instance.flipX ? 'Facing Left ◄' : 'Facing Right ►'}
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            onClick={() => handleLayerOrder('up')}
            style={{ fontSize: '11px' }}
            title="Bring Forward in Z-Index"
          >
            ▲ Layer
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            onClick={() => handleLayerOrder('down')}
            style={{ fontSize: '11px' }}
            title="Send Backward in Z-Index"
          >
            ▼ Layer
          </button>
        </div>
      </div>

      {/* 6. Animation Action Controls */}
      <div className="ed-inspector-section">
        <label className="ed-field-label">Animation Action</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '12px' }}>
          {(['walk', 'wave', 'idle', 'jump'] as AnimationActionType[]).map((action) => (
            <button
              key={action}
              type="button"
              className={`ed-tool-btn ${clip?.action === action ? 'primary' : ''}`}
              style={{
                textTransform: 'capitalize',
                fontSize: '11px',
                padding: '6px 4px',
                background: clip?.action === action ? 'var(--ed-accent)' : undefined,
                color: clip?.action === action ? '#ffffff' : undefined,
              }}
              onClick={() => handleUpdateClip({ action })}
            >
              {action}
            </button>
          ))}
        </div>

        {/* Dual Walking Modes if action is walk */}
        {clip?.action === 'walk' && (
          <div
            style={{
              padding: '10px',
              backgroundColor: 'var(--ed-surface-elevated)',
              borderRadius: '6px',
              border: '1px solid var(--ed-border)',
              marginBottom: '12px',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Walking Mode
            </span>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <button
                type="button"
                className={`ed-tool-btn ${clip.motionMode === 'in_place' || !clip.motionMode ? 'primary' : ''}`}
                style={{ flex: 1, fontSize: '11px' }}
                onClick={() => handleUpdateClip({ motionMode: 'in_place' })}
              >
                In-Place (Treadmill)
              </button>
              <button
                type="button"
                className={`ed-tool-btn ${clip.motionMode === 'motion_path' ? 'primary' : ''}`}
                style={{ flex: 1, fontSize: '11px' }}
                onClick={() =>
                  handleUpdateClip({
                    motionMode: 'motion_path',
                    motionPath: clip?.motionPath || {
                      startX: Math.max(100, instance.x - 250),
                      startY: instance.y,
                      endX: Math.min(1180, instance.x + 250),
                      endY: instance.y,
                      easing: 'easeInOut',
                    },
                  })
                }
              >
                Motion Path ➔
              </button>
            </div>

            {clip.motionMode === 'motion_path' && clip.motionPath && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>Start (X, Y)</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="number"
                        className="ed-input"
                        style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={clip.motionPath.startX}
                        onChange={(e) =>
                          handleUpdateClip({
                            motionPath: { ...clip!.motionPath!, startX: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                      />
                      <input
                        type="number"
                        className="ed-input"
                        style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={clip.motionPath.startY}
                        onChange={(e) =>
                          handleUpdateClip({
                            motionPath: { ...clip!.motionPath!, startY: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>End (X, Y)</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="number"
                        className="ed-input"
                        style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={clip.motionPath.endX}
                        onChange={(e) =>
                          handleUpdateClip({
                            motionPath: { ...clip!.motionPath!, endX: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                      />
                      <input
                        type="number"
                        className="ed-input"
                        style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={clip.motionPath.endY}
                        onChange={(e) =>
                          handleUpdateClip({
                            motionPath: { ...clip!.motionPath!, endY: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    style={{ flex: 1, fontSize: '10px' }}
                    onClick={() =>
                      handleUpdateClip({
                        motionPath: {
                          ...clip!.motionPath!,
                          startX: instance.x,
                          startY: instance.y,
                        },
                      })
                    }
                  >
                    Start from Current (X, Y)
                  </button>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    style={{ flex: 1, fontSize: '10px' }}
                    onClick={() =>
                      handleUpdateClip({
                        motionPath: {
                          ...clip!.motionPath!,
                          endX: instance.x,
                          endY: instance.y,
                        },
                      })
                    }
                  >
                    End at Current (X, Y)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clip Timing & Speed Multiplier */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Start Time (s)</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max={sceneDurationMs / 1000}
              className="ed-input"
              value={clip?.startMs ? clip.startMs / 1000 : 0}
              onChange={(e) =>
                handleUpdateClip({ startMs: Math.round((parseFloat(e.target.value) || 0) * 1000) })
              }
            />
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Duration (s)</span>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max={sceneDurationMs / 1000}
              className="ed-input"
              value={clip?.durationMs ? clip.durationMs / 1000 : sceneDurationMs / 1000}
              onChange={(e) =>
                handleUpdateClip({ durationMs: Math.round((parseFloat(e.target.value) || 1) * 1000) })
              }
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
          <label style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={clip?.loop !== false}
              onChange={(e) => handleUpdateClip({ loop: e.target.checked })}
              style={{ accentColor: 'var(--ed-accent)' }}
            />
            <span>Loop Action Cycle</span>
          </label>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Speed:</span>
            {[0.75, 1.0, 1.5].map((spd) => (
              <button
                key={spd}
                type="button"
                className={`ed-tool-btn ${clip?.speedMultiplier === spd || (!clip?.speedMultiplier && spd === 1.0) ? 'primary' : ''}`}
                style={{ fontSize: '10px', padding: '2px 5px' }}
                onClick={() => handleUpdateClip({ speedMultiplier: spd })}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
