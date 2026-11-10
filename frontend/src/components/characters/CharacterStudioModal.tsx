import React, { useState, useEffect, useRef } from 'react';
import { Character } from '../../services/character.service';
import {
  generateCharacterStudioAsset,
  importFlowCharacterAsset,
  syncCharacterStudioReferences,
} from '../../services/studio.service';
import {
  SparklesIcon,
  CloseIcon,
  CheckIcon,
  UploadIcon,
  CopyIcon,
  UserIcon,
} from '../common/Icons';
import './CharacterStudioModal.css';

interface CharacterStudioModalProps {
  isOpen: boolean;
  character?: Character | null;
  onClose: () => void;
  onSaved?: () => void;
}

type ArtStyle = '2d_cartoon' | '3d_pixar' | 'storybook_illustrated';
type AssetSlotKey = 'main' | 'turnaround' | 'expression' | 'pose';

interface AssetSlotState {
  url?: string;
  loading: boolean;
  error?: string | null;
}

export default function CharacterStudioModal({
  isOpen,
  character,
  onClose,
  onSaved,
}: CharacterStudioModalProps) {
  // Character form attributes
  const [name, setName] = useState(character?.name || 'Milo');
  const [age, setAge] = useState('8-10');
  const [species, setSpecies] = useState(character?.species || 'Human');
  const [visualDescription, setVisualDescription] = useState(
    character?.visualDescription ||
      'short wavy dark brown hair, big expressive brown eyes, friendly and curious smile'
  );
  const [clothing, setClothing] = useState(
    'yellow hoodie, blue shorts, white socks and red sneakers, with a blue backpack'
  );
  const [artStyle, setArtStyle] = useState<ArtStyle>('2d_cartoon');
  const [provider, setProvider] = useState<'pollinations' | 'gemini'>('pollinations');
  const [copiedSlot, setCopiedSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Asset slots
  const [slots, setSlots] = useState<Record<AssetSlotKey, AssetSlotState>>({
    main: { url: character?.referenceImageUrl, loading: false },
    turnaround: {
      url: (character?.canonicalAppearance as any)?.references?.turnaroundUrl,
      loading: false,
    },
    expression: {
      url: (character?.canonicalAppearance as any)?.references?.expressionUrl,
      loading: false,
    },
    pose: {
      url: (character?.canonicalAppearance as any)?.references?.poseUrl,
      loading: false,
    },
  });

  const fileInputRefs = {
    main: useRef<HTMLInputElement>(null),
    turnaround: useRef<HTMLInputElement>(null),
    expression: useRef<HTMLInputElement>(null),
    pose: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    if (character) {
      setName(character.name || 'Milo');
      setSpecies(character.species || 'Human');
      setVisualDescription(
        character.visualDescription ||
          'short wavy dark brown hair, big expressive brown eyes, friendly and curious smile'
      );
      const refs = (character.canonicalAppearance as any)?.references;
      setSlots({
        main: { url: character.referenceImageUrl, loading: false },
        turnaround: { url: refs?.turnaroundUrl, loading: false },
        expression: { url: refs?.expressionUrl, loading: false },
        pose: { url: refs?.poseUrl, loading: false },
      });
    }
  }, [character]);

  if (!isOpen) return null;

  // Real-time prompt builders matching user reference sheets
  const styleDescriptions: Record<ArtStyle, string> = {
    '2d_cartoon':
      'clean colorful 2D modern cartoon style, bold outlines, friendly appealing shapes, suitable for animation and rigging',
    '3d_pixar':
      '3D Pixar/Disney style animated children\'s character, soft cinematic lighting, smooth textures, vibrant appealing design',
    'storybook_illustrated':
      'hand-illustrated classic storybook art style, soft gouache textures, warm inviting colors',
  };

  const getPrompt = (slot: AssetSlotKey): string => {
    const styleText = styleDescriptions[artStyle];
    const ageStr = age ? `${age} year old ` : '';
    const speciesStr = species && species.toLowerCase() !== 'human' ? `${species} ` : '';

    switch (slot) {
      case 'main':
        return `Create a consistent 2D cartoon character for a children's story animation: a ${ageStr}${speciesStr}named '${name}'. He has ${visualDescription}. He wears ${clothing}. Full body, front view, clean cartoon style, high quality, no text, clean white background (or transparent). ${styleText}`;
      case 'turnaround':
        return `Using the same character '${name}', create a character turnaround sheet with front, 3/4 front, side, 3/4 back and back views, consistent style and proportions, clean white background. ${styleText}`;
      case 'expression':
        return `Create an expression sheet for the same character '${name}' with 8 facial expressions: happy, excited, surprised, sad, angry, thinking, confused and laughing. Keep the same style and character identity, close-up headshots on a clean white background. ${styleText}`;
      case 'pose':
        return `Create a pose sheet for the same character '${name}' showing common animation actions: standing idle, walking, running, jumping, waving, pointing, sitting and talking (hand gesture). Keep the same style, full body, clean white background. ${styleText}`;
    }
  };

  const handleCopyPrompt = async (slot: AssetSlotKey) => {
    const text = getPrompt(slot);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSlot(slot);
      setTimeout(() => setCopiedSlot(null), 2500);
    } catch {
      // Fallback
    }
  };

  const handleGenerateSlot = async (slot: AssetSlotKey) => {
    setSlots((prev) => ({
      ...prev,
      [slot]: { ...prev[slot], loading: true, error: null },
    }));
    try {
      const res = await generateCharacterStudioAsset({
        characterId: character?.id,
        type: slot,
        character: {
          name,
          age,
          species,
          visualDescription,
          clothing,
          artStyle,
          transparentBackground: slot === 'main',
        },
        provider,
      });

      if (res.result?.url) {
        setSlots((prev) => ({
          ...prev,
          [slot]: { url: res.result.url, loading: false, error: null },
        }));
      } else {
        throw new Error('No URL returned from generator');
      }
    } catch (err: any) {
      setSlots((prev) => ({
        ...prev,
        [slot]: { ...prev[slot], loading: false, error: err.message || 'Generation failed' },
      }));
    }
  };

  const handleImportFile = async (slot: AssetSlotKey, file: File) => {
    setSlots((prev) => ({
      ...prev,
      [slot]: { ...prev[slot], loading: true, error: null },
    }));

    try {
      const reader = new FileReader();
      const base64Data: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await importFlowCharacterAsset({
        characterId: character?.id,
        characterName: name,
        assetType: slot,
        imageBufferOrBase64: base64Data,
        filename: file.name,
        notes: `Imported from Google Flow / file for ${name}`,
      });

      if (res.result?.url) {
        setSlots((prev) => ({
          ...prev,
          [slot]: { url: res.result.url, loading: false, error: null },
        }));
      }
    } catch (err: any) {
      setSlots((prev) => ({
        ...prev,
        [slot]: { ...prev[slot], loading: false, error: err.message || 'Import failed' },
      }));
    }
  };

  const handleGenerateAll = async () => {
    const keys: AssetSlotKey[] = ['main', 'turnaround', 'expression', 'pose'];
    for (const key of keys) {
      await handleGenerateSlot(key);
    }
  };

  const handleSaveToCharacter = async () => {
    if (!character?.id) {
      setStatusMessage('Please select or create an existing character first');
      return;
    }
    setSaving(true);
    setStatusMessage(null);
    try {
      await syncCharacterStudioReferences(character.id, {
        references: {
          mainUrl: slots.main.url,
          turnaroundUrl: slots.turnaround.url,
          expressionUrl: slots.expression.url,
          poseUrl: slots.pose.url,
        },
      });
      setStatusMessage('Character assets synced successfully!');
      if (onSaved) onSaved();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setStatusMessage(err.message || 'Failed to sync character assets');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="char-builder-overlay" onClick={onClose}>
      <div className="char-studio-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="char-studio-header">
          <div className="char-studio-header-title">
            <span className="char-studio-badge">
              <SparklesIcon size={14} /> AI Character Studio
            </span>
            <h2>Character Asset Generator & Google Flow Import</h2>
          </div>
          <button className="char-studio-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Top Control Bar: Character Parameters */}
        <div className="char-studio-params">
          <div className="char-studio-param-field">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Milo"
            />
          </div>

          <div className="char-studio-param-field" style={{ width: '80px' }}>
            <label>Age</label>
            <input
              type="text"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="8-10"
            />
          </div>

          <div className="char-studio-param-field" style={{ width: '120px' }}>
            <label>Species</label>
            <input
              type="text"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder="Human"
            />
          </div>

          <div className="char-studio-param-field flex-1">
            <label>Visual Description</label>
            <input
              type="text"
              value={visualDescription}
              onChange={(e) => setVisualDescription(e.target.value)}
              placeholder="e.g. short wavy dark brown hair, big expressive brown eyes, friendly smile"
            />
          </div>

          <div className="char-studio-param-field flex-1">
            <label>Clothing & Props</label>
            <input
              type="text"
              value={clothing}
              onChange={(e) => setClothing(e.target.value)}
              placeholder="e.g. yellow hoodie, blue shorts, white socks, blue backpack"
            />
          </div>

          <div className="char-studio-param-field" style={{ width: '140px' }}>
            <label>Art Style</label>
            <select
              value={artStyle}
              onChange={(e) => setArtStyle(e.target.value as ArtStyle)}
            >
              <option value="2d_cartoon">2D Cartoon (Disney/Pixar)</option>
              <option value="3d_pixar">3D Pixar Style</option>
              <option value="storybook_illustrated">Storybook Illustrated</option>
            </select>
          </div>

          <div className="char-studio-param-field" style={{ width: '130px' }}>
            <label>AI Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'pollinations' | 'gemini')}
            >
              <option value="pollinations">Pollinations Flux (Free)</option>
              <option value="gemini">Gemini Imagen API</option>
            </select>
          </div>
        </div>

        {/* 4 Asset Sheets Grid matching user references */}
        <div className="char-studio-sheets-grid">
          {/* 1. Character Generation (From Text Only) */}
          <div className="char-sheet-card">
            <div className="char-sheet-header">
              <span className="sheet-badge">1</span>
              <h3>Character Generation (Main Reference)</h3>
            </div>
            <div className="char-sheet-preview-box">
              {slots.main.url ? (
                <img
                  src={slots.main.url}
                  alt={`${name} main reference`}
                  className="char-sheet-image"
                />
              ) : (
                <div className="char-sheet-empty">
                  <UserIcon size={44} color="#64748b" />
                  <p>Full Body, Front View</p>
                  <span>Clean white/transparent background</span>
                </div>
              )}
              {slots.main.loading && (
                <div className="char-sheet-loading-overlay">
                  <div className="spinner" />
                  <span>Generating main reference...</span>
                </div>
              )}
            </div>

            <div className="char-sheet-prompt-box">
              <span className="prompt-label">Prompt for Gemini / Nano Banana:</span>
              <p className="prompt-text">{getPrompt('main')}</p>
            </div>

            <div className="char-sheet-actions">
              <button
                type="button"
                className="btn-sheet-secondary"
                onClick={() => handleCopyPrompt('main')}
              >
                {copiedSlot === 'main' ? (
                  <>
                    <CheckIcon size={13} color="#10b981" /> Copied!
                  </>
                ) : (
                  <>
                    <CopyIcon size={13} /> Copy Prompt
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-sheet-primary"
                onClick={() => handleGenerateSlot('main')}
                disabled={slots.main.loading}
              >
                <SparklesIcon size={13} /> Generate AI
              </button>

              <button
                type="button"
                className="btn-sheet-import"
                onClick={() => fileInputRefs.main.current?.click()}
                disabled={slots.main.loading}
              >
                <UploadIcon size={13} /> Import Flow / File
              </button>
              <input
                type="file"
                ref={fileInputRefs.main}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile('main', file);
                }}
              />
            </div>
            {slots.main.error && <div className="sheet-error">{slots.main.error}</div>}
          </div>

          {/* 2. Character Turnaround (Multiple Angles) */}
          <div className="char-sheet-card">
            <div className="char-sheet-header">
              <span className="sheet-badge">2</span>
              <h3>Character Turnaround (Multiple Angles)</h3>
            </div>
            <div className="char-sheet-preview-box">
              {slots.turnaround.url ? (
                <img
                  src={slots.turnaround.url}
                  alt={`${name} turnaround sheet`}
                  className="char-sheet-image"
                />
              ) : (
                <div className="char-sheet-empty">
                  <div className="turnaround-angles-badge">
                    <span>Front</span> • <span>3/4 Front</span> • <span>Side</span> • <span>3/4 Back</span> • <span>Back</span>
                  </div>
                  <p>Turnaround Sheet for Rigging</p>
                  <span>Consistent style & proportions across angles</span>
                </div>
              )}
              {slots.turnaround.loading && (
                <div className="char-sheet-loading-overlay">
                  <div className="spinner" />
                  <span>Generating turnaround angles...</span>
                </div>
              )}
            </div>

            <div className="char-sheet-prompt-box">
              <span className="prompt-label">Prompt for Turnaround Angles:</span>
              <p className="prompt-text">{getPrompt('turnaround')}</p>
            </div>

            <div className="char-sheet-actions">
              <button
                type="button"
                className="btn-sheet-secondary"
                onClick={() => handleCopyPrompt('turnaround')}
              >
                {copiedSlot === 'turnaround' ? (
                  <>
                    <CheckIcon size={13} color="#10b981" /> Copied!
                  </>
                ) : (
                  <>
                    <CopyIcon size={13} /> Copy Prompt
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-sheet-primary"
                onClick={() => handleGenerateSlot('turnaround')}
                disabled={slots.turnaround.loading}
              >
                <SparklesIcon size={13} /> Generate AI
              </button>

              <button
                type="button"
                className="btn-sheet-import"
                onClick={() => fileInputRefs.turnaround.current?.click()}
                disabled={slots.turnaround.loading}
              >
                <UploadIcon size={13} /> Import Flow / File
              </button>
              <input
                type="file"
                ref={fileInputRefs.turnaround}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile('turnaround', file);
                }}
              />
            </div>
            {slots.turnaround.error && <div className="sheet-error">{slots.turnaround.error}</div>}
          </div>

          {/* 3. Expression Sheet (8 Expressions) */}
          <div className="char-sheet-card">
            <div className="char-sheet-header">
              <span className="sheet-badge">3</span>
              <h3>Expression Sheet (8 Facial Expressions)</h3>
            </div>
            <div className="char-sheet-preview-box">
              {slots.expression.url ? (
                <img
                  src={slots.expression.url}
                  alt={`${name} expression sheet`}
                  className="char-sheet-image"
                />
              ) : (
                <div className="char-sheet-empty">
                  <div className="expressions-labels-preview">
                    <span>Happy</span> <span>Excited</span> <span>Surprised</span> <span>Sad</span>
                    <span>Angry</span> <span>Thinking</span> <span>Confused</span> <span>Laughing</span>
                  </div>
                  <p>Close-up Expression Headshots</p>
                  <span>Used for facial emotion animations</span>
                </div>
              )}
              {slots.expression.loading && (
                <div className="char-sheet-loading-overlay">
                  <div className="spinner" />
                  <span>Generating 8 expressions...</span>
                </div>
              )}
            </div>

            <div className="char-sheet-prompt-box">
              <span className="prompt-label">Prompt for Expression Sheet:</span>
              <p className="prompt-text">{getPrompt('expression')}</p>
            </div>

            <div className="char-sheet-actions">
              <button
                type="button"
                className="btn-sheet-secondary"
                onClick={() => handleCopyPrompt('expression')}
              >
                {copiedSlot === 'expression' ? (
                  <>
                    <CheckIcon size={13} color="#10b981" /> Copied!
                  </>
                ) : (
                  <>
                    <CopyIcon size={13} /> Copy Prompt
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-sheet-primary"
                onClick={() => handleGenerateSlot('expression')}
                disabled={slots.expression.loading}
              >
                <SparklesIcon size={13} /> Generate AI
              </button>

              <button
                type="button"
                className="btn-sheet-import"
                onClick={() => fileInputRefs.expression.current?.click()}
                disabled={slots.expression.loading}
              >
                <UploadIcon size={13} /> Import Flow / File
              </button>
              <input
                type="file"
                ref={fileInputRefs.expression}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile('expression', file);
                }}
              />
            </div>
            {slots.expression.error && <div className="sheet-error">{slots.expression.error}</div>}
          </div>

          {/* 4. Action / Pose Sheet (8 Poses) */}
          <div className="char-sheet-card">
            <div className="char-sheet-header">
              <span className="sheet-badge">4</span>
              <h3>Action / Pose Sheet (8 Common Actions)</h3>
            </div>
            <div className="char-sheet-preview-box">
              {slots.pose.url ? (
                <img
                  src={slots.pose.url}
                  alt={`${name} pose sheet`}
                  className="char-sheet-image"
                />
              ) : (
                <div className="char-sheet-empty">
                  <div className="poses-labels-preview">
                    <span>Idle</span> <span>Walking</span> <span>Running</span> <span>Jumping</span>
                    <span>Waving</span> <span>Pointing</span> <span>Sitting</span> <span>Talking</span>
                  </div>
                  <p>Full Body Pose Sheet</p>
                  <span>Used for character movement & gestures</span>
                </div>
              )}
              {slots.pose.loading && (
                <div className="char-sheet-loading-overlay">
                  <div className="spinner" />
                  <span>Generating 8 action poses...</span>
                </div>
              )}
            </div>

            <div className="char-sheet-prompt-box">
              <span className="prompt-label">Prompt for Action Poses:</span>
              <p className="prompt-text">{getPrompt('pose')}</p>
            </div>

            <div className="char-sheet-actions">
              <button
                type="button"
                className="btn-sheet-secondary"
                onClick={() => handleCopyPrompt('pose')}
              >
                {copiedSlot === 'pose' ? (
                  <>
                    <CheckIcon size={13} color="#10b981" /> Copied!
                  </>
                ) : (
                  <>
                    <CopyIcon size={13} /> Copy Prompt
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-sheet-primary"
                onClick={() => handleGenerateSlot('pose')}
                disabled={slots.pose.loading}
              >
                <SparklesIcon size={13} /> Generate AI
              </button>

              <button
                type="button"
                className="btn-sheet-import"
                onClick={() => fileInputRefs.pose.current?.click()}
                disabled={slots.pose.loading}
              >
                <UploadIcon size={13} /> Import Flow / File
              </button>
              <input
                type="file"
                ref={fileInputRefs.pose}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile('pose', file);
                }}
              />
            </div>
            {slots.pose.error && <div className="sheet-error">{slots.pose.error}</div>}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="char-studio-footer">
          <div className="char-studio-footer-status">
            {statusMessage && <span className="status-msg">{statusMessage}</span>}
          </div>

          <div className="char-studio-footer-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleGenerateAll}
              disabled={Object.values(slots).some((s) => s.loading)}
            >
              <SparklesIcon size={15} /> Generate All 4 Sheets
            </button>

            {character?.id && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveToCharacter}
                disabled={saving}
              >
                {saving ? (
                  'Saving References...'
                ) : (
                  <>
                    <CheckIcon size={15} /> Sync References to {character.name}
                  </>
                )}
              </button>
            )}

            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}