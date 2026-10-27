import React from 'react';
import {
  DraftStoryboardResult,
  DraftStoryboardScene,
  DraftDialogueLine,
  DraftOverlayItem,
} from '../../types/editor';
import {
  SparklesIcon,
  TrashIcon,
  PlusIcon,
  CheckIcon,
  ArrowLeftIcon,
  AlertTriangleIcon,
} from '../common/Icons';

export interface StoryboardReviewScreenProps {
  draft: DraftStoryboardResult;
  onChange: (updatedDraft: DraftStoryboardResult) => void;
  onCreateStory: () => void;
  isCreating: boolean;
  onBackToInput: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  mode: 'ai' | 'import';
}

const AVAILABLE_OVERLAY_TYPES = [
  { type: 'sunshine_rays', label: 'Sunshine Rays', color: '#fef08a' },
  { type: 'heat_shimmer', label: 'Heat Shimmer', color: '#fde047' },
  { type: 'rain', label: 'Rain', color: '#38bdf8' },
  { type: 'moving_clouds', label: 'Moving Clouds', color: '#e2e8f0' },
  { type: 'water_splashes', label: 'Water Splashes', color: '#7dd3fc' },
  { type: 'snowfall', label: 'Snowfall', color: '#f8fafc' },
  { type: 'fog_mist', label: 'Fog & Mist', color: '#f1f5f9' },
  { type: 'falling_leaves', label: 'Falling Leaves', color: '#f97316' },
  { type: 'flying_birds', label: 'Flying Birds', color: '#334155' },
  { type: 'butterflies', label: 'Butterflies', color: '#f43f5e' },
];

