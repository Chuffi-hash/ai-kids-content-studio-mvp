import React, { useState } from 'react';
import {
  DraftStoryboardResult,
  DraftStoryboardScene,
  DraftDialogueLine,
  DraftOverlayItem,
  EditorScene,
} from '../../types/editor';
import { parseScriptForDraft, importDraftScenes } from '../../services/editor.service';
import {
  SparklesIcon,
  TrashIcon,
  BookOpenIcon,
  CheckIcon,
  AlertTriangleIcon,
} from '../common/Icons';

interface ImportScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
  storyTitle: string;
  existingCharacters: Array<{ id: string; name: string }>;
  onImportSuccess: (importedScenes: EditorScene[], updatedTitle?: string) => void;
}

const SAMPLE_HINDI_SCRIPT = `# Title: Earth's Promise: The Four Seasons
Target Duration: 60s
Language: Hindi
Logline: Earth teaches children how the four seasons bring balance, beauty, and life to our planet.
Lesson: Every season has a special purpose in nature.

## Characters
- Earth (Protagonist): Our smiling, wise living planet with blue oceans and green continents.

## Scene 1: Golden Summer (15s)
Visual: Sun-drenched golden meadows with distant mountains, vibrant sunshine rays and heat shimmer.
Narration: ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है और प्रकृति खिल उठती है।
Earth: नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। देखो, सूरज की धूप फसलों को पका रही है! (Emotion: happy)
Effects: sunshine_rays, heat_shimmer

## Scene 2: The Monsoon Rain (15s)
Visual: Lush green hills and valleys covered in fresh gentle monsoon rain, rolling clouds and water splashes.
Narration: वर्षा ऋतु में काले बादल गरजते हैं और ठंडी बारिश सूखी धरती को नया जीवन देती है।
Earth: आहा! बारिश की हर बूंद नदियों और झरनों में नई जान फूंक देती है। (Emotion: excited)
Effects: rain, moving_clouds, water_splashes

## Scene 3: Peaceful Winter (15s)
Visual: Serene snowy forest with pine trees covered in soft snowfall, gentle fog and mist.
Narration: शीत ऋतु में बर्फ की सफेद चादर बिछ जाती है और पेड़-पौधे विश्राम करते हैं।
Earth: सर्दी हमें सिखाती है कि नए जीवन की तैयारी के लिए विश्राम भी जरूरी है। (Emotion: calm)
Effects: snowfall, fog_mist

## Scene 4: Colorful Autumn (15s)
Visual: Forest hills with golden falling leaves swirling in the breeze and flying birds in the sky.
Narration: शरद ऋतु में पत्ते सुनहरे होकर गिरते हैं और पक्षी सुहाने मौसम में उड़ते हैं।
Earth: पतझड़ के बाद नया बसंत आता है! प्रकृति का यह चक्र हमेशा मुस्कुराता रहता है। (Emotion: cheerful)
Effects: falling_leaves, flying_birds
`;

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

