import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SceneDialogue, SpeakingEmotion, FacialExpression, VectorSceneData } from '../../../types/animation';
import { EditorScene, EditorCharacter } from '../../../types/editor';
import {
  getTTSVoices,
  previewVoice,
  SupportedVoice,
  generateSceneDialogueAudio,
  deleteSceneDialogue,
} from '../../../services/editor.service';
import { resolveAssetUrl } from '../../../utils/urlHelper';
import {
  PlayIcon,
  PauseIcon,
  TrashIcon,
  VolumeHighIcon,
  SparklesIcon,
  CheckIcon,
  AlertTriangleIcon,
} from '../../common/Icons';
import {
  EMOTION_OPTIONS,
  EMOTION_TO_FACIAL_EXPRESSION,
  suggestEmotionForText,
} from '../../../utils/emotionSuggester';
import { formatDurationHuman } from '../../../utils/timingEngine';

interface DialogueInspectorProps {
  scene: EditorScene;
  characters: EditorCharacter[];
  selectedDialogueId: string | null;
  onSelectDialogue: (dialogueId: string | null) => void;
  onUpdateDialogue: (dialogueId: string, updates: Partial<SceneDialogue>) => void;
  onDeleteDialogue: (dialogueId: string) => Promise<void>;
  onAddDialogue: (dialogue: SceneDialogue) => void;
  onSaveCharacterDefault?: (characterId: string, settings: { voice?: string; lang?: string; emotion?: SpeakingEmotion; emotionIntensity?: number }) => Promise<void>;
}

