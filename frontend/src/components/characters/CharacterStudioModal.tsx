import React, { useState, useEffect, useRef } from 'react';
import { Character, getAllCharacters, updateCharacter as apiUpdateCharacter } from '../../services/character.service';
import {
  CharacterAssetRecord,
  CharacterGenerationPrompt,
  getCharacterStudioCapabilities,
  buildCharacterStudioPrompt,
  generateCharacterStudioAsset,
  createCharacterFromStudio,
  getCharacterStudioAssets,
  saveCharacterStudioAsset,
  setMasterReferenceAsset,
  deleteCharacterStudioAsset,
  uploadCharacterStudioAsset,
} from '../../services/studio.service';
import {
  SparklesIcon,
  CloseIcon,
  CheckIcon,
  UploadIcon,
  ImageIcon,
} from '../common/Icons';
import './CharacterStudioModal.css';

interface CharacterStudioModalProps {
  isOpen: boolean;
  character?: Character | null;
  onClose: () => void;
  onSaved?: () => void;
}

type ArtStyle = '2d_cartoon' | '3d_pixar' | 'storybook_illustrated';
type GenerationType = 'main' | 'turnaround' | 'expression' | 'pose' | 'custom';

export default function CharacterStudioModal({
  isOpen,
  character: initialCharacter,
  onClose,
  onSaved,
}: CharacterStudioModalProps) {
  // Character Identity State
  const [characterList, setCharacterList] = useState<Character[]>([]);
  const [activeCharacterId, setActiveCharacterId] = useState<string>(initialCharacter?.id || 'new');
  const [name, setName] = useState(initialCharacter?.name || 'Milo');
  const [species, setSpecies] = useState(initialCharacter?.species || 'Human');
  const [age, setAge] = useState('8-10');
  const [gender, setGender] = useState('Boy');
  const [visualDescription, setVisualDescription] = useState(
    initialCharacter?.visualDescription ||
      'short wavy dark brown hair, big expressive brown eyes, friendly and curious smile'
  );
  const [clothing, setClothing] = useState(
    'yellow hoodie, blue denim shorts, white sneakers, blue backpack'
  );
  const [artStyle, setArtStyle] = useState<ArtStyle>('2d_cartoon');
  const [masterReferenceUrl, setMasterReferenceUrl] = useState<string | null>(
    initialCharacter?.referenceImageUrl || null
  );

  // Generation Controls State (Center Panel)
  const [generationType, setGenerationType] = useState<GenerationType>('main');
  const [direction, setDirection] = useState<string>('front');
  const [action, setAction] = useState<string>('standing');
  const [customAction, setCustomAction] = useState<string>('');
  const [expression, setExpression] = useState<string>('happy');
  const [customExpression, setCustomExpression] = useState<string>('');
  const [framing, setFraming] = useState<string>('full_body');
  const [clothingOverride, setClothingOverride] = useState<string>('');
  const [backgroundInstructions, setBackgroundInstructions] = useState<string>(
    'clean isolated white background (transparent background), no background clutter'
  );
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [negativePrompt, setNegativePrompt] = useState<string>(
    'photo, realistic, 3D render, text, watermark, signature, logo, blurry, cropped head, deformed fingers, extra limbs, bad anatomy'
  );

  // Prompt & Provider State (Right Panel)
  const [provider, setProvider] = useState<'pollinations' | 'gemini'>('pollinations');
  const [combinedPrompt, setCombinedPrompt] = useState<string>('');
  const [isPromptManuallyEdited, setIsPromptManuallyEdited] = useState<boolean>(false);
  const [compareWithMaster, setCompareWithMaster] = useState<boolean>(false);

  // Results & Assets State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [currentAssetResult, setCurrentAssetResult] = useState<CharacterAssetRecord | null>(null);
  const [savedAssets, setSavedAssets] = useState<CharacterAssetRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingCharacter, setSavingCharacter] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load characters list on mount
  useEffect(() => {
    async function loadChars() {
      try {
        const chars = await getAllCharacters();
        setCharacterList(chars);
      } catch (err) {
        console.error('Failed to load characters:', err);
      }
    }
    loadChars();
  }, []);

  // When initial character changes or character selected from dropdown
  useEffect(() => {
    if (activeCharacterId === 'new') {
      if (!initialCharacter) {
        setName('Milo');
        setSpecies('Human');
        setVisualDescription('short wavy dark brown hair, big expressive brown eyes, friendly smile');
        setClothing('yellow hoodie, blue shorts, white sneakers, blue backpack');
        setMasterReferenceUrl(null);
        setSavedAssets([]);
      }
      return;
    }

    const matched = characterList.find((c) => c.id === activeCharacterId) || initialCharacter;
    if (matched) {
      setName(matched.name || '');
      setSpecies(matched.species || 'Human');
      setVisualDescription(matched.visualDescription || '');
      setMasterReferenceUrl(matched.referenceImageUrl || null);

      const canonical = matched.canonicalAppearance as any;
      if (canonical?.clothing) setClothing(canonical.clothing);
      if (canonical?.artStyle) setArtStyle(canonical.artStyle);

      // Fetch saved assets for this character
      getCharacterStudioAssets(matched.id)
        .then((res) => {
          if (res.success && Array.isArray(res.assets)) {
            setSavedAssets(res.assets);
          }
        })
        .catch(() => setSavedAssets([]));
    }
  }, [activeCharacterId, characterList, initialCharacter]);

  // Synchronize combined prompt whenever parameters change (unless manually edited)
  useEffect(() => {
    if (isPromptManuallyEdited) return;

    buildCharacterStudioPrompt({
      characterName: name || 'Character',
      characterDescription: visualDescription,
      species,
      age,
      gender,
      direction,
      action,
      customAction,
      expression,
      customExpression,
      framing,
      clothingInstructions: clothingOverride || clothing,
      backgroundInstructions,
      artStyle,
      customInstructions,
      negativePrompt,
      generationType,
      referenceImageUrl: masterReferenceUrl || undefined,
    })
      .then((res) => {
        setCombinedPrompt(res.prompt);
      })
      .catch((err) => {
        console.error('Prompt build error:', err);
      });
  }, [
    name,
    species,
    age,
    gender,
    visualDescription,
    clothing,
    clothingOverride,
    artStyle,
    generationType,
    direction,
    action,
    customAction,
    expression,
    customExpression,
    framing,
    backgroundInstructions,
    customInstructions,
    negativePrompt,
    masterReferenceUrl,
    isPromptManuallyEdited,
  ]);

  if (!isOpen) return null;

  // Manual rebuild button
  const handleRebuildPrompt = async () => {
    try {
      const res = await buildCharacterStudioPrompt({
        characterName: name || 'Character',
        characterDescription: visualDescription,
        species,
        age,
        gender,
        direction,
        action,
        customAction,
        expression,
        customExpression,
        framing,
        clothingInstructions: clothingOverride || clothing,
        backgroundInstructions,
        artStyle,
        customInstructions,
        negativePrompt,
        generationType,
        referenceImageUrl: masterReferenceUrl || undefined,
      });
      setCombinedPrompt(res.prompt);
      setIsPromptManuallyEdited(false);
      setStatusMessage('Prompt rebuilt from current controls');
      setTimeout(() => setStatusMessage(null), 2000);
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to rebuild prompt');
    }
  };

  // Generate Asset
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    setStatusMessage(null);

    const promptPayload: CharacterGenerationPrompt = {
      characterId: activeCharacterId !== 'new' ? activeCharacterId : undefined,
      characterName: name || 'Character',
      characterDescription: visualDescription,
      species,
      age,
      gender,
      direction,
      action,
      customAction,
      expression,
      customExpression,
      framing,
      clothingInstructions: clothingOverride || clothing,
      backgroundInstructions,
      artStyle,
      customInstructions,
      negativePrompt,
      generationType,
      referenceImageUrl: masterReferenceUrl || undefined,
      customCombinedPrompt: combinedPrompt,
    };

    try {
      const res = await generateCharacterStudioAsset({
        characterId: activeCharacterId !== 'new' ? activeCharacterId : undefined,
        promptData: promptPayload,
        provider,
      });

      if (res.success && res.result) {
        const newAsset: CharacterAssetRecord = {
          id: res.result.assetId,
          characterId: activeCharacterId !== 'new' ? activeCharacterId : '',
          assetType: generationType,
          direction,
          action: action === 'custom' ? customAction : action,
          expression: expression === 'custom' ? customExpression : expression,
          framing,
          prompt: res.result.prompt,
          negativePrompt: res.result.negativePrompt,
          provider: res.result.provider,
          model: res.result.model,
          url: res.result.url,
          storagePath: res.result.storagePath,
          isMasterReference: generationType === 'main' && !masterReferenceUrl,
          createdAt: new Date().toISOString(),
        };

        setCurrentAssetResult(newAsset);

        // If this is the main generation and no master reference existed yet, establish it
        if (generationType === 'main' && !masterReferenceUrl) {
          setMasterReferenceUrl(newAsset.url);
        }
      }
    } catch (err: any) {
      setGenerationError(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save Character or Update Identity
  const handleSaveCharacter = async () => {
    if (!name.trim()) {
      setStatusMessage('Character name is required');
      return;
    }

    setSavingCharacter(true);
    setStatusMessage(null);
    try {
      if (activeCharacterId === 'new') {
        const res = await createCharacterFromStudio({
          name: name.trim(),
          species,
          visualDescription,
          clothing,
          artStyle,
          masterReferenceUrl: masterReferenceUrl || currentAssetResult?.url || undefined,
          masterPrompt: currentAssetResult?.prompt || undefined,
        });

        if (res.success && res.character) {
          setActiveCharacterId(res.character.id);
          const chars = await getAllCharacters();
          setCharacterList(chars);
          setStatusMessage(`Character '${res.character.name}' created successfully!`);
          if (onSaved) onSaved();
        }
      } else {
        await apiUpdateCharacter(activeCharacterId, {
          name: name.trim(),
          species,
          visualDescription,
          distinctiveFeatures: clothing,
          referenceImageUrl: masterReferenceUrl || undefined,
        });
        const chars = await getAllCharacters();
        setCharacterList(chars);
        setStatusMessage(`Character '${name}' updated successfully!`);
        if (onSaved) onSaved();
      }
    } catch (err: any) {
      setStatusMessage(err.message || 'Failed to save character');
    } finally {
      setSavingCharacter(false);
    }
  };

  // Save Current Variation to Character
  const handleSaveVariation = async () => {
    if (!currentAssetResult) return;

    if (activeCharacterId === 'new') {
      setStatusMessage('Please click "Save & Create Character" on the left first to establish this character!');
      return;
    }

    try {
      const res = await saveCharacterStudioAsset(activeCharacterId, currentAssetResult);
      if (res.success) {
        setSavedAssets((prev) => [res.asset, ...prev.filter((a) => a.id !== res.asset.id)]);
        setStatusMessage('Variation saved to character library!');
        setTimeout(() => setStatusMessage(null), 2500);
      }
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to save variation');
    }
  };

  // Set as Master Reference
  const handleSetMasterReference = async () => {
    if (!currentAssetResult) return;
    setMasterReferenceUrl(currentAssetResult.url);

    if (activeCharacterId !== 'new') {
      try {
        await setMasterReferenceAsset(activeCharacterId, currentAssetResult.id);
        const chars = await getAllCharacters();
        setCharacterList(chars);
        setStatusMessage('Master reference image updated!');
      } catch {
        // saved locally
      }
    }
  };

  // Delete an individual variation
  const handleDeleteAsset = async (assetId: string) => {
    if (activeCharacterId === 'new') {
      setSavedAssets((prev) => prev.filter((a) => a.id !== assetId));
      return;
    }

    try {
      await deleteCharacterStudioAsset(activeCharacterId, assetId);
      setSavedAssets((prev) => prev.filter((a) => a.id !== assetId));
      setStatusMessage('Variation removed');
      setTimeout(() => setStatusMessage(null), 1500);
    } catch (err: any) {
      setGenerationError(err.message || 'Failed to delete asset');
    }
  };

  // Upload Custom Image as Master Reference
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        if (activeCharacterId !== 'new') {
          const res = await uploadCharacterStudioAsset({
            characterId: activeCharacterId,
            assetType: 'main',
            base64Data: base64,
            filename: file.name,
          });
          if (res.success && res.result) {
            setMasterReferenceUrl(res.result.url);
            setStatusMessage('Custom reference uploaded successfully!');
          }
        } else {
          setMasterReferenceUrl(base64);
          setStatusMessage('Custom reference loaded (will be saved when you create character)');
        }
      } catch (err: any) {
        setGenerationError(err.message || 'Upload failed');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="char-builder-overlay" onClick={onClose}>
      <div className="char-studio-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="char-studio-header">
          <div className="char-studio-header-title">
            <span className="char-studio-badge">
              <SparklesIcon size={14} /> Character Studio 2.0
            </span>
            <h2>Editable Character Directions, Reference Consistency & Generation</h2>
          </div>
          <button className="char-studio-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        {/* 3-Panel Workspace */}
        <div className="char-studio-workspace">
          {/* ================= LEFT PANEL: Character Identity ================= */}
          <div className="char-studio-panel-left">
            <div>
              <h3 className="studio-panel-title">Character Identity</h3>
              <p className="studio-panel-subtitle">Define the canonical character identity</p>
            </div>

            {/* Character Selector */}
            <div className="studio-form-group">
              <label className="studio-form-label">Active Character</label>
              <select
                className="studio-select"
                value={activeCharacterId}
                onChange={(e) => setActiveCharacterId(e.target.value)}
              >
                <option value="new">+ Create New Character</option>
                {characterList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.species})
                  </option>
                ))}
              </select>
            </div>

            {/* Master Reference Card */}
            <div className="master-ref-card">
              <div className="master-ref-img-wrap">
                {masterReferenceUrl ? (
                  <>
                    <img src={masterReferenceUrl} alt={name} />
                    <span className="master-ref-badge">⭐ Master Reference</span>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-muted)' }}>
                    <ImageIcon size={32} />
                    <div style={{ fontSize: 11, marginTop: 6 }}>No master reference set yet</div>
                  </div>
                )}
              </div>
              <div className="master-ref-meta">
                <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                  {masterReferenceUrl ? 'Canonical Visual Anchor' : 'Generate Main to Anchor'}
                </div>
                <div>Subsequent poses and expressions will inherit this visual identity.</div>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 6, width: '100%' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon size={13} /> {masterReferenceUrl ? 'Upload / Replace Reference' : 'Upload Reference Image'}
                </button>
              </div>
            </div>

            {/* Core Identity Fields */}
            <div className="studio-form-group">
              <label className="studio-form-label">Character Name</label>
              <input
                type="text"
                className="studio-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Milo"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="studio-form-group">
                <label className="studio-form-label">Species</label>
                <input
                  type="text"
                  className="studio-input"
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  placeholder="e.g. Bear, Human"
                />
              </div>

              <div className="studio-form-group">
                <label className="studio-form-label">Age / Group</label>
                <input
                  type="text"
                  className="studio-input"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 8-10"
                />
              </div>
            </div>

            <div className="studio-form-group">
              <label className="studio-form-label">Appearance & Traits</label>
              <textarea
                className="studio-textarea"
                rows={3}
                value={visualDescription}
                onChange={(e) => setVisualDescription(e.target.value)}
                placeholder="Hair style/color, eye color, distinct face shape, fur, build"
              />
            </div>

            <div className="studio-form-group">
              <label className="studio-form-label">Clothing & Props</label>
              <input
                type="text"
                className="studio-input"
                value={clothing}
                onChange={(e) => setClothing(e.target.value)}
                placeholder="e.g. yellow hoodie, blue shorts, white sneakers"
              />
            </div>

            <div className="studio-form-group">
              <label className="studio-form-label">Art Style</label>
              <select
                className="studio-select"
                value={artStyle}
                onChange={(e) => setArtStyle(e.target.value as ArtStyle)}
              >
                <option value="2d_cartoon">2D Modern Cartoon (Animation Ready)</option>
                <option value="3d_pixar">3D Pixar/Disney Style</option>
                <option value="storybook_illustrated">Classic Storybook Gouache</option>
              </select>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={savingCharacter}
              onClick={handleSaveCharacter}
              style={{ marginTop: 'auto' }}
            >
              {savingCharacter
                ? 'Saving...'
                : activeCharacterId === 'new'
                ? 'Save & Create Character'
                : 'Update Character Identity'}
            </button>
          </div>

          {/* ================= CENTER PANEL: Generation Controls ================= */}
          <div className="char-studio-panel-center">
            <div>
              <h3 className="studio-panel-title">Generation Controls</h3>
              <p className="studio-panel-subtitle">Configure editable directions, poses, and expressions</p>
            </div>

            {/* Category Tabs */}
            <div className="studio-category-tabs">
              {(
                [
                  { id: 'main', label: '🌟 Main Character' },
                  { id: 'turnaround', label: '🔄 Turnaround Sheet' },
                  { id: 'expression', label: '😊 Expressions' },
                  { id: 'pose', label: '🏃 Poses & Actions' },
                  { id: 'custom', label: '🎨 Custom' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`studio-cat-tab ${generationType === cat.id ? 'active' : ''}`}
                  onClick={() => setGenerationType(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Direction Selector */}
            <div className="studio-form-group">
              <label className="studio-form-label">Character Direction</label>
              <select
                className="studio-select"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="front">Front Facing (Direct to camera)</option>
                <option value="left">Facing Left (Full profile)</option>
                <option value="right">Facing Right (Full profile)</option>
                <option value="back">Back Facing (Seen from behind)</option>
                <option value="three_quarter_left">Three-Quarter Left (3/4 front)</option>
                <option value="three_quarter_right">Three-Quarter Right (3/4 front)</option>
                <option value="looking_over_left_shoulder">Looking Over Left Shoulder</option>
                <option value="looking_over_right_shoulder">Looking Over Right Shoulder</option>
                <option value="looking_upward">Looking Upward</option>
                <option value="looking_downward">Looking Downward</option>
              </select>
            </div>

            {/* Body Pose & Action */}
            <div className="studio-form-group">
              <label className="studio-form-label">Body Pose & Action</label>
              <select
                className="studio-select"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                <option value="standing">Standing Naturally</option>
                <option value="walking">Walking (Mid-stride)</option>
                <option value="running">Running (Dynamic stride)</option>
                <option value="jumping">Jumping (Feet in air)</option>
                <option value="sitting">Sitting Comfortably</option>
                <option value="kneeling">Kneeling</option>
                <option value="dancing">Dancing</option>
                <option value="waving">Waving Hand</option>
                <option value="pointing">Pointing Finger</option>
                <option value="hands_on_hips">Hands on Hips</option>
                <option value="arms_crossed">Arms Crossed</option>
                <option value="thinking">Thinking Pose</option>
                <option value="sleeping">Sleeping</option>
                <option value="falling">Falling</option>
                <option value="flying">Flying / Gliding</option>
                <option value="custom">-- Custom Action --</option>
              </select>

              {action === 'custom' && (
                <input
                  type="text"
                  className="studio-input"
                  style={{ marginTop: 6 }}
                  value={customAction}
                  onChange={(e) => setCustomAction(e.target.value)}
                  placeholder="Describe custom action (e.g. balancing on one foot, reading an open book)"
                />
              )}
            </div>

            {/* Facial Expression */}
            <div className="studio-form-group">
              <label className="studio-form-label">Facial Expression</label>
              <select
                className="studio-select"
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
              >
                <option value="neutral">Neutral (Calm resting face)</option>
                <option value="happy">Happy (Gentle warm smile)</option>
                <option value="very_happy">Very Happy (Joyful grin)</option>
                <option value="laughing">Laughing (Mouth open in delight)</option>
                <option value="sad">Sad (Downcast expression)</option>
                <option value="crying">Crying (Tearful)</option>
                <option value="angry">Angry (Furrowed brows, determined)</option>
                <option value="surprised">Surprised (Wide eyes, open mouth)</option>
                <option value="scared">Scared (Timid, anxious)</option>
                <option value="confused">Confused (Tilted head, questioning)</option>
                <option value="curious">Curious (Intrigued, peering)</option>
                <option value="excited">Excited (Beaming, energetic)</option>
                <option value="sleepy">Sleepy (Droopy eyes, yawning)</option>
                <option value="thinking">Thinking (Pensive look upward)</option>
                <option value="custom">-- Custom Expression --</option>
              </select>

              {expression === 'custom' && (
                <input
                  type="text"
                  className="studio-input"
                  style={{ marginTop: 6 }}
                  value={customExpression}
                  onChange={(e) => setCustomExpression(e.target.value)}
                  placeholder="Describe custom expression (e.g. mischievous playful smirk with one eye wink)"
                />
              )}
            </div>

            {/* Camera & Framing */}
            <div className="studio-form-group">
              <label className="studio-form-label">Camera Angle & Framing</label>
              <select
                className="studio-select"
                value={framing}
                onChange={(e) => setFraming(e.target.value)}
              >
                <option value="full_body">Full Body (Head to shoes)</option>
                <option value="half_body">Half Body (Waist up)</option>
                <option value="portrait">Portrait (Chest up)</option>
                <option value="close_up">Close-Up (Facial headshot)</option>
                <option value="wide_shot">Wide Shot</option>
                <option value="side_profile">Side Profile</option>
                <option value="character_turnaround">Character Turnaround (Multi-view)</option>
                <option value="front_view">Front View Centered</option>
                <option value="back_view">Back View Centered</option>
              </select>
            </div>

            {/* Background & Negative Prompt */}
            <div className="studio-form-group">
              <label className="studio-form-label">Background Staging</label>
              <input
                type="text"
                className="studio-input"
                value={backgroundInstructions}
                onChange={(e) => setBackgroundInstructions(e.target.value)}
                placeholder="clean isolated white background"
              />
            </div>

            <div className="studio-form-group">
              <label className="studio-form-label">Specific Instructions / Props</label>
              <input
                type="text"
                className="studio-input"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g. holding a wooden magnifying glass in right hand"
              />
            </div>

            <div className="studio-form-group">
              <label className="studio-form-label">Negative Prompt</label>
              <input
                type="text"
                className="studio-input"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
              />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={handleRebuildPrompt}
              >
                🔄 Rebuild Combined Prompt from Controls
              </button>
            </div>
          </div>

          {/* ================= RIGHT PANEL: Prompt & Results ================= */}
          <div className="char-studio-panel-right">
            <div>
              <h3 className="studio-panel-title">Generation & Prompt Studio</h3>
              <p className="studio-panel-subtitle">Review prompt, select provider, and inspect results</p>
            </div>

            {/* Provider Selection */}
            <div className="studio-form-group">
              <label className="studio-form-label">Image Generation Provider</label>
              <select
                className="studio-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'pollinations' | 'gemini')}
              >
                <option value="pollinations">Pollinations Flux (Fast & Free)</option>
                <option value="gemini">Google Gemini (Imagen 3 Diffusion)</option>
              </select>
            </div>

            {/* Provider Capability Notice */}
            <div className="provider-notice-box">
              {provider === 'gemini' ? (
                <div>
                  <strong>Gemini Imagen 3:</strong> High-fidelity diffusion engine. Character identity is preserved via canonical visual description prompt injection. Direct image conditioning is not supported on this endpoint.
                </div>
              ) : (
                <div>
                  <strong>Pollinations Flux:</strong> Fast children's book illustration model. Character consistency maintained through exact trait and attire prompt injection.
                </div>
              )}
            </div>

            {/* Directly Editable Combined Prompt */}
            <div className="studio-form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="studio-form-label">Final Combined Prompt (Directly Editable)</label>
                {isPromptManuallyEdited && (
                  <span style={{ fontSize: 10, color: 'var(--color-accent)', fontWeight: 600 }}>
                    Manual Edit Active
                  </span>
                )}
              </div>
              <textarea
                className="studio-textarea"
                rows={5}
                value={combinedPrompt}
                onChange={(e) => {
                  setCombinedPrompt(e.target.value);
                  setIsPromptManuallyEdited(true);
                }}
                placeholder="The exact prompt sent to the AI image generator..."
              />
            </div>

            {/* Generate Action Button */}
            <button
              type="button"
              className="btn btn-primary"
              disabled={isGenerating}
              onClick={handleGenerate}
              style={{ padding: '12px 18px', fontWeight: 700, fontSize: 14 }}
            >
              {isGenerating ? (
                <>Generating {generationType} asset...</>
              ) : (
                <>✨ Generate {generationType.charAt(0).toUpperCase() + generationType.slice(1)} Asset</>
              )}
            </button>

            {/* Status & Error Alerts */}
            {statusMessage && (
              <div style={{ padding: '8px 12px', borderRadius: 6, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: 12 }}>
                ✓ {statusMessage}
              </div>
            )}

            {generationError && (
              <div style={{ padding: '8px 12px', borderRadius: 6, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: 12 }}>
                ⚠ {generationError}
              </div>
            )}

            {/* Results Preview Card */}
            <div className="gen-result-card">
              <div className="gen-result-preview-wrap">
                {isGenerating ? (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>
                    <div className="spinner" style={{ width: 28, height: 28, marginBottom: 10 }} />
                    <div>Synthesizing consistent character illustration...</div>
                  </div>
                ) : currentAssetResult ? (
                  <img src={currentAssetResult.url} alt="Generated asset" />
                ) : (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>
                    <ImageIcon size={36} />
                    <div style={{ fontSize: 12, marginTop: 8 }}>Click Generate to preview illustration here</div>
                  </div>
                )}
              </div>

              {currentAssetResult && (
                <div className="gen-result-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleSetMasterReference}
                  >
                    ⭐ Set as Master Reference
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveVariation}
                  >
                    💾 Save Variation to Character
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCompareWithMaster(!compareWithMaster)}
                  >
                    {compareWithMaster ? 'Hide Comparison' : 'Compare with Master'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleGenerate}
                  >
                    🔄 Regenerate
                  </button>
                </div>
              )}
            </div>

            {/* Side-by-Side Comparison with Master Reference */}
            {compareWithMaster && masterReferenceUrl && currentAssetResult && (
              <div className="comparison-container">
                <div className="comparison-thumb">
                  <div className="comparison-thumb-header">Master Reference</div>
                  <img src={masterReferenceUrl} alt="Master reference" />
                </div>
                <div className="comparison-thumb">
                  <div className="comparison-thumb-header">Current Variation</div>
                  <img src={currentAssetResult.url} alt="Current variation" />
                </div>
              </div>
            )}

            {/* Saved Variations Gallery */}
            <div className="saved-variations-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="studio-form-label">
                  Saved Variations ({savedAssets.length})
                </span>
              </div>

              {savedAssets.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                  No saved variations yet. Generate and click "Save Variation to Character".
                </div>
              ) : (
                <div className="saved-variations-grid">
                  {savedAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className={`saved-variation-item ${currentAssetResult?.id === asset.id ? 'active' : ''}`}
                      onClick={() => setCurrentAssetResult(asset)}
                    >
                      <img src={asset.url} alt={asset.prompt} />
                      <span className="saved-var-tag">
                        {asset.isMasterReference ? '⭐ Master' : asset.action || asset.assetType}
                      </span>
                      {!asset.isMasterReference && (
                        <button
                          type="button"
                          className="saved-var-delete-btn"
                          title="Delete variation"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAsset(asset.id);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
