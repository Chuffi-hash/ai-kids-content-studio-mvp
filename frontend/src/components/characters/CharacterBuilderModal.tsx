import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CustomCharacterAppearance,
  VectorRigDefinition,
  CharacterInstance,
  AnimationClip,
  AnimationActionType,
} from '../../types/animation';
import {
  DEFAULT_APPEARANCE,
  CHARACTER_PRESETS,
  buildRigFromAppearance,
} from '../../utils/customCharacterRig';
import { evaluateCharacterPose } from '../../utils/animationEngine';
import { VectorCharacterRenderer } from '../editor/animation/VectorCharacterRenderer';
import { Character } from '../../services/character.service';
import { CloseIcon, SparklesIcon, CheckIcon } from '../common/Icons';
import './CharacterBuilderModal.css';

interface CharacterBuilderModalProps {
  isOpen: boolean;
  character?: Character | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    species: string;
    personality: string;
    visualDescription: string;
    distinctiveFeatures?: string;
    canonicalAppearance: CustomCharacterAppearance;
  }) => Promise<void>;
  onDuplicate?: (id: string) => Promise<void>;
}

type BuilderTab =
  | 'head'
  | 'neck'
  | 'hair'
  | 'face'
  | 'torso'
  | 'arms'
  | 'legs'
  | 'accessories';