export const StoryboardReviewScreen: React.FC<StoryboardReviewScreenProps> = ({
  draft,
  onChange,
  onCreateStory,
  isCreating,
  onBackToInput,
  onRegenerate,
  isRegenerating = false,
  mode,
}) => {
  const totalCalculatedDuration = draft.scenes.reduce(
    (acc, sc) => acc + (sc.durationSeconds || 10),
    0
  );
  const isDurationOverTarget =
    draft.targetDurationSeconds > 0 &&
    totalCalculatedDuration > draft.targetDurationSeconds * 1.25;

  const handleUpdateTitle = (val: string) => {
    onChange({ ...draft, title: val });
  };

  const handleUpdateScene = (index: number, updatedScene: DraftStoryboardScene) => {
    const updatedScenes = [...draft.scenes];
    updatedScenes[index] = updatedScene;
    onChange({ ...draft, scenes: updatedScenes });
  };

  const handleDeleteScene = (index: number) => {
    if (draft.scenes.length <= 1) return;
    const updatedScenes = draft.scenes
      .filter((_, i) => i !== index)
      .map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    onChange({ ...draft, scenes: updatedScenes });
  };

  const handleMoveScene = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= draft.scenes.length) return;

    const updated = [...draft.scenes];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    const renumbered = updated.map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    onChange({ ...draft, scenes: renumbered });
  };

  const handleAddScene = () => {
    const newSceneNum = draft.scenes.length + 1;
    const defaultSpeaker = draft.characters[0]?.name || 'Earth';
    const isHindi = (draft.language || 'Hindi').toLowerCase().includes('hindi');
    const defaultVoice = isHindi ? 'hf_alpha' : 'af_heart';

    const newScene: DraftStoryboardScene = {
      sceneNumber: newSceneNum,
      title: `Scene ${newSceneNum}: New Adventure`,
      durationSeconds: 15,
      visualPrompt: 'A scenic and colorful background with gentle lighting.',
      narration: isHindi
        ? 'यहाँ कहानी का नया दृश्य शुरू होता है।'
        : 'Here the new scene unfolds with wonder and excitement.',
      dialogue: [
        {
          id: `diag-${Date.now()}`,
          characterName: defaultSpeaker,
          characterId: draft.characters[0]?.id,
          text: isHindi
            ? 'चलो दोस्तों, आगे बढ़ते हैं!'
            : "Let's explore together, friends!",
          emotion: 'cheerful',
          voice: defaultVoice,
        },
      ],
      characterActions: [{ characterName: defaultSpeaker, action: 'wave' }],
      suggestedOverlays: [],
    };

    onChange({ ...draft, scenes: [...draft.scenes, newScene] });
  };

  const handleAddDialogue = (sceneIdx: number) => {
    const scene = draft.scenes[sceneIdx];
    const defaultSpeaker = draft.characters[0]?.name || 'Earth';
    const isHindi = (draft.language || 'Hindi').toLowerCase().includes('hindi');
    const defaultVoice = isHindi ? 'hf_alpha' : 'af_heart';

    const newLine: DraftDialogueLine = {
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      characterName: defaultSpeaker,
      characterId: draft.characters[0]?.id,
      text: '',
      emotion: 'cheerful',
      voice: defaultVoice,
    };

    handleUpdateScene(sceneIdx, {
      ...scene,
      dialogue: [...scene.dialogue, newLine],
    });
  };

  const handleUpdateDialogue = (
    sceneIdx: number,
    diagIdx: number,
    field: keyof DraftDialogueLine,
    val: string
  ) => {
    const scene = draft.scenes[sceneIdx];
    const updatedDiag = [...scene.dialogue];
    updatedDiag[diagIdx] = {
      ...updatedDiag[diagIdx],
      [field]: val,
    };

    // If speaker changed, auto-suggest voice
    if (field === 'characterName') {
      const lower = val.toLowerCase();
      const isHindi = (draft.language || 'Hindi').toLowerCase().includes('hindi');
      if (lower.includes('earth') || val.includes('पृथ्वी')) {
        updatedDiag[diagIdx].voice = isHindi ? 'hf_alpha' : 'bm_daniel';
      }
    }

    handleUpdateScene(sceneIdx, { ...scene, dialogue: updatedDiag });
  };

  const handleDeleteDialogue = (sceneIdx: number, diagIdx: number) => {
    const scene = draft.scenes[sceneIdx];
    const updatedDiag = scene.dialogue.filter((_, i) => i !== diagIdx);
    handleUpdateScene(sceneIdx, { ...scene, dialogue: updatedDiag });
  };

  const handleAddOverlay = (sceneIdx: number, type: string) => {
    const scene = draft.scenes[sceneIdx];
    const found = AVAILABLE_OVERLAY_TYPES.find((t) => t.type === type);
    if (!found) return;

    if (scene.suggestedOverlays.some((o) => o.type === type)) return;

    const newOverlay: DraftOverlayItem = {
      id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: found.type,
      label: found.label,
      color: found.color,
    };

    handleUpdateScene(sceneIdx, {
      ...scene,
      suggestedOverlays: [...scene.suggestedOverlays, newOverlay],
    });
  };

  const handleRemoveOverlay = (sceneIdx: number, overlayId: string) => {
    const scene = draft.scenes[sceneIdx];
    const filtered = scene.suggestedOverlays.filter((o) => o.id !== overlayId);
    handleUpdateScene(sceneIdx, { ...scene, suggestedOverlays: filtered });
  };

  return (
    <div className="storyboard-review-container" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Top Banner & Metadata */}
      <div
        style={{
          background: 'var(--ed-surface, #111827)',
          border: '1px solid var(--ed-border, #1f293d)',
          borderRadius: '12px',
          padding: '20px 24px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'var(--ed-accent-soft, rgba(139, 92, 246, 0.16))',
                color: 'var(--ed-accent, #8b5cf6)',
                border: '1px solid var(--ed-accent, #8b5cf6)',
              }}
            >
              Storyboard Review
            </span>
            <span style={{ fontSize: '12px', color: 'var(--ed-text-muted, #94a3b8)' }}>
              Review, edit, and fine-tune each scene before opening in the studio editor.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '20px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                fontWeight: 600,
              }}
            >
              🌐 {draft.language || 'Hindi'}
            </span>
            <span
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '20px',
                background: 'var(--ed-surface-elevated, #162035)',
                color: 'var(--ed-text, #f8fafc)',
                fontWeight: 600,
              }}
            >
              ⏱️ Total Duration: {totalCalculatedDuration}s (Target: {draft.targetDurationSeconds}s)
            </span>
          </div>
        </div>

        {isDurationOverTarget && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid #f59e0b',
              color: '#fbbf24',
              fontSize: '12px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangleIcon size={16} />
            <span>
              <strong>Duration Notice:</strong> Total scene duration ({totalCalculatedDuration}s) is longer than your target video duration ({draft.targetDurationSeconds}s). You can adjust individual scene durations below.
            </span>
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted, #94a3b8)', marginBottom: '4px' }}>
            Story Title
          </label>
          <input
            type="text"
            className="ed-details-input"
            style={{ width: '100%', fontSize: '16px', fontWeight: 600 }}
            value={draft.title}
            onChange={(e) => handleUpdateTitle(e.target.value)}
            placeholder="Story Title"
          />
        </div>

        {/* Cast Chips */}
        {draft.characters && draft.characters.length > 0 && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted, #94a3b8)', marginBottom: '6px' }}>
              Cast of Characters
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {draft.characters.map((char) => {
                const isEarth = char.name?.toLowerCase().includes('earth') || char.name?.includes('पृथ्वी');
                return (
                  <div
                    key={char.name}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 12px',
                      borderRadius: '20px',
                      background: isEarth ? 'rgba(139, 92, 246, 0.15)' : 'var(--ed-surface-elevated, #162035)',
                      border: `1px solid ${isEarth ? '#8b5cf6' : 'var(--ed-border, #1f293d)'}`,
                      fontSize: '12px',
                      color: isEarth ? '#c084fc' : 'var(--ed-text, #f8fafc)',
                    }}
                  >
                    <span>{isEarth ? '🌍' : '👤'}</span>
                    <strong>{char.name}</strong>
                    <span style={{ fontSize: '11px', opacity: 0.8 }}>
                      ({char.voice === 'hf_alpha' ? 'Female Hindi Voice (hf_alpha)' : char.voice || 'Default Voice'})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Action Bar (Top) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBackToInput}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeftIcon size={14} />
          <span>Back to {mode === 'ai' ? 'Story Prompt' : 'Script Editor'}</span>
        </button>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {mode === 'ai' && onRegenerate && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRegenerate}
              disabled={isRegenerating || isCreating}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#c084fc' }}
            >
              <SparklesIcon size={14} />
              <span>{isRegenerating ? 'Regenerating...' : 'Regenerate Story (AI)'}</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleAddScene}
            disabled={isCreating}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <PlusIcon size={14} />
            <span>Add Scene</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onCreateStory}
            disabled={isCreating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              fontWeight: 600,
              fontSize: '14px',
              borderRadius: '8px',
            }}
          >
            <CheckIcon size={16} />
            <span>{isCreating ? 'Creating Storyboard...' : 'Create Story & Open in Editor'}</span>
          </button>
        </div>
      </div>

      {/* Sequential Scene Cards Stack */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {draft.scenes.map((scene, sceneIdx) => (
          <div
            key={scene.sceneNumber || sceneIdx}
            style={{
              background: 'var(--ed-surface, #111827)',
              border: '1px solid var(--ed-border, #1f293d)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {/* Scene Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '14px',
                borderBottom: '1px solid var(--ed-border, #1f293d)',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
                <span
                  style={{
                    background: 'var(--ed-accent-soft, rgba(139, 92, 246, 0.2))',
                    color: 'var(--ed-accent, #c084fc)',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    flexShrink: 0,
                  }}
                >
                  Scene {scene.sceneNumber}
                </span>
                <input
                  type="text"
                  className="ed-details-input"
                  style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}
                  value={scene.title}
                  onChange={(e) =>
                    handleUpdateScene(sceneIdx, { ...scene, title: e.target.value })
                  }
                  placeholder={`Scene ${scene.sceneNumber} Title`}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)', fontWeight: 600 }}>
                    Duration:
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="120"
                    className="ed-details-input"
                    style={{ width: '65px', textAlign: 'center', padding: '4px 6px' }}
                    value={scene.durationSeconds || 10}
                    onChange={(e) =>
                      handleUpdateScene(sceneIdx, {
                        ...scene,
                        durationSeconds: Math.max(1, parseInt(e.target.value, 10) || 10),
                      })
                    }
                  />
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)' }}>s</span>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleMoveScene(sceneIdx, 'up')}
                    disabled={sceneIdx === 0}
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                    title="Move Scene Up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleMoveScene(sceneIdx, 'down')}
                    disabled={sceneIdx === draft.scenes.length - 1}
                    style={{ padding: '4px 8px', fontSize: '11px' }}
                    title="Move Scene Down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDeleteScene(sceneIdx)}
                    disabled={draft.scenes.length <= 1}
                    style={{ padding: '4px 8px', color: '#ef4444' }}
                    title="Delete Scene"
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* Visual Description & Prompt */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted, #94a3b8)', marginBottom: '4px' }}>
                🎨 Visual Background & Prompt (used to generate scene artwork)
              </label>
              <textarea
                className="ed-details-textarea"
                style={{ width: '100%', minHeight: '55px', fontSize: '13px' }}
                value={scene.visualPrompt}
                onChange={(e) =>
                  handleUpdateScene(sceneIdx, { ...scene, visualPrompt: e.target.value })
                }
                placeholder="Describe setting, lighting, landscape, and props..."
              />
            </div>

            {/* Voice-Over Narration */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#10b981', marginBottom: '4px' }}>
                🎙️ Voice-Over Narration (Narrator audio track — separate from character speech)
              </label>
              <textarea
                className="ed-details-textarea"
                style={{
                  width: '100%',
                  minHeight: '60px',
                  fontSize: '13px',
                  borderColor: 'rgba(16, 185, 129, 0.4)',
                  background: 'rgba(16, 185, 129, 0.04)',
                }}
                value={scene.narration}
                onChange={(e) =>
                  handleUpdateScene(sceneIdx, { ...scene, narration: e.target.value })
                }
                placeholder="Voiceover narration for this scene..."
              />
            </div>

            {/* Character Dialogue Lines */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#ec4899' }}>
                  💬 Character Dialogue (Individual character speech lines with lip-sync)
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleAddDialogue(sceneIdx)}
                  style={{ fontSize: '11px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <PlusIcon size={11} />
                  <span>Add Dialogue Line</span>
                </button>
              </div>

              {scene.dialogue.length === 0 ? (
                <div style={{ padding: '10px 14px', background: 'var(--ed-surface-elevated, #162035)', borderRadius: '6px', fontSize: '12px', color: 'var(--ed-text-muted, #94a3b8)' }}>
                  No character dialogue lines for this scene (only narration).
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {scene.dialogue.map((line, diagIdx) => (
                    <div
                      key={line.id || diagIdx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '140px 120px 130px 1fr 32px',
                        gap: '8px',
                        alignItems: 'center',
                        background: 'rgba(236, 72, 153, 0.05)',
                        border: '1px solid rgba(236, 72, 153, 0.25)',
                        borderRadius: '6px',
                        padding: '8px 10px',
                      }}
                    >
                      {/* Speaker Name */}
                      <input
                        type="text"
                        className="ed-details-input"
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                        value={line.characterName}
                        onChange={(e) =>
                          handleUpdateDialogue(sceneIdx, diagIdx, 'characterName', e.target.value)
                        }
                        placeholder="Speaker name"
                      />

                      {/* Emotion Selector */}
                      <select
                        className="ed-details-select"
                        style={{ fontSize: '12px', padding: '4px 6px' }}
                        value={line.emotion || 'cheerful'}
                        onChange={(e) =>
                          handleUpdateDialogue(sceneIdx, diagIdx, 'emotion', e.target.value)
                        }
                      >
                        <option value="happy">Happy 😊</option>
                        <option value="cheerful">Cheerful 😄</option>
                        <option value="excited">Excited 🤩</option>
                        <option value="calm">Calm 😌</option>
                        <option value="curious">Curious 🤔</option>
                        <option value="sad">Sad 😢</option>
                        <option value="worried">Worried 😟</option>
                      </select>

                      {/* Voice Selector */}
                      <select
                        className="ed-details-select"
                        style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={line.voice || 'hf_alpha'}
                        onChange={(e) =>
                          handleUpdateDialogue(sceneIdx, diagIdx, 'voice', e.target.value)
                        }
                      >
                        <option value="hf_alpha">Kokoro Hindi Female (hf_alpha)</option>
                        <option value="hf_beta">Kokoro Hindi Male (hf_beta)</option>
                        <option value="af_heart">Kokoro English Female (af_heart)</option>
                        <option value="bm_daniel">Kokoro English Male (bm_daniel)</option>
                      </select>

                      {/* Dialogue Spoken Line */}
                      <input
                        type="text"
                        className="ed-details-input"
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                        value={line.text}
                        onChange={(e) =>
                          handleUpdateDialogue(sceneIdx, diagIdx, 'text', e.target.value)
                        }
                        placeholder="Character dialogue speech..."
                      />

                      {/* Delete Line */}
                      <button
                        type="button"
                        onClick={() => handleDeleteDialogue(sceneIdx, diagIdx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--ed-text-muted, #94a3b8)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Delete Dialogue Line"
                      >
                        <TrashIcon size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Atmosphere & Suggested Overlays */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#06b6d4' }}>
                  ✨ Atmosphere & Overlays (Rain, Sunshine, Snow, Falling Leaves, etc.)
                </label>

                <select
                  className="ed-details-select"
                  style={{ fontSize: '11px', padding: '3px 8px', width: 'auto' }}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddOverlay(sceneIdx, e.target.value);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    + Add Effect / Overlay...
                  </option>
                  {AVAILABLE_OVERLAY_TYPES.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {scene.suggestedOverlays.length === 0 ? (
                <span style={{ fontSize: '11px', color: 'var(--ed-text-muted, #94a3b8)' }}>
                  No effects added yet. Choose from the dropdown to add atmosphere.
                </span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {scene.suggestedOverlays.map((ov) => (
                    <span
                      key={ov.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        background: 'rgba(6, 182, 212, 0.15)',
                        border: '1px solid rgba(6, 182, 212, 0.35)',
                        color: '#67e8f9',
                        fontSize: '11px',
                        fontWeight: 500,
                      }}
                    >
                      <span>{ov.label}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveOverlay(sceneIdx, ov.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#67e8f9',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '12px',
                          lineHeight: 1,
                        }}
                        title="Remove effect"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div
        style={{
          position: 'sticky',
          bottom: '16px',
          marginTop: '24px',
          background: 'var(--ed-surface, #111827)',
          border: '1px solid var(--ed-border, #1f293d)',
          borderRadius: '12px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          zIndex: 100,
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBackToInput}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeftIcon size={14} />
          <span>Back to {mode === 'ai' ? 'Story Prompt' : 'Script Editor'}</span>
        </button>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleAddScene}
            disabled={isCreating}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <PlusIcon size={14} />
            <span>Add Scene</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onCreateStory}
            disabled={isCreating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              fontWeight: 600,
              fontSize: '14px',
              borderRadius: '8px',
            }}
          >
            <CheckIcon size={16} />
            <span>{isCreating ? 'Creating Storyboard...' : 'Create Story & Open in Editor'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

