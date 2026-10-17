import React, { useState, useEffect } from 'react';
import { EditorScene, EditorCharacter, SceneVersionItem } from '../../types/editor';
import {
  estimateSpeechDurationMs,
  validateSceneTiming,
  formatDurationHuman,
  formatTimeMs,
} from '../../utils/timingEngine';
import { resolveAssetUrl } from '../../utils/urlHelper';
import { CharacterInstance, VectorSceneData } from '../../types/animation';
import { CharacterAnimationInspector } from './animation/CharacterAnimationInspector';
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
} from '../common/Icons';

interface PropertiesInspectorProps {
  scene: EditorScene | null;
  characters: EditorCharacter[];
  playheadMs: number;
  onUpdateScene: (sceneId: string, updates: Partial<EditorScene>) => void;
  onGenerateImage: (sceneId: string, promptOverride?: string) => Promise<void>;
  onGenerateVoice: (sceneId: string) => Promise<void>;
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
}

export const PropertiesInspector: React.FC<PropertiesInspectorProps> = ({
  scene,
  characters,
  playheadMs,
  onUpdateScene,
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


  const durationMs = scene.endMs > scene.startMs ? scene.endMs - scene.startMs : scene.estimatedDurationMs || 5000;
  const timingValidation = validateSceneTiming(scene);
  const estimatedSpeechMs = estimateSpeechDurationMs(localNarration);

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

  const handleDurationStep = (deltaSec: number) => {
    const newDur = Math.max(1500, durationMs + deltaSec * 1000);
    onUpdateScene(scene.sceneId, {
      endMs: scene.startMs + newDur,
      estimatedDurationMs: newDur,
    });
  };

  const handleFitToVoice = () => {
    if (scene.actualAudioDurationMs) {
      const newDur = Math.max(1500, scene.actualAudioDurationMs + 500); // 500ms safety pad
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

  const dialogueList: Array<{ speaker: string; text: string }> =
    scene.dialogue || (scene.animationData?.dialogue as any) || [];
  const actionList: Array<{ characterName: string; action: string; pose?: string }> =
    scene.characterActions || (scene.animationData?.characterActions as any) || [];

  const handleUpdateDialogue = (newDialogue: Array<{ speaker: string; text: string }>) => {
    const updatedAnimationData = scene.animationData
      ? { ...scene.animationData, dialogue: newDialogue }
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

  const canSplitAtPlayhead =
    playheadMs > scene.startMs + 500 && playheadMs < scene.endMs - 500;

  const [activeInspectorTab, setActiveInspectorTab] = useState<'scene' | 'animation'>('scene');

  useEffect(() => {
    if (selectedInstanceId) {
      setActiveInspectorTab('animation');
    }
  }, [selectedInstanceId]);

  const characterInstances = scene.animationData?.characterInstances || [];
  const selectedCharacterInstance = characterInstances.find((i) => i.instanceId === selectedInstanceId) || null;

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
            <span>2D Animation ({characterInstances.length})</span>
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

          {/* Duration Adjust Stepper */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button className="ed-tool-btn" onClick={() => handleDurationStep(-1)}>
              -1s
            </button>
            <button className="ed-tool-btn" onClick={() => handleDurationStep(1)}>
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>
              {scene.actualAudioDurationMs
                ? `Actual voice: ${formatDurationHuman(scene.actualAudioDurationMs)}`
                : 'No audio generated'}
            </span>
            <button
              className="ed-btn-action primary"
              style={{ fontSize: '11px', padding: '6px 10px' }}
              onClick={() => onGenerateVoice(scene.sceneId)}
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
                  onClick={() => onGenerateVoice(scene.sceneId)}
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
            <button
              type="button"
              className="ed-tool-btn primary"
              style={{ fontSize: '10px', padding: '2px 6px' }}
              onClick={() => {
                const defaultSpeaker = characters[0]?.name || (characterInstances[0]?.name) || 'Narrator';
                handleUpdateDialogue([...dialogueList, { speaker: defaultSpeaker, text: '' }]);
              }}
            >
              + Add Line
            </button>
          </div>

          {dialogueList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {dialogueList.map((dlg, idx) => (
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
                </div>
              ))}
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
    </aside>
  );
};