const COLOR_SWATCHES = {
  skin: ['#fed7aa', '#fde68a', '#fdba74', '#f59e0b', '#d97706', '#b45309', '#78350f', '#451a03', '#94a3b8', '#a7f3d0'],
  neckScarf: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#0f172a', '#f8fafc'],
  hair: ['#0f172a', '#334155', '#78350f', '#92400e', '#b45309', '#d97706', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'],
  eyes: ['#0f172a', '#1e3a8a', '#065f46', '#78350f', '#9333ea', '#06b6d4'],
  clothes: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b', '#1e293b', '#f8fafc'],
  pants: ['#1e3a8a', '#1e293b', '#374151', '#047857', '#b45309', '#6366f1', '#475569', '#be185d'],
  shoes: ['#ef4444', '#ffffff', '#1e293b', '#f59e0b', '#10b981', '#3b82f6', '#78350f'],
};

export const CharacterBuilderModal: React.FC<CharacterBuilderModalProps> = ({
  isOpen,
  character,
  onClose,
  onSave,
  onDuplicate,
}) => {
  // Appearance state & history for undo/redo
  const initialApp = (character?.canonicalAppearance?.version === 1
    ? character.canonicalAppearance
    : DEFAULT_APPEARANCE) as CustomCharacterAppearance;

  const [appearance, setAppearance] = useState<CustomCharacterAppearance>(initialApp);
  const [history, setHistory] = useState<CustomCharacterAppearance[]>([initialApp]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Character metadata
  const [name, setName] = useState<string>(character?.name || 'My Hero');
  const [species, setSpecies] = useState<string>(character?.species || 'Human');
  const [personality, setPersonality] = useState<string>(
    character?.personality || 'Brave, cheerful and adventurous'
  );
  const [activeTab, setActiveTab] = useState<BuilderTab>('head');
  const [activeAction, setActiveAction] = useState<AnimationActionType>('idle');
  const [zoom, setZoom] = useState<number>(1.0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDuplicating, setIsDuplicating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Animation preview clock
  const [previewTimeMs, setPreviewTimeMs] = useState<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(performance.now());

  // Reset when opened or character prop changes
  useEffect(() => {
    if (isOpen) {
      const app = (character?.canonicalAppearance?.version === 1
        ? character.canonicalAppearance
        : DEFAULT_APPEARANCE) as CustomCharacterAppearance;
      setAppearance(app);
      setHistory([app]);
      setHistoryIndex(0);
      setName(character?.name || 'My Hero');
      setSpecies(character?.species || 'Human');
      setPersonality(character?.personality || 'Brave, cheerful and adventurous');
      setErrorMsg(null);
      startTimeRef.current = performance.now();
    }
  }, [isOpen, character]);

  // Animation ticker loop
  useEffect(() => {
    if (!isOpen) return;

    const tick = (now: number) => {
      setPreviewTimeMs(now - startTimeRef.current);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen]);

  // Update appearance with undo/redo stack
  const updateAppearance = useCallback(
    (updater: (prev: CustomCharacterAppearance) => CustomCharacterAppearance) => {
      setAppearance((prev) => {
        const next = updater(prev);
        // Truncate future history and append new state
        setHistory((currHist) => {
          const trimmed = currHist.slice(0, historyIndex + 1);
          return [...trimmed, next];
        });
        setHistoryIndex((prevIdx) => prevIdx + 1);
        return next;
      });
    },
    [historyIndex]
  );

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setAppearance(history[newIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setAppearance(history[newIdx]);
    }
  };

  // Keyboard shortcut listener for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, historyIndex, history]);

  // Load a preset template
  const handleApplyPreset = (presetKey: string) => {
    const preset = CHARACTER_PRESETS[presetKey];
    if (!preset) return;
    updateAppearance(() => preset.appearance);
    if (!character && name === 'My Hero') {
      setName(preset.label.split(' ')[0]);
    }
    if (preset.appearance.species) {
      setSpecies(
        preset.appearance.species.charAt(0).toUpperCase() +
          preset.appearance.species.slice(1)
      );
    }
  };

  // Build live rig from appearance
  const rig: VectorRigDefinition = buildRigFromAppearance(
    character?.id || 'custom-char',
    name || 'Hero',
    appearance
  );

  // Evaluate current action pose for preview
  const previewInstance: CharacterInstance = {
    instanceId: 'builder-preview-instance',
    characterId: rig.id,
    assetType: 'vector_rig',
    name,
    x: 250,
    y: 280,
    scale: 1.4 * zoom,
    rotation: 0,
    flipX: false,
    zIndex: 1,
    customRig: rig,
    appearance,
  };

  // Action cycle durations in ms for continuous test previews
  const ACTION_CYCLES: Record<AnimationActionType, number> = {
    idle: 3000,
    walk: 1200,
    wave: 1400,
    jump: 1300,
  };

  const actionCycleMs = ACTION_CYCLES[activeAction] || 2000;
  const cycleOffsetMs = previewTimeMs % actionCycleMs;

  const previewClip: AnimationClip = {
    clipId: 'builder-preview-clip',
    instanceId: 'builder-preview-instance',
    action: activeAction,
    startMs: 0,
    durationMs: actionCycleMs,
    loop: true,
    motionMode: 'in_place',
  };

  const pose = evaluateCharacterPose(previewInstance, [previewClip], cycleOffsetMs);

  const handleSelectAction = (action: AnimationActionType) => {
    setActiveAction(action);
    startTimeRef.current = performance.now();
    setPreviewTimeMs(0);
  };

  const handleSaveSubmit = async () => {
    if (!name.trim()) {
      setErrorMsg('Please enter a character name');
      return;
    }
    try {
      setIsSaving(true);
      setErrorMsg(null);
      await onSave({
        name: name.trim(),
        species: species.trim() || 'Human',
        personality: personality.trim() || 'Friendly and adventurous',
        visualDescription: `Custom vector character: ${appearance.gender || 'neutral'} ${appearance.species || 'human'} with ${appearance.hair.style} hair and ${appearance.torso.clothingStyle}`,
        distinctiveFeatures: `${appearance.hair.color} hair, ${appearance.torso.shirtColor} top`,
        canonicalAppearance: appearance,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save character');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateClick = async () => {
    if (!character || !onDuplicate) return;
    try {
      setIsDuplicating(true);
      setErrorMsg(null);
      await onDuplicate(character.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to duplicate character');
    } finally {
      setIsDuplicating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="char-builder-overlay" onClick={onClose}>
      <div className="char-builder-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Header Bar */}
        <div className="char-builder-header">
          <div className="char-builder-header-left">
            <span className="char-builder-badge">Vector Rig Studio</span>
            <input
              type="text"
              className="char-builder-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Character Name..."
            />
          </div>

          <div className="char-builder-header-center">
            {/* Presets Quick Picker */}
            <span className="char-builder-label">Presets:</span>
            <div className="char-builder-preset-buttons">
              {Object.entries(CHARACTER_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  className="char-builder-preset-btn"
                  onClick={() => handleApplyPreset(key)}
                  title={`Load ${p.label} preset`}
                >
                  {p.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="char-builder-header-actions">
            {/* Undo / Redo */}
            <div className="char-builder-history-btns">
              <button
                type="button"
                className="char-builder-icon-btn"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title="Undo (Ctrl+Z)"
              >
                ↺
              </button>
              <button
                type="button"
                className="char-builder-icon-btn"
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                title="Redo (Ctrl+Y)"
              >
                ↻
              </button>
            </div>

            {character && onDuplicate && (
              <button
                type="button"
                className="char-builder-btn secondary"
                onClick={handleDuplicateClick}
                disabled={isDuplicating || isSaving}
              >
                {isDuplicating ? 'Duplicating...' : 'Duplicate'}
              </button>
            )}

            <button
              type="button"
              className="char-builder-btn primary"
              onClick={handleSaveSubmit}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : character ? 'Save Changes' : 'Save Character'}
            </button>

            <button
              type="button"
              className="char-builder-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {errorMsg && <div className="char-builder-alert">{errorMsg}</div>}

        {/* Main Body: Two Columns */}
        <div className="char-builder-content">
          {/* LEFT: Customizer Panel */}
          <div className="char-builder-controls-panel">
            {/* Tab Navigation */}
            <div className="char-builder-tabs">
              <button
                type="button"
                className={`char-builder-tab ${activeTab === 'head' ? 'active' : ''}`}
                onClick={() => setActiveTab('head')}
              >
                👤 Head
              </button>
              <button
                type="button"
                className={`char-builder-tab ${activeTab === 'neck' ? 'active' : ''}`}
                onClick={() => setActiveTab('neck')}
              >
                🦒 Neck
              </button>
              <button
                type="button"
                className={`char-builder-tab ${activeTab === 'hair' ? 'active' : ''}`}
                onClick={() => setActiveTab('hair')}
              >
                💇 Hair
              </button>
              <button
                type="button"
                className={`char-builder-tab ${activeTab === 'face' ? 'active' : ''}`}
                onClick={() => setActiveTab('face')}
              >
                👀 Face
              </button>
              <button
                type="button"
                className={`char-builder-tab ${activeTab === 'torso' ? 'active' : ''}`}
                onClick={() => setActiveTab('torso')}
              >
                👕 Torso
              </button>
              <button
                type="button"
                className={`char-builder-tab ${activeTab === 'arms' ? 'active' : ''}`}
                onClick={() => setActiveTab('arms')}
              >
                💪 Arms
              </button>
              <button
                type="button"
                className={`char-builder-tab ${activeTab === 'legs' ? 'active' : ''}`}
                onClick={() => setActiveTab('legs')}
              >
                👖 Legs
              </button>
              <button
                type="button"
                className={`char-builder-tab ${activeTab === 'accessories' ? 'active' : ''}`}
                onClick={() => setActiveTab('accessories')}
              >
                👓 Extras
              </button>
            </div>

            {/* Tab Controls Content */}
            <div className="char-builder-tab-body">
              {/* 1. HEAD TAB */}
              {activeTab === 'head' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Species / Archetype</label>
                    <div className="char-pill-row">
                      {(['human', 'bear', 'robot', 'animal'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`char-pill-btn ${appearance.species === s ? 'active' : ''}`}
                          onClick={() => {
                            updateAppearance((a) => ({ ...a, species: s }));
                            setSpecies(s.charAt(0).toUpperCase() + s.slice(1));
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Head Shape</label>
                    <div className="char-pill-row">
                      {(['round', 'oval', 'square', 'heart'] as const).map((shape) => (
                        <button
                          key={shape}
                          type="button"
                          className={`char-pill-btn ${appearance.head.shape === shape ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              head: { ...a.head, shape },
                            }))
                          }
                        >
                          {shape}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Head Size: {appearance.head.size.toFixed(2)}x</label>
                    <input
                      type="range"
                      min="0.8"
                      max="1.3"
                      step="0.05"
                      value={appearance.head.size}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        updateAppearance((a) => ({
                          ...a,
                          head: { ...a.head, size: val },
                        }));
                      }}
                    />
                  </div>

                  <div className="char-control-group">
                    <label>Skin Tone</label>
                    <div className="char-swatch-row">
                      {COLOR_SWATCHES.skin.map((col) => (
                        <button
                          key={col}
                          type="button"
                          className={`char-color-swatch ${appearance.head.skinColor === col ? 'active' : ''}`}
                          style={{ backgroundColor: col }}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              head: { ...a.head, skinColor: col },
                              arms: { ...a.arms, skinColor: col },
                            }))
                          }
                        />
                      ))}
                      <input
                        type="color"
                        value={appearance.head.skinColor}
                        onChange={(e) =>
                          updateAppearance((a) => ({
                            ...a,
                            head: { ...a.head, skinColor: e.target.value },
                            arms: { ...a.arms, skinColor: e.target.value },
                          }))
                        }
                        className="char-color-picker"
                      />
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Ears Style</label>
                    <div className="char-pill-row">
                      {(['human', 'round', 'bear', 'elf'] as const).map((ear) => (
                        <button
                          key={ear}
                          type="button"
                          className={`char-pill-btn ${appearance.ears.style === ear ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              ears: { ...a.ears, style: ear },
                            }))
                          }
                        >
                          {ear}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. NECK TAB */}
              {activeTab === 'neck' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Neck Length & Posture</label>
                    <div className="char-pill-row">
                      {([
                        { id: 'short', label: 'Short (Chibi)' },
                        { id: 'normal', label: 'Normal (Standard)' },
                        { id: 'long', label: 'Long (Tall)' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`char-pill-btn ${(appearance.neck?.length || 'normal') === opt.id ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              neck: { ...a.neck, length: opt.id },
                            }))
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Neck Thickness</label>
                    <div className="char-pill-row">
                      {([
                        { id: 'slim', label: 'Slim' },
                        { id: 'normal', label: 'Standard' },
                        { id: 'wide', label: 'Wide' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`char-pill-btn ${(appearance.neck?.thickness || 'normal') === opt.id ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              neck: { ...a.neck, thickness: opt.id },
                            }))
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Neck Style & Accessories</label>
                    <div className="char-pill-row">
                      {([
                        { id: 'plain', label: 'Plain Skin' },
                        { id: 'band', label: 'Collar Band' },
                        { id: 'scarf', label: 'Scarf / Bandana' },
                        { id: 'chibi', label: 'Chibi Overlap' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`char-pill-btn ${(appearance.neck?.style || 'plain') === opt.id ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              neck: { ...a.neck, style: opt.id },
                            }))
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {appearance.neck?.style && appearance.neck.style !== 'plain' && appearance.neck.style !== 'chibi' && (
                    <div className="char-control-group">
                      <label>Accessory Color</label>
                      <div className="char-swatch-row">
                        {COLOR_SWATCHES.neckScarf.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`char-color-swatch ${(appearance.neck?.color || '#ef4444') === c ? 'active' : ''}`}
                            style={{ backgroundColor: c }}
                            onClick={() =>
                              updateAppearance((a) => ({
                                ...a,
                                neck: { ...a.neck, color: c },
                              }))
                            }
                            aria-label={`Color ${c}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 3. HAIR TAB */}
              {activeTab === 'hair' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Hair Style</label>
                    <div className="char-pill-grid">
                      {(
                        [
                          'short',
                          'curly',
                          'spiky',
                          'bob',
                          'long',
                          'ponytail',
                          'bear_ears',
                          'none',
                        ] as const
                      ).map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={`char-pill-btn ${appearance.hair.style === style ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              hair: { ...a.hair, style },
                            }))
                          }
                        >
                          {style.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Hair Color</label>
                    <div className="char-swatch-row">
                      {COLOR_SWATCHES.hair.map((col) => (
                        <button
                          key={col}
                          type="button"
                          className={`char-color-swatch ${appearance.hair.color === col ? 'active' : ''}`}
                          style={{ backgroundColor: col }}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              hair: { ...a.hair, color: col },
                              eyebrows: { ...a.eyebrows, color: col },
                            }))
                          }
                        />
                      ))}
                      <input
                        type="color"
                        value={appearance.hair.color}
                        onChange={(e) =>
                          updateAppearance((a) => ({
                            ...a,
                            hair: { ...a.hair, color: e.target.value },
                            eyebrows: { ...a.eyebrows, color: e.target.value },
                          }))
                        }
                        className="char-color-picker"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. FACE TAB (Eyes, Eyebrows, Nose, Mouth) */}
              {activeTab === 'face' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Eye Style</label>
                    <div className="char-pill-row">
                      {(['round', 'dot', 'anime', 'happy', 'sleepy'] as const).map(
                        (style) => (
                          <button
                            key={style}
                            type="button"
                            className={`char-pill-btn ${appearance.eyes.style === style ? 'active' : ''}`}
                            onClick={() =>
                              updateAppearance((a) => ({
                                ...a,
                                eyes: { ...a.eyes, style },
                              }))
                            }
                          >
                            {style}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Eye Color</label>
                    <div className="char-swatch-row">
                      {COLOR_SWATCHES.eyes.map((col) => (
                        <button
                          key={col}
                          type="button"
                          className={`char-color-swatch ${appearance.eyes.color === col ? 'active' : ''}`}
                          style={{ backgroundColor: col }}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              eyes: { ...a.eyes, color: col },
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Eyebrows Style</label>
                    <div className="char-pill-row">
                      {(['curved', 'flat', 'bushy', 'arched'] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={`char-pill-btn ${appearance.eyebrows.style === style ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              eyebrows: { ...a.eyebrows, style },
                            }))
                          }
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Nose Style</label>
                    <div className="char-pill-row">
                      {(['button', 'dot', 'triangle', 'oval', 'bear_snout'] as const).map(
                        (style) => (
                          <button
                            key={style}
                            type="button"
                            className={`char-pill-btn ${appearance.nose.style === style ? 'active' : ''}`}
                            onClick={() =>
                              updateAppearance((a) => ({
                                ...a,
                                nose: { ...a.nose, style },
                              }))
                            }
                          >
                            {style.replace('_', ' ')}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Mouth Style</label>
                    <div className="char-pill-row">
                      {(['smile', 'open_grin', 'laugh', 'surprised', 'line'] as const).map(
                        (style) => (
                          <button
                            key={style}
                            type="button"
                            className={`char-pill-btn ${appearance.mouth.style === style ? 'active' : ''}`}
                            onClick={() =>
                              updateAppearance((a) => ({
                                ...a,
                                mouth: { ...a.mouth, style },
                              }))
                            }
                          >
                            {style.replace('_', ' ')}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. TORSO TAB */}
              {activeTab === 'torso' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Clothing Type</label>
                    <div className="char-pill-grid">
                      {(
                        ['tshirt', 'hoodie', 'vest', 'collared', 'dress'] as const
                      ).map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={`char-pill-btn ${appearance.torso.clothingStyle === style ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              torso: { ...a.torso, clothingStyle: style },
                            }))
                          }
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Shirt Color</label>
                    <div className="char-swatch-row">
                      {COLOR_SWATCHES.clothes.map((col) => (
                        <button
                          key={col}
                          type="button"
                          className={`char-color-swatch ${appearance.torso.shirtColor === col ? 'active' : ''}`}
                          style={{ backgroundColor: col }}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              torso: { ...a.torso, shirtColor: col },
                            }))
                          }
                        />
                      ))}
                      <input
                        type="color"
                        value={appearance.torso.shirtColor}
                        onChange={(e) =>
                          updateAppearance((a) => ({
                            ...a,
                            torso: { ...a.torso, shirtColor: e.target.value },
                          }))
                        }
                        className="char-color-picker"
                      />
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Shirt Pattern</label>
                    <div className="char-pill-row">
                      {(['none', 'star', 'stripe', 'circle'] as const).map((pat) => (
                        <button
                          key={pat}
                          type="button"
                          className={`char-pill-btn ${appearance.torso.pattern === pat ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              torso: { ...a.torso, pattern: pat },
                            }))
                          }
                        >
                          {pat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Torso Width: {appearance.torso.width.toFixed(2)}x</label>
                    <input
                      type="range"
                      min="0.8"
                      max="1.3"
                      step="0.05"
                      value={appearance.torso.width}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        updateAppearance((a) => ({
                          ...a,
                          torso: { ...a.torso, width: val },
                        }));
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 5. ARMS TAB */}
              {activeTab === 'arms' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Sleeve Length</label>
                    <div className="char-pill-row">
                      {(['short', 'long', 'sleeveless'] as const).map((sleeve) => (
                        <button
                          key={sleeve}
                          type="button"
                          className={`char-pill-btn ${appearance.arms.sleeveStyle === sleeve ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              arms: { ...a.arms, sleeveStyle: sleeve },
                            }))
                          }
                        >
                          {sleeve}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Hand Shape</label>
                    <div className="char-pill-row">
                      {(['simple', 'mitten', 'paw'] as const).map((hand) => (
                        <button
                          key={hand}
                          type="button"
                          className={`char-pill-btn ${appearance.arms.handShape === hand ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              arms: { ...a.arms, handShape: hand },
                            }))
                          }
                        >
                          {hand}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Arm Thickness: {appearance.arms.thickness.toFixed(2)}x</label>
                    <input
                      type="range"
                      min="0.8"
                      max="1.3"
                      step="0.05"
                      value={appearance.arms.thickness}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        updateAppearance((a) => ({
                          ...a,
                          arms: { ...a.arms, thickness: val },
                        }));
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 6. LEGS TAB */}
              {activeTab === 'legs' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Bottom Style</label>
                    <div className="char-pill-row">
                      {(['pants', 'shorts', 'skirt'] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={`char-pill-btn ${appearance.legs.pantsStyle === style ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              legs: { ...a.legs, pantsStyle: style },
                            }))
                          }
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Pants / Skirt Color</label>
                    <div className="char-swatch-row">
                      {COLOR_SWATCHES.pants.map((col) => (
                        <button
                          key={col}
                          type="button"
                          className={`char-color-swatch ${appearance.legs.pantsColor === col ? 'active' : ''}`}
                          style={{ backgroundColor: col }}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              legs: { ...a.legs, pantsColor: col },
                            }))
                          }
                        />
                      ))}
                      <input
                        type="color"
                        value={appearance.legs.pantsColor}
                        onChange={(e) =>
                          updateAppearance((a) => ({
                            ...a,
                            legs: { ...a.legs, pantsColor: e.target.value },
                          }))
                        }
                        className="char-color-picker"
                      />
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Shoe Style</label>
                    <div className="char-pill-row">
                      {(['sneakers', 'boots', 'shoes'] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={`char-pill-btn ${appearance.legs.shoeStyle === style ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              legs: { ...a.legs, shoeStyle: style },
                            }))
                          }
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Shoe Color</label>
                    <div className="char-swatch-row">
                      {COLOR_SWATCHES.shoes.map((col) => (
                        <button
                          key={col}
                          type="button"
                          className={`char-color-swatch ${appearance.legs.shoeColor === col ? 'active' : ''}`}
                          style={{ backgroundColor: col }}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              legs: { ...a.legs, shoeColor: col },
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 7. ACCESSORIES TAB */}
              {activeTab === 'accessories' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Glasses</label>
                    <div className="char-pill-row">
                      {(['none', 'round', 'square'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          className={`char-pill-btn ${(appearance.accessories?.glasses || 'none') === g ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              accessories: { ...a.accessories, glasses: g },
                            }))
                          }
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Hat / Headwear</label>
                    <div className="char-pill-row">
                      {(['none', 'cap', 'beanie'] as const).map((h) => (
                        <button
                          key={h}
                          type="button"
                          className={`char-pill-btn ${(appearance.accessories?.hat || 'none') === h ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              accessories: { ...a.accessories, hat: h },
                            }))
                          }
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Cheek Blush</label>
                    <button
                      type="button"
                      className={`char-pill-btn ${appearance.accessories?.blush ? 'active' : ''}`}
                      onClick={() =>
                        updateAppearance((a) => ({
                          ...a,
                          accessories: {
                            ...a.accessories,
                            blush: !a.accessories?.blush,
                          },
                        }))
                      }
                    >
                      {appearance.accessories?.blush ? 'Enabled ✓' : 'Disabled'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Live Interactive Preview Stage */}
          <div className="char-builder-stage-panel">
            <div className="char-builder-stage-wrapper">
              <svg
                viewBox="0 0 500 500"
                className="char-builder-stage-svg"
                style={{ width: '100%', height: '100%' }}
              >
                <defs>
                  {/* Subtle ground shadow gradient */}
                  <radialGradient id="builder-char-shadow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(0,0,0,0.4)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                  </radialGradient>
                  {/* Soft grid background */}
                  <pattern id="builder-grid" width="25" height="25" patternUnits="userSpaceOnUse">
                    <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#1e293b" strokeWidth="1" strokeOpacity="0.5" />
                  </pattern>
                </defs>

                {/* Stage Backdrop */}
                <rect width="500" height="500" fill="#0b101b" />
                <rect width="500" height="500" fill="url(#builder-grid)" />
                <line x1="50" y1="430" x2="450" y2="430" stroke="#334155" strokeWidth="2" strokeDasharray="4 4" />

                {/* Ground Shadow */}
                <ellipse
                  cx={pose.x}
                  cy={280 + (rig.baseHeight / 2) * 1.4 * zoom - 8}
                  rx={Math.max(12, 55 * 1.4 * zoom * (1 + (pose.y - 280) / 220))}
                  ry={Math.max(5, 16 * 1.4 * zoom * (1 + (pose.y - 280) / 220))}
                  opacity={Math.max(0.25, 0.8 + (pose.y - 280) / 200)}
                  fill="url(#builder-char-shadow)"
                />

                {/* Live Character Renderer */}
                <VectorCharacterRenderer
                  rig={rig}
                  pose={pose}
                  isSelected={false}
                />
              </svg>

              {/* Action Test Controls */}
              <div className="char-builder-stage-actions">
                <span className="char-action-label">Test Animation:</span>
                <div className="char-action-pill-group">
                  <button
                    type="button"
                    className={`char-action-btn ${activeAction === 'idle' ? 'active' : ''}`}
                    onClick={() => handleSelectAction('idle')}
                  >
                    ⏸ Idle
                  </button>
                  <button
                    type="button"
                    className={`char-action-btn ${activeAction === 'walk' ? 'active' : ''}`}
                    onClick={() => handleSelectAction('walk')}
                  >
                    🚶 Walk
                  </button>
                  <button
                    type="button"
                    className={`char-action-btn ${activeAction === 'wave' ? 'active' : ''}`}
                    onClick={() => handleSelectAction('wave')}
                  >
                    👋 Wave
                  </button>
                  <button
                    type="button"
                    className={`char-action-btn ${activeAction === 'jump' ? 'active' : ''}`}
                    onClick={() => handleSelectAction('jump')}
                  >
                    🦘 Jump
                  </button>
                </div>
              </div>

              {/* Zoom & Rig Info Bar */}
              <div className="char-builder-stage-footer">
                <div className="char-stage-rig-badge">
                  <CheckIcon size={12} /> 7 Articulated Joints • Export Ready
                </div>
                <div className="char-stage-zoom">
                  <button
                    type="button"
                    className="char-zoom-btn"
                    onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))}
                    title="Zoom out"
                  >
                    -
                  </button>
                  <span className="char-zoom-value">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    className="char-zoom-btn"
                    onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                    title="Zoom in"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="char-zoom-btn"
                    onClick={() => setZoom(1.0)}
                    title="Reset zoom"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CharacterBuilderModal;