export const DialogueInspector: React.FC<DialogueInspectorProps> = ({
  scene,
  characters,
  selectedDialogueId,
  onSelectDialogue,
  onUpdateDialogue,
  onDeleteDialogue,
  onAddDialogue,
  onSaveCharacterDefault,
}) => {
  const dialogues = scene.animationData?.dialogueLines || [];
  const selectedDialogue = dialogues.find((d) => d.id === selectedDialogueId) || null;

  // TTS Voices
  const [ttsVoices, setTtsVoices] = useState<SupportedVoice[]>([]);
  const [isKokoroAvailable, setIsKokoroAvailable] = useState<boolean>(true);

  // Audio Playback
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Voice Preview
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Generation status
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Scope: 'line' | 'char_default'
  const [editScope, setEditScope] = useState<'line' | 'char_default'>('line');

  useEffect(() => {
    getTTSVoices()
      .then((data) => {
        setTtsVoices(data.voices);
        setIsKokoroAvailable(data.isKokoroAvailable);
      })
      .catch((err) => console.warn('Could not load TTS voices in DialogueInspector:', err));
  }, []);

  // Stop playback when dialogue changes
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setIsPlayingAudio(false);
    setErrorMsg(null);
    setSuccessNotice(null);
  }, [selectedDialogueId]);

  // Stale detection
  const isAudioStale = useMemo(() => {
    if (!selectedDialogue?.audioUrl) return false;
    const meta = selectedDialogue.audioMeta;
    if (!meta) return false;
    if (meta.text && meta.text.trim() !== selectedDialogue.text.trim()) return true;
    if (selectedDialogue.voice && meta.voice && meta.voice !== selectedDialogue.voice) return true;
    if (selectedDialogue.emotion && meta.emotion && meta.emotion !== selectedDialogue.emotion) return true;
    if (
      typeof selectedDialogue.emotionIntensity === 'number' &&
      typeof meta.emotionIntensity === 'number' &&
      meta.emotionIntensity !== selectedDialogue.emotionIntensity
    ) return true;
    if (
      typeof selectedDialogue.speed === 'number' &&
      typeof meta.speed === 'number' &&
      meta.speed !== selectedDialogue.speed
    ) return true;
    if (
      typeof selectedDialogue.volume === 'number' &&
      typeof meta.volume === 'number' &&
      meta.volume !== selectedDialogue.volume
    ) return true;
    return false;
  }, [selectedDialogue]);

  // Filter voices by language
  const currentLang = selectedDialogue?.lang || 'hi';
  const filteredVoices = useMemo(() => {
    if (currentLang === 'hi') {
      const hi = ttsVoices.filter(
        (v) => v.lang === 'hi' || v.lang === 'Hindi' || v.id.startsWith('h')
      );
      return hi.length > 0 ? hi : ttsVoices;
    } else {
      const en = ttsVoices.filter(
        (v) => v.lang === 'en' || v.lang === 'English' || v.id.startsWith('a') || v.id.startsWith('b')
      );
      return en.length > 0 ? en : ttsVoices;
    }
  }, [ttsVoices, currentLang]);

  // Audio preview handler
  const handleTogglePlayDialogue = () => {
    if (!selectedDialogue?.audioUrl) return;

    if (isPlayingAudio) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      setIsPlayingAudio(false);
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const audio = new Audio(resolveAssetUrl(selectedDialogue.audioUrl));
      audioPlayerRef.current = audio;
      setIsPlayingAudio(true);
      audio.onended = () => {
        setIsPlayingAudio(false);
        audioPlayerRef.current = null;
      };
      audio.onerror = () => {
        setIsPlayingAudio(false);
        audioPlayerRef.current = null;
        setErrorMsg('Failed to play dialogue audio');
      };
      audio.play().catch(() => {
        setIsPlayingAudio(false);
        audioPlayerRef.current = null;
      });
    }
  };

  // Preview voice sample
  const handlePreviewVoice = async () => {
    const voiceId = selectedDialogue?.voice || (currentLang === 'hi' ? 'hf_alpha' : 'af_heart');
    setIsPreviewingVoice(true);
    try {
      const sampleText = currentLang === 'hi'
        ? (selectedDialogue?.text?.slice(0, 30) || 'नमस्ते! यह मेरी आवाज़ है।')
        : (selectedDialogue?.text?.slice(0, 30) || 'Hello! This is how my voice sounds.');
      const res = await previewVoice({
        voice: voiceId,
        sampleText,
        lang: currentLang,
      });
      if (res?.audioUrl) {
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
        }
        const audio = new Audio(resolveAssetUrl(res.audioUrl));
        previewAudioRef.current = audio;
        setPlayingPreview(true);
        audio.onended = () => setPlayingPreview(false);
        audio.onerror = () => setPlayingPreview(false);
        await audio.play();
      }
    } catch (err: any) {
      console.warn('Voice preview error:', err);
    } finally {
      setIsPreviewingVoice(false);
    }
  };

  // Auto-detect emotion & expression
  const handleAutoDetect = () => {
    if (!selectedDialogue?.text) return;
    const suggestion = suggestEmotionForText(selectedDialogue.text);
    onUpdateDialogue(selectedDialogue.id, {
      emotion: suggestion.emotion,
      facialExpression: suggestion.facialExpression,
    });
    setSuccessNotice(`Auto-detected: ${suggestion.emotion} (${suggestion.rationale})`);
    setTimeout(() => setSuccessNotice(null), 3000);
  };

  // Regenerate / Generate dialogue audio
  const handleGenerateAudio = async () => {
    if (!selectedDialogue) return;
    setIsGenerating(true);
    setErrorMsg(null);
    setSuccessNotice(null);

    try {
      const voice = selectedDialogue.voice || (currentLang === 'hi' ? 'hf_alpha' : 'af_heart');
      const emotion = selectedDialogue.emotion || 'neutral';
      const intensity = typeof selectedDialogue.emotionIntensity === 'number' ? selectedDialogue.emotionIntensity : 60;
      const speed = selectedDialogue.speed || 1.0;
      const volume = typeof selectedDialogue.volume === 'number' ? selectedDialogue.volume : 1.0;

      const res = await generateSceneDialogueAudio(scene.sceneId, {
        characterId: selectedDialogue.characterId,
        characterInstanceId: selectedDialogue.characterInstanceId,
        characterName: selectedDialogue.characterName,
        text: selectedDialogue.text,
        voice,
        emotion,
        emotionIntensity: intensity,
        facialExpression: selectedDialogue.facialExpression,
        speed,
        startMs: selectedDialogue.startMs,
        lang: currentLang,
        volume,
      });

      if (res.success && res.dialogue) {
        onUpdateDialogue(selectedDialogue.id, {
          audioUrl: res.dialogue.audioUrl,
          durationMs: res.dialogue.durationMs,
          visemeCues: res.dialogue.visemeCues,
          audioMeta: res.dialogue.audioMeta,
        });

        // If scope is char_default, also save as default
        if (editScope === 'char_default' && selectedDialogue.characterId && onSaveCharacterDefault) {
          await onSaveCharacterDefault(selectedDialogue.characterId, {
            voice,
            lang: currentLang,
            emotion,
            emotionIntensity: intensity,
          });
        }

        setSuccessNotice('Audio generated & synchronized successfully!');
        setTimeout(() => setSuccessNotice(null), 3500);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to synthesize speech audio');
    } finally {
      setIsGenerating(false);
    }
  };

  // Create a new dialogue line
  const handleAddNewDialogue = () => {
    const charInsts = scene.animationData?.characterInstances || [];
    const firstInst = charInsts[0];
    const charId = firstInst?.characterId || characters[0]?.id || 'sammy_the_kid';
    const charName = firstInst?.name || characters[0]?.name || 'Sammy';

    // Calculate start time after last dialogue line
    const lastDlg = dialogues[dialogues.length - 1];
    const startMs = lastDlg ? (lastDlg.startMs || 0) + (lastDlg.durationMs || 3000) + 200 : 500;

    const newDlg: SceneDialogue = {
      id: `dlg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      characterId: charId,
      characterInstanceId: firstInst?.instanceId,
      characterName: charName,
      text: 'नमस्ते! मैं यहाँ हूँ।',
      startMs,
      durationMs: 3000,
      emotion: 'happy',
      emotionIntensity: 60,
      facialExpression: 'happy',
      lang: 'hi',
      voice: 'hf_alpha',
      speed: 1.0,
      volume: 1.0,
    };

    onAddDialogue(newDlg);
    onSelectDialogue(newDlg.id);
  };

  // If no dialogue selected, show list of all scene dialogues
  if (!selectedDialogue) {
    return (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--ed-text)' }}>
              Scene Dialogue ({dialogues.length})
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--ed-text-muted)' }}>
              Select a dialogue line from the timeline or below to inspect and customize its voice.
            </p>
          </div>
          <button
            type="button"
            className="ed-primary-btn"
            style={{ fontSize: '11px', padding: '6px 12px' }}
            onClick={handleAddNewDialogue}
          >
            + Add Dialogue
          </button>
        </div>

        {dialogues.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px dashed var(--ed-border)',
              borderRadius: '8px',
              color: 'var(--ed-text-muted)',
              fontSize: '12px',
            }}
          >
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>👄</div>
            <div>No character dialogue in this scene yet.</div>
            <div style={{ marginTop: '6px', fontSize: '11px' }}>
              Add a dialogue line to give characters their own voice, emotions, and lip-sync!
            </div>
            <button
              type="button"
              className="ed-tool-btn"
              style={{ marginTop: '12px', marginInline: 'auto' }}
              onClick={handleAddNewDialogue}
            >
              Add First Dialogue Line
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {dialogues.map((dlg, idx) => {
              const hasAudio = Boolean(dlg.audioUrl);
              return (
                <div
                  key={dlg.id}
                  onClick={() => onSelectDialogue(dlg.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: 'var(--ed-surface-elevated)',
                    border: '1px solid var(--ed-border)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#ec4899')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--ed-border)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px' }}>👄</span>
                      <strong style={{ fontSize: '12px', color: '#fbcfe8' }}>{dlg.characterName}</strong>
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: dlg.lang === 'hi' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          color: dlg.lang === 'hi' ? '#fdba74' : '#93c5fd',
                          fontWeight: 600,
                        }}
                      >
                        {dlg.lang === 'hi' ? 'HINDI' : 'ENGLISH'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          color: hasAudio ? '#34d399' : '#94a3b8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        {hasAudio ? '🔊 Audio Ready' : '🔇 No Audio'}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--ed-text)',
                      fontStyle: 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    "{dlg.text}"
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--ed-text-muted)', fontFamily: 'monospace' }}>
                    Offset: +{((dlg.startMs || 0) / 1000).toFixed(1)}s | Duration: {(((dlg.durationMs || 3000) / 1000)).toFixed(1)}s
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header with Back button and Delete */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ed-border)', paddingBottom: '10px' }}>
        <button
          type="button"
          className="ed-tool-btn"
          style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          onClick={() => onSelectDialogue(null)}
        >
          ← All Dialogue ({dialogues.length})
        </button>
        <button
          type="button"
          className="ed-tool-btn danger"
          style={{ fontSize: '11px', color: '#ef4444' }}
          onClick={async () => {
            if (confirm(`Delete dialogue line for ${selectedDialogue.characterName}?`)) {
              await onDeleteDialogue(selectedDialogue.id);
              onSelectDialogue(null);
            }
          }}
          title="Delete this dialogue line"
        >
          <TrashIcon size={12} />
          <span>Delete</span>
        </button>
      </div>

      {/* Speaker Identity Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          background: 'rgba(236, 72, 153, 0.08)',
          border: '1px solid rgba(236, 72, 153, 0.25)',
          borderRadius: '8px',
        }}
      >
        <div style={{ fontSize: '24px' }}>
          {selectedDialogue.characterId?.includes('earth')
            ? '🌍'
            : selectedDialogue.characterId?.includes('bear') || selectedDialogue.characterId?.includes('pip')
            ? '🐻'
            : '🧒'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#fbcfe8' }}>
            {selectedDialogue.characterName}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>
            Character Audio & Speaking Expression
          </div>
        </div>
        {/* Audio Status Pill */}
        <div>
          {selectedDialogue.audioUrl ? (
            isAudioStale ? (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Settings have changed since this audio was synthesized. Click Regenerate to update."
              >
                <AlertTriangleIcon size={10} color="#fbbf24" />
                <span>Audio Out of Date</span>
              </span>
            ) : (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  background: 'rgba(52, 211, 153, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(52, 211, 153, 0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckIcon size={10} color="#34d399" />
                <span>Audio Ready</span>
              </span>
            )
          ) : (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '12px',
                background: 'rgba(148, 163, 184, 0.12)',
                color: '#94a3b8',
                border: '1px solid rgba(148, 163, 184, 0.25)',
              }}
            >
              No Audio Yet
            </span>
          )}
        </div>
      </div>

      {/* Scope Selector */}
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', marginBottom: '6px', display: 'block' }}>
          Apply Voice Settings Scope
        </label>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--ed-bg)', padding: '2px', borderRadius: '6px' }}>
          <button
            type="button"
            className="ed-tool-btn"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '10px',
              background: editScope === 'line' ? 'var(--ed-surface-elevated)' : 'transparent',
              color: editScope === 'line' ? 'var(--ed-text)' : 'var(--ed-text-muted)',
              fontWeight: editScope === 'line' ? 600 : 400,
            }}
            onClick={() => setEditScope('line')}
            title="Changes apply exclusively to this dialogue line"
          >
            This Line Only
          </button>
          <button
            type="button"
            className="ed-tool-btn"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '10px',
              background: editScope === 'char_default' ? 'var(--ed-surface-elevated)' : 'transparent',
              color: editScope === 'char_default' ? '#a78bfa' : 'var(--ed-text-muted)',
              fontWeight: editScope === 'char_default' ? 600 : 400,
            }}
            onClick={() => setEditScope('char_default')}
            title="Save chosen voice and language as the default for this character across the story"
          >
            Character Default
          </button>
        </div>
      </div>

      {/* Dialogue Text Input */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text)' }}>
            Dialogue Spoken Text
          </label>
          <button
            type="button"
            className="ed-tool-btn"
            style={{ fontSize: '10px', padding: '2px 8px', color: '#a78bfa' }}
            onClick={handleAutoDetect}
            title="Analyze spoken text to automatically set speaking emotion and facial expression"
          >
            <SparklesIcon size={10} color="#a78bfa" />
            <span>Auto Emotion</span>
          </button>
        </div>
        <textarea
          className="ed-textarea"
          rows={3}
          value={selectedDialogue.text}
          onChange={(e) => onUpdateDialogue(selectedDialogue.id, { text: e.target.value })}
          placeholder="Enter what the character says..."
          style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px' }}
        />
      </div>

      {/* Language & Voice Selection */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', display: 'block', marginBottom: '4px' }}>
            Language
          </label>
          <select
            className="ed-select"
            value={currentLang}
            onChange={(e) => {
              const lang = e.target.value;
              const defaultVoice = lang === 'hi' ? 'hf_alpha' : 'af_heart';
              onUpdateDialogue(selectedDialogue.id, { lang, voice: defaultVoice });
            }}
            style={{ width: '100%', fontSize: '11px' }}
          >
            <option value="hi">🇮🇳 Hindi (Default)</option>
            <option value="en">🇬🇧 English</option>
          </select>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)' }}>
              Kokoro Voice
            </label>
            <button
              type="button"
              className="ed-tool-btn"
              style={{ fontSize: '10px', padding: '1px 6px' }}
              onClick={handlePreviewVoice}
              disabled={isPreviewingVoice || playingPreview}
              title="Audition voice sample"
            >
              {playingPreview ? 'Playing...' : 'Audition'}
            </button>
          </div>
          <select
            className="ed-select"
            value={selectedDialogue.voice || (currentLang === 'hi' ? 'hf_alpha' : 'af_heart')}
            onChange={(e) => onUpdateDialogue(selectedDialogue.id, { voice: e.target.value })}
            style={{ width: '100%', fontSize: '11px' }}
          >
            {filteredVoices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.gender || 'voice'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Speaking Emotion and Intensity Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', display: 'block', marginBottom: '4px' }}>
              Speaking Emotion
            </label>
            <select
              className="ed-select"
              value={selectedDialogue.emotion || 'neutral'}
              onChange={(e) => {
                const emo = e.target.value as SpeakingEmotion;
                const expr = EMOTION_TO_FACIAL_EXPRESSION[emo] || 'neutral';
                onUpdateDialogue(selectedDialogue.id, {
                  emotion: emo,
                  facialExpression: expr,
                  emotionIntensity: typeof selectedDialogue.emotionIntensity === 'number' && selectedDialogue.emotionIntensity > 0 ? selectedDialogue.emotionIntensity : 60,
                });
              }}
              style={{ width: '100%', fontSize: '11px' }}
            >
              {EMOTION_OPTIONS.map((emo) => (
                <option key={emo.id} value={emo.id}>
                  {emo.emoji} {emo.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', display: 'block', marginBottom: '4px' }}>
              Facial Expression
            </label>
            <select
              className="ed-select"
              value={selectedDialogue.facialExpression || 'neutral'}
              onChange={(e) => onUpdateDialogue(selectedDialogue.id, { facialExpression: e.target.value as FacialExpression })}
              style={{ width: '100%', fontSize: '11px' }}
            >
              <option value="neutral">😐 Neutral</option>
              <option value="happy">😊 Happy</option>
              <option value="sad">😢 Sad</option>
              <option value="angry">😠 Angry</option>
              <option value="surprised">😲 Surprised</option>
              <option value="scared">😨 Scared</option>
              <option value="confused">🤨 Confused</option>
              <option value="curious">🤔 Curious</option>
            </select>
          </div>
        </div>

        {/* Emotion Intensity Slider (0% to 100%) */}
        <div style={{ background: 'var(--ed-bg)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--ed-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text)' }}>
              Emotion Intensity
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#f43f5e', fontFamily: 'monospace' }}>
              {selectedDialogue.emotionIntensity ?? 60}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={selectedDialogue.emotionIntensity ?? 60}
            onChange={(e) => onUpdateDialogue(selectedDialogue.id, { emotionIntensity: parseInt(e.target.value, 10) })}
            style={{ width: '100%', accentColor: '#f43f5e' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--ed-text-muted)', marginTop: '2px' }}>
            <span>0% (Subtle)</span>
            <span>50% (Moderate)</span>
            <span>100% (Strong)</span>
          </div>
        </div>
      </div>

      {/* Speed & Per-Dialogue Volume Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ background: 'var(--ed-bg)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--ed-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text)' }}>
              Speech Speed
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
              {(selectedDialogue.speed ?? 1.0).toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={selectedDialogue.speed ?? 1.0}
            onChange={(e) => onUpdateDialogue(selectedDialogue.id, { speed: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#38bdf8' }}
          />
        </div>

        <div style={{ background: 'var(--ed-bg)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--ed-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <VolumeHighIcon size={12} />
              <span>Volume</span>
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', fontFamily: 'monospace' }}>
              {Math.round((selectedDialogue.volume ?? 1.0) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={selectedDialogue.volume ?? 1.0}
            onChange={(e) => onUpdateDialogue(selectedDialogue.id, { volume: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#34d399' }}
          />
        </div>
      </div>

      {/* Timing within scene */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', display: 'block', marginBottom: '4px' }}>
            Start Offset (seconds)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={((selectedDialogue.startMs || 0) / 1000).toFixed(1)}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                onUpdateDialogue(selectedDialogue.id, { startMs: Math.max(0, Math.round(val * 1000)) });
              }
            }}
            className="ed-input"
            style={{ width: '100%', fontSize: '11px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', display: 'block', marginBottom: '4px' }}>
            Duration (seconds)
          </label>
          <input
            type="number"
            step="0.1"
            min="0.5"
            value={(((selectedDialogue.durationMs || 3000)) / 1000).toFixed(1)}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                onUpdateDialogue(selectedDialogue.id, { durationMs: Math.max(500, Math.round(val * 1000)) });
              }
            }}
            className="ed-input"
            style={{ width: '100%', fontSize: '11px' }}
          />
        </div>
      </div>

      {/* Notices & Errors */}
      {successNotice && (
        <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.35)', color: '#34d399', fontSize: '11px' }}>
          ✓ {successNotice}
        </div>
      )}
      {errorMsg && (
        <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#fca5a5', fontSize: '11px' }}>
          ⚠ {errorMsg}
        </div>
      )}

      {/* Actions: Preview Spoken Audio & Generate Audio */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          type="button"
          className="ed-tool-btn"
          style={{ flex: 1, justifyContent: 'center', height: '36px', fontSize: '11px' }}
          onClick={handleTogglePlayDialogue}
          disabled={!selectedDialogue.audioUrl}
          title={selectedDialogue.audioUrl ? 'Play or pause generated dialogue audio' : 'Synthesize audio first'}
        >
          {isPlayingAudio ? (
            <>
              <PauseIcon size={12} />
              <span>Pause Audio</span>
            </>
          ) : (
            <>
              <PlayIcon size={12} />
              <span>Preview Audio</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="ed-primary-btn"
          style={{
            flex: 1.3,
            justifyContent: 'center',
            height: '36px',
            fontSize: '11px',
            background: isAudioStale ? '#f59e0b' : '#ec4899',
            borderColor: isAudioStale ? '#d97706' : '#db2777',
          }}
          onClick={handleGenerateAudio}
          disabled={isGenerating || !selectedDialogue.text.trim()}
          title="Synthesize Kokoro speech audio and update lip-sync visemes"
        >
          {isGenerating ? (
            <span>Synthesizing...</span>
          ) : isAudioStale ? (
            <>
              <SparklesIcon size={12} />
              <span>Regenerate Speech</span>
            </>
          ) : selectedDialogue.audioUrl ? (
            <>
              <SparklesIcon size={12} />
              <span>Regenerate Speech</span>
            </>
          ) : (
            <>
              <SparklesIcon size={12} />
              <span>Generate Speech</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

