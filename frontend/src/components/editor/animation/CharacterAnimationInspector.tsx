import React, { useState, useEffect, useRef } from 'react';
import {
  CharacterInstance,
  AnimationClip,
  VectorSceneData,
  AnimationActionType,
  MotionPath,
  FacialExpression,
  SpeakingDirection,
  ExpressionCue,
  SceneDialogue,
  CharacterVoiceConfig,
} from '../../../types/animation';
import { EditorCharacter } from '../../../types/editor';
import { getVectorRig } from '../../../assets/characters/defaultCharacters';
import { TrashIcon, CheckIcon, PlayIcon, PauseIcon, SparklesIcon, MicIcon } from '../../common/Icons';
import { resolveAssetUrl } from '../../../utils/urlHelper';
import {
  generateSceneDialogueAudio,
  deleteSceneDialogue,
  previewVoice,
} from '../../../services/editor.service';
import {
  updateCharacterVoice,
  getCharacterVoice,
} from '../../../services/character.service';

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

const KOKORO_VOICES = [
  {
    group: 'American Female',
    voices: [
      { id: 'af_heart', name: 'Heart (Warm & Engaging)' },
      { id: 'af_bella', name: 'Bella (Friendly & Playful)' },
      { id: 'af_nicole', name: 'Nicole (Soft & Gentle)' },
      { id: 'af_sarah', name: 'Sarah (Clear Storyteller)' },
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
    voices: [
      { id: 'bf_alice', name: 'Alice (Refined & Pleasant)' },
      { id: 'bf_emma', name: 'Emma (Warm English Accent)' },
      { id: 'bf_isabella', name: 'Isabella (Clear & Articulate)' },
      { id: 'bf_lily', name: 'Lily (Sweet & Gentle)' },
    ],
  },
  {
    group: 'British Male',
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
  // Character Voice Settings (Kokoro-82M)
  // -------------------------------------------------------------
  // Find matching character in story/catalogue
  const matchedChar = characters.find((c) => c.id === instance.characterId);
  const initialVoiceConfig: CharacterVoiceConfig =
    matchedChar?.canonicalAppearance?.voiceConfig ||
    instance.appearance?.voiceConfig || {
      voiceId: instance.characterId === 'pip_the_bear' ? 'bm_george' : 'af_heart',
      speed: 1.0,
      style: 'calm',
      effect: 'normal',
    };

  const [voiceId, setVoiceId] = useState<string>(initialVoiceConfig.voiceId || 'af_heart');
  const [voiceSpeed, setVoiceSpeed] = useState<number>(initialVoiceConfig.speed || 1.0);
  const [voiceStyle, setVoiceStyle] = useState<SpeakingDirection>(initialVoiceConfig.style || 'calm');
  const [voiceEffect, setVoiceEffect] = useState<'normal' | 'cartoon' | 'robot'>(
    initialVoiceConfig.effect || 'normal'
  );

  const [isSavingVoice, setIsSavingVoice] = useState<boolean>(false);
  const [voiceSavedMsg, setVoiceSavedMsg] = useState<string | null>(null);
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);

  // Sync state when instance or matchedChar changes
  useEffect(() => {
    const config =
      matchedChar?.canonicalAppearance?.voiceConfig ||
      instance.appearance?.voiceConfig;
    if (config) {
      if (config.voiceId) setVoiceId(config.voiceId);
      if (config.speed) setVoiceSpeed(config.speed);
      if (config.style) setVoiceStyle(config.style);
      if (config.effect) setVoiceEffect(config.effect);
    }
  }, [instance.characterId, matchedChar]);

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
      const sampleText = `Hello! I am ${instance.name || 'your friend'}, ready for an amazing story adventure!`;
      const res = await previewVoice({
        voice: voiceId,
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
      voiceId,
      speed: voiceSpeed,
      style: voiceStyle,
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

      setVoiceSavedMsg('Default voice saved!');
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
      d.characterName === instance.name
  );

  const [newDialogueText, setNewDialogueText] = useState<string>('');
  const [newDialogueDirection, setNewDialogueDirection] = useState<SpeakingDirection>(voiceStyle || 'cheerful');
  const [newDialogueStartSec, setNewDialogueStartSec] = useState<number>(0);
  const [isGeneratingDialogue, setIsGeneratingDialogue] = useState<boolean>(false);
  const [dialogueError, setDialogueError] = useState<string | null>(null);
  const [activeDialogueAudioId, setActiveDialogueAudioId] = useState<string | null>(null);
  const dialogueAudioRef = useRef<HTMLAudioElement | null>(null);

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
        voice: voiceId,
        speakingDirection: newDialogueDirection,
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
      </div>

      {/* 3. Character Default Voice Settings (Kokoro-82M) */}
      <div className="ed-inspector-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label className="ed-field-label" style={{ margin: 0 }}>Default Character Voice</label>
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
          <div>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Assigned Voice (27 Styles)</span>
            <select
              className="ed-select"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
            >
              {KOKORO_VOICES.map((grp) => (
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Speaking Direction</span>
              <select
                className="ed-select"
                value={voiceStyle}
                onChange={(e) => setVoiceStyle(e.target.value as SpeakingDirection)}
                style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
              >
                {SPEAKING_DIRECTIONS.map((dir) => (
                  <option key={dir.id} value={dir.id}>
                    {dir.emoji} {dir.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>Voice Effect</span>
              <select
                className="ed-select"
                value={voiceEffect}
                onChange={(e) => setVoiceEffect(e.target.value as any)}
                style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
              >
                <option value="normal">Normal (Natural)</option>
                <option value="cartoon">Cartoon (Playful)</option>
                <option value="robot">Robot (Toy)</option>
              </select>
            </div>
          </div>

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
              onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button
              type="button"
              className="ed-tool-btn"
              onClick={handleAuditionVoice}
              style={{ flex: 1, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              {isAuditioning ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
              <span>{isAuditioning ? 'Stop Audition' : 'Audition Voice'}</span>
            </button>
            <button
              type="button"
              className="ed-tool-btn primary"
              onClick={handleSaveDefaultVoice}
              disabled={isSavingVoice}
              style={{ flex: 1, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              <CheckIcon size={12} />
              <span>{isSavingVoice ? 'Saving...' : 'Save As Default'}</span>
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
          <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
            {characterDialogues.length} line{characterDialogues.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Existing Dialogue Lines */}
        {characterDialogues.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
            {characterDialogues.map((dlg) => {
              const isPlaying = activeDialogueAudioId === dlg.id;
              const visemeCount = dlg.visemeCues?.length || 0;
              const startSec = (dlg.startMs / 1000).toFixed(1);
              const durSec = (dlg.durationMs / 1000).toFixed(1);

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ textTransform: 'capitalize', color: '#c4b5fd', fontWeight: 600 }}>
                        {dlg.speakingDirection || 'calm'}
                      </span>
                      <span>•</span>
                      <span>{startSec}s - {(Number(startSec) + Number(durSec)).toFixed(1)}s</span>
                      <span>({durSec}s)</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {visemeCount > 0 ? (
                        <span
                          style={{
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            fontWeight: 600,
                          }}
                        >
                          👄 {visemeCount} visemes
                        </span>
                      ) : (
                        <span style={{ color: '#f59e0b' }}>No visemes</span>
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
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text)' }}>
            + Add Character Dialogue
          </span>

          <textarea
            className="ed-input"
            rows={2}
            placeholder={`What does ${instance.name || 'this character'} say?`}
            value={newDialogueText}
            onChange={(e) => setNewDialogueText(e.target.value)}
            style={{ fontSize: '11px', resize: 'vertical' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>Emotion / Direction</span>
              <select
                className="ed-select"
                value={newDialogueDirection}
                onChange={(e) => setNewDialogueDirection(e.target.value as SpeakingDirection)}
                style={{ width: '100%', fontSize: '11px', marginTop: '2px' }}
              >
                {SPEAKING_DIRECTIONS.map((dir) => (
                  <option key={dir.id} value={dir.id}>
                    {dir.emoji} {dir.label}
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