export const ImportScriptModal: React.FC<ImportScriptModalProps> = ({
  isOpen,
  onClose,
  storyId,
  storyTitle,
  existingCharacters,
  onImportSuccess,
}) => {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [rawText, setRawText] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<'Hindi' | 'English'>('Hindi');
  const [targetDurationSeconds, setTargetDurationSeconds] = useState<number>(60);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Review step state
  const [draftResult, setDraftResult] = useState<DraftStoryboardResult | null>(null);
  const [reviewTitle, setReviewTitle] = useState<string>('');
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const [updateTitleOnImport, setUpdateTitleOnImport] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!rawText.trim()) {
      setParseError('Please paste your script text first.');
      return;
    }

    try {
      setIsParsing(true);
      setParseError(null);

      const parsed = await parseScriptForDraft({
        rawText: rawText.trim(),
        language: selectedLanguage,
        title: storyTitle,
        targetDuration: targetDurationSeconds,
        storyId,
      });

      setDraftResult(parsed);
      setReviewTitle(parsed.title || storyTitle || 'Imported Story');
      setStep('review');
    } catch (err: any) {
      console.error('Failed to parse script:', err);
      setParseError(err.message || 'Failed to interpret script. Please check formatting.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleCommitImport = async () => {
    if (!draftResult || draftResult.scenes.length === 0) {
      setImportError('No scenes available to import.');
      return;
    }

    try {
      setIsImporting(true);
      setImportError(null);

      const res = await importDraftScenes(storyId, {
        scenes: draftResult.scenes,
        importMode,
        updateStoryMetadata: updateTitleOnImport,
        title: reviewTitle,
        targetDurationSeconds: draftResult.targetDurationSeconds,
        language: selectedLanguage,
      });

      onImportSuccess(res.scenes, updateTitleOnImport ? reviewTitle : undefined);
      onClose();
    } catch (err: any) {
      console.error('Failed to import draft scenes:', err);
      setImportError(err.message || 'Failed to save scenes to story.');
    } finally {
      setIsImporting(false);
    }
  };

  // Scene manipulation helpers in review step
  const handleUpdateScene = (idx: number, updates: Partial<DraftStoryboardScene>) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    newScenes[idx] = { ...newScenes[idx], ...updates };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleDeleteScene = (idx: number) => {
    if (!draftResult) return;
    if (draftResult.scenes.length <= 1) {
      alert('You must have at least one scene.');
      return;
    }
    const newScenes = draftResult.scenes.filter((_, i) => i !== idx);
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleMoveScene = (idx: number, direction: 'up' | 'down') => {
    if (!draftResult) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= draftResult.scenes.length) return;

    const newScenes = [...draftResult.scenes];
    const temp = newScenes[idx];
    newScenes[idx] = newScenes[targetIdx];
    newScenes[targetIdx] = temp;
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  // Dialogue line editing
  const handleUpdateDialogueLine = (
    sceneIdx: number,
    diagIdx: number,
    updates: Partial<DraftDialogueLine>
  ) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    const newDialogue = [...newScenes[sceneIdx].dialogue];
    newDialogue[diagIdx] = { ...newDialogue[diagIdx], ...updates };
    newScenes[sceneIdx] = { ...newScenes[sceneIdx], dialogue: newDialogue };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleAddDialogueLine = (sceneIdx: number) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    const newLine: DraftDialogueLine = {
      id: `diag-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      characterName: 'Earth',
      text: selectedLanguage === 'Hindi' ? 'नमस्ते दोस्तों!' : 'Hello friends!',
      emotion: 'happy',
      voice: selectedLanguage === 'Hindi' ? 'hf_alpha' : 'bm_daniel',
    };
    newScenes[sceneIdx] = {
      ...newScenes[sceneIdx],
      dialogue: [...newScenes[sceneIdx].dialogue, newLine],
    };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  const handleDeleteDialogueLine = (sceneIdx: number, diagIdx: number) => {
    if (!draftResult) return;
    const newScenes = [...draftResult.scenes];
    const newDialogue = newScenes[sceneIdx].dialogue.filter((_, i) => i !== diagIdx);
    newScenes[sceneIdx] = { ...newScenes[sceneIdx], dialogue: newDialogue };
    setDraftResult({ ...draftResult, scenes: newScenes });
  };

  // Effect overlays editing
  const handleToggleOverlay = (sceneIdx: number, overlayType: string) => {
    if (!draftResult) return;
    const sc = draftResult.scenes[sceneIdx];
    const exists = sc.suggestedOverlays.some((o) => o.type === overlayType);
    let newOverlays: DraftOverlayItem[];

    if (exists) {
      newOverlays = sc.suggestedOverlays.filter((o) => o.type !== overlayType);
    } else {
      const info = AVAILABLE_OVERLAY_TYPES.find((a) => a.type === overlayType) || {
        type: overlayType,
        label: overlayType,
        color: '#38bdf8',
      };
      newOverlays = [
        ...sc.suggestedOverlays,
        {
          id: `overlay-${overlayType}-${Date.now()}`,
          type: overlayType,
          label: info.label,
          color: info.color,
        },
      ];
    }

    handleUpdateScene(sceneIdx, { suggestedOverlays: newOverlays });
  };

  const totalCalculatedDuration = (draftResult?.scenes || []).reduce(
    (acc, s) => acc + (s.durationSeconds || 0),
    0
  );

  return (
    <div className="ed-modal-backdrop" onClick={onClose}>
      <div
        className="ed-modal-card ed-import-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: step === 'review' ? '980px' : '780px', width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="ed-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--ed-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpenIcon size={20} color="#a855f7" />
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ed-text)', margin: 0 }}>
                {step === 'input' ? 'Import Script to Storyboard' : 'Review & Customize Storyboard'}
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ed-text-muted)', margin: '4px 0 0' }}>
              {step === 'input'
                ? 'Paste an AI-written script from Claude, Gemini, ChatGPT or Markdown to prepare editable scenes.'
                : 'Review scene timings, narration, Earth dialogue and effects. Media is NOT auto-generated.'}
            </p>
          </div>
          <button
            type="button"
            className="ed-icon-btn"
            onClick={onClose}
            style={{ width: '28px', height: '28px', fontSize: '14px', display: 'grid', placeItems: 'center' }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {step === 'input' ? (
            <div>
              {/* Controls bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ed-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Language:
                    <select
                      className="ed-select"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value as any)}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      <option value="Hindi">Hindi (हिंदी) - Earth Voice hf_alpha</option>
                      <option value="English">English</option>
                    </select>
                  </label>

                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ed-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Target Duration:
                    <input
                      type="number"
                      className="ed-input"
                      value={targetDurationSeconds}
                      onChange={(e) => setTargetDurationSeconds(Math.max(10, parseInt(e.target.value, 10) || 60))}
                      style={{ width: '70px', padding: '4px 8px', fontSize: '12px' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)' }}>sec</span>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="ed-tool-btn"
                    onClick={() => {
                      setRawText(SAMPLE_HINDI_SCRIPT);
                      setSelectedLanguage('Hindi');
                    }}
                    style={{ fontSize: '11px', padding: '4px 10px', color: '#c084fc', borderColor: '#8b5cf6' }}
                  >
                    Load Four Seasons Example
                  </button>
                  {rawText && (
                    <button
                      type="button"
                      className="ed-tool-btn"
                      onClick={() => setRawText('')}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Text Area */}
              <div style={{ position: 'relative' }}>
                <textarea
                  className="ed-textarea"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Paste your script here... Supports markdown screenplay, e.g.:

# Title: Earth's Promise: The Four Seasons
Language: Hindi
Target Duration: 60s

## Scene 1: Golden Summer (15s)
Visual: Sun-drenched golden meadows with vibrant sunshine rays.
Narration: ग्रीष्म ऋतु में सूरज अपनी सुनहरी किरणें बिखेरता है...
Earth: नमस्ते नन्हे दोस्तों! मैं तुम्हारी पृथ्वी हूँ। (Emotion: happy)
Effects: sunshine_rays

## Scene 2: The Monsoon Rain...`}
                  rows={16}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    fontSize: '12.5px',
                    lineHeight: '1.5',
                    padding: '12px',
                    background: 'var(--ed-surface-elevated)',
                    color: 'var(--ed-text)',
                    borderColor: 'var(--ed-border)',
                    borderRadius: '6px',
                    resize: 'vertical',
                    minHeight: '280px',
                  }}
                />
              </div>

              {parseError && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', color: '#f87171', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <AlertTriangleIcon size={16} color="#ef4444" />
                  <span>{parseError}</span>
                </div>
              )}

              <div style={{ marginTop: '14px', padding: '10px 14px', background: 'var(--ed-surface-elevated)', borderRadius: '6px', fontSize: '11.5px', color: 'var(--ed-text-secondary)', lineHeight: '1.4' }}>
                <strong style={{ color: 'var(--ed-text)' }}>Note:</strong> We will structure this script into editable draft storyboard scenes with background prompts, Hindi narration, Earth's female Hindi voice (<code style={{ color: '#c084fc' }}>hf_alpha</code>), and suggested overlays. <strong>No images, voice audios, or videos are generated until you choose to generate them in the editor.</strong>
              </div>
            </div>
          ) : (
            <div>
              {/* Step 2: Review & Customization */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', padding: '14px', background: 'var(--ed-surface-elevated)', borderRadius: '8px', border: '1px solid var(--ed-border)', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Story Title:
                    <input
                      type="text"
                      className="ed-input"
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      style={{ width: '260px', padding: '5px 10px', fontSize: '13px' }}
                    />
                  </label>
                  <label style={{ fontSize: '12px', color: 'var(--ed-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      checked={updateTitleOnImport}
                      onChange={(e) => setUpdateTitleOnImport(e.target.checked)}
                    />
                    Update Project Title
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ed-text-secondary)' }}>Import Mode:</span>
                  <label style={{ fontSize: '12px', color: 'var(--ed-text)', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    Replace Current Scenes
                  </label>
                  <label style={{ fontSize: '12px', color: 'var(--ed-text)', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                    />
                    Append to End
                  </label>
                </div>
              </div>

              {/* Parsed Scenes List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {(draftResult?.scenes || []).map((sc, scIdx) => (
                  <div
                    key={`draft-scene-${scIdx}`}
                    style={{
                      border: '1px solid var(--ed-border)',
                      borderRadius: '8px',
                      background: 'var(--ed-surface-elevated)',
                      padding: '16px',
                    }}
                  >
                    {/* Scene Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--ed-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ background: '#8b5cf6', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                          Scene {scIdx + 1}
                        </span>
                        <input
                          type="text"
                          className="ed-input"
                          value={sc.title}
                          onChange={(e) => handleUpdateScene(scIdx, { title: e.target.value })}
                          placeholder="Scene Title"
                          style={{ fontWeight: 600, fontSize: '14px', width: '220px', padding: '4px 8px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--ed-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Duration:
                          <input
                            type="number"
                            className="ed-input"
                            value={sc.durationSeconds}
                            onChange={(e) => handleUpdateScene(scIdx, { durationSeconds: Math.max(3, parseInt(e.target.value, 10) || 5) })}
                            style={{ width: '55px', padding: '3px 6px', fontSize: '12px' }}
                          />
                          s
                        </label>

                        <button
                          type="button"
                          className="ed-icon-btn"
                          onClick={() => handleMoveScene(scIdx, 'up')}
                          disabled={scIdx === 0}
                          title="Move Scene Up"
                          style={{ width: '26px', height: '26px', fontSize: '11px' }}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="ed-icon-btn"
                          onClick={() => handleMoveScene(scIdx, 'down')}
                          disabled={scIdx === (draftResult?.scenes.length || 0) - 1}
                          title="Move Scene Down"
                          style={{ width: '26px', height: '26px', fontSize: '11px' }}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="ed-icon-btn"
                          onClick={() => handleDeleteScene(scIdx)}
                          title="Delete Scene"
                          style={{ width: '26px', height: '26px', color: '#ef4444' }}
                        >
                          <TrashIcon size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Scene Background Prompt */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ed-text-secondary)' }}>
                          Background Image Prompt
                        </label>
                        <span style={{ fontSize: '10.5px', color: '#a855f7' }}>
                          Ready for Nano Banana / Gemini Generation
                        </span>
                      </div>
                      <textarea
                        className="ed-textarea"
                        value={sc.visualPrompt}
                        onChange={(e) => handleUpdateScene(scIdx, { visualPrompt: e.target.value })}
                        placeholder="Detailed background visual description..."
                        rows={2}
                        style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
                      />
                    </div>

                    {/* Scene Narration */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ed-text-secondary)' }}>
                          Narration Script
                        </label>
                        <span style={{ fontSize: '10.5px', color: 'var(--ed-text-muted)' }}>
                          Voice-over timing & lip-sync baseline
                        </span>
                      </div>
                      <textarea
                        className="ed-textarea"
                        value={sc.narration}
                        onChange={(e) => handleUpdateScene(scIdx, { narration: e.target.value })}
                        placeholder="Narration script text..."
                        rows={2}
                        style={{ width: '100%', fontSize: '12.5px', padding: '6px 8px' }}
                      />
                    </div>

                    {/* Character Dialogue Lines */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ed-text-secondary)' }}>
                          Character Dialogue ({sc.dialogue.length})
                        </label>
                        <button
                          type="button"
                          className="ed-tool-btn"
                          onClick={() => handleAddDialogueLine(scIdx)}
                          style={{ fontSize: '10.5px', padding: '2px 8px' }}
                        >
                          + Add Line
                        </button>
                      </div>

                      {sc.dialogue.length === 0 ? (
                        <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', fontStyle: 'italic', padding: '6px' }}>
                          No character dialogue in this scene.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {sc.dialogue.map((d, dIdx) => (
                            <div
                              key={d.id || `diag-${dIdx}`}
                              style={{
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center',
                                background: 'var(--ed-surface)',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid var(--ed-border)',
                              }}
                            >
                              <div style={{ minWidth: '100px' }}>
                                <input
                                  type="text"
                                  className="ed-input"
                                  value={d.characterName}
                                  onChange={(e) => handleUpdateDialogueLine(scIdx, dIdx, { characterName: e.target.value })}
                                  placeholder="Speaker"
                                  style={{ width: '100%', fontSize: '11px', padding: '3px 6px', fontWeight: 600 }}
                                />
                              </div>

                              <div style={{ minWidth: '90px' }}>
                                <select
                                  className="ed-select"
                                  value={d.voice}
                                  onChange={(e) => handleUpdateDialogueLine(scIdx, dIdx, { voice: e.target.value })}
                                  style={{ width: '100%', fontSize: '11px', padding: '3px 6px' }}
                                >
                                  <option value="hf_alpha">hf_alpha (Hindi F)</option>
                                  <option value="hf_beta">hf_beta (Hindi M)</option>
                                  <option value="bm_daniel">bm_daniel (Eng M)</option>
                                  <option value="af_heart">af_heart (Eng F)</option>
                                  <option value="af_bella">af_bella (Girl)</option>
                                  <option value="bm_george">bm_george (Bear)</option>
                                </select>
                              </div>

                              <div style={{ minWidth: '85px' }}>
                                <select
                                  className="ed-select"
                                  value={d.emotion}
                                  onChange={(e) => handleUpdateDialogueLine(scIdx, dIdx, { emotion: e.target.value })}
                                  style={{ width: '100%', fontSize: '11px', padding: '3px 6px' }}
                                >
                                  <option value="happy">Happy</option>
                                  <option value="excited">Excited</option>
                                  <option value="calm">Calm</option>
                                  <option value="surprised">Surprised</option>
                                  <option value="cheerful">Cheerful</option>
                                  <option value="worried">Worried</option>
                                  <option value="sad">Sad</option>
                                </select>
                              </div>

                              <div style={{ flex: 1 }}>
                                <input
                                  type="text"
                                  className="ed-input"
                                  value={d.text}
                                  onChange={(e) => handleUpdateDialogueLine(scIdx, dIdx, { text: e.target.value })}
                                  placeholder="Character speech text..."
                                  style={{ width: '100%', fontSize: '12px', padding: '3px 8px' }}
                                />
                              </div>

                              <button
                                type="button"
                                className="ed-icon-btn"
                                onClick={() => handleDeleteDialogueLine(scIdx, dIdx)}
                                title="Remove Line"
                                style={{ width: '22px', height: '22px', color: '#ef4444' }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Suggested Effects / Overlays */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ed-text-secondary)' }}>
                          Atmosphere & Visual Effects
                        </label>
                        <span style={{ fontSize: '10.5px', color: 'var(--ed-text-muted)' }}>
                          Click tags to toggle
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {AVAILABLE_OVERLAY_TYPES.map((ov) => {
                          const isSelected = sc.suggestedOverlays.some((o) => o.type === ov.type);
                          return (
                            <button
                              key={ov.type}
                              type="button"
                              onClick={() => handleToggleOverlay(scIdx, ov.type)}
                              style={{
                                fontSize: '11px',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                border: `1px solid ${isSelected ? ov.color : 'var(--ed-border)'}`,
                                background: isSelected ? 'rgba(139, 92, 246, 0.2)' : 'var(--ed-surface)',
                                color: isSelected ? 'var(--ed-text)' : 'var(--ed-text-muted)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <span>{ov.label}</span>
                              {isSelected && <span>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {importError && (
                <div style={{ marginTop: '16px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', color: '#f87171', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <AlertTriangleIcon size={16} color="#ef4444" />
                  <span>{importError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--ed-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--ed-surface)' }}>
          {step === 'input' ? (
            <>
              <button type="button" className="ed-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="ed-btn-export"
                onClick={handleParse}
                disabled={isParsing || !rawText.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <SparklesIcon size={14} />
                <span>{isParsing ? 'Interpreting Script...' : 'Parse Script →'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ed-btn-ghost"
                onClick={() => setStep('input')}
                disabled={isImporting}
              >
                ← Back to Script
              </button>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button type="button" className="ed-btn-ghost" onClick={onClose} disabled={isImporting}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="ed-btn-export"
                  onClick={handleCommitImport}
                  disabled={isImporting || !draftResult || draftResult.scenes.length === 0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckIcon size={14} />
                  <span>{isImporting ? 'Creating Scenes...' : `Confirm & Create (${draftResult?.scenes.length || 0} Scenes)`}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

