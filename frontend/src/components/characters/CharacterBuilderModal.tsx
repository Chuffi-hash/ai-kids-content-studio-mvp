import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CustomCharacterAppearance,
  VectorRigDefinition,
  CharacterInstance,
  AnimationClip,
  AnimationActionType,
  ArmLimbConfig,
  LegLimbConfig,
} from '../../types/animation';
import {
  DEFAULT_APPEARANCE,
  CHARACTER_PRESETS,
  buildRigFromAppearance,
  normalizeAppearance,
} from '../../utils/customCharacterRig';
import { evaluateCharacterPose } from '../../utils/animationEngine';
import { VectorCharacterRenderer } from '../editor/animation/VectorCharacterRenderer';
import { Character } from '../../services/character.service';
import { previewVoice } from '../../services/editor.service';
import { resolveAssetUrl } from '../../utils/urlHelper';
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
  | 'identity'
  | 'voice'
  | 'head'
  | 'neck'
  | 'hair'
  | 'face'
  | 'torso'
  | 'arms'
  | 'legs'
  | 'accessories';

export const ALL_SPECIES = [
  'human',
  'planet',
  'bear',
  'animal',
  'robot',
  'fantasy creature',
  'alien',
  'plant',
  'object',
  'other',
] as const;

export const CHARACTERISTIC_PRESETS = [
  'Brave',
  'Cheerful',
  'Helpful',
  'Loyal',
  'Curious',
  'Kind',
  'Wise',
  'Playful',
  'Shy',
  'Adventurous',
  'Smart',
  'Funny',
  'Strong',
  'Gentle',
  'Creative',
  'Energetic',
  'Calm',
];

const COLOR_SWATCHES = {
  skin: ['#fed7aa', '#fde68a', '#fdba74', '#f59e0b', '#d97706', '#b45309', '#78350f', '#451a03', '#94a3b8', '#a7f3d0'],
  neckScarf: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#0f172a', '#f8fafc'],
  hair: ['#0f172a', '#334155', '#78350f', '#92400e', '#b45309', '#d97706', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'],
  eyes: ['#0f172a', '#1e3a8a', '#065f46', '#78350f', '#9333ea', '#06b6d4'],
  clothes: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b', '#1e293b', '#f8fafc'],
  pants: ['#1e3a8a', '#1e293b', '#374151', '#047857', '#b45309', '#6366f1', '#475569', '#be185d'],
  shoes: ['#ef4444', '#ffffff', '#1e293b', '#f59e0b', '#10b981', '#3b82f6', '#78350f'],
};

/**
 * Resolves initial appearance safely for any character, preserving species and non-human rigs.
 */
export function resolveInitialAppearance(character?: Character | null): {
  appearance: CustomCharacterAppearance;
  isNewRigSetup: boolean;
  setupNotice?: string;
} {
  if (character?.canonicalAppearance && (character.canonicalAppearance as any).version === 1) {
    return {
      appearance: normalizeAppearance(character.canonicalAppearance),
      isNewRigSetup: false,
    };
  }

  // Check species or name to pick an appropriate starting preset instead of blindly defaulting to human boy
  const sp = (character?.species || '').toLowerCase();
  const nm = (character?.name || '').toLowerCase();
  let basePreset = CHARACTER_PRESETS.kid_boy.appearance;

  if (
    sp.includes('planet') ||
    sp.includes('earth') ||
    nm.includes('earth') ||
    nm.includes('terra')
  ) {
    basePreset = CHARACTER_PRESETS.earth.appearance;
  } else if (sp.includes('bear') || nm.includes('bear') || nm.includes('pip')) {
    basePreset = CHARACTER_PRESETS.bear_cub.appearance;
  } else if (sp.includes('robot') || nm.includes('robot') || nm.includes('sparky')) {
    basePreset = CHARACTER_PRESETS.robot.appearance;
  } else if (sp.includes('girl') || nm.includes('girl') || nm.includes('maya')) {
    basePreset = CHARACTER_PRESETS.kid_girl.appearance;
  }

  const normalized = normalizeAppearance({
    ...basePreset,
    species: character?.species || basePreset.species,
  });

  const setupNotice = character
    ? `✨ 2D Puppet Setup: "${character.name}" was created without a 2D puppet. We prepared a starter ${character.species || 'human'} puppet for you to customize. Click "Save Changes" to attach it, or "✕" to leave your character untouched.`
    : undefined;

  return {
    appearance: normalized,
    isNewRigSetup: Boolean(character),
    setupNotice,
  };
}

export const CharacterBuilderModal: React.FC<CharacterBuilderModalProps> = ({
  isOpen,
  character,
  onClose,
  onSave,
  onDuplicate,
}) => {
  const initialResolved = resolveInitialAppearance(character);
  const initialApp = initialResolved.appearance;

  const [appearance, setAppearance] = useState<CustomCharacterAppearance>(initialApp);
  const [history, setHistory] = useState<CustomCharacterAppearance[]>([initialApp]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Character metadata
  const [name, setName] = useState<string>(character?.name || 'My Hero');
  const [species, setSpecies] = useState<string>(
    character?.species ||
      (initialApp.species
        ? initialApp.species.charAt(0).toUpperCase() + initialApp.species.slice(1)
        : 'Human')
  );
  const [personality, setPersonality] = useState<string>(
    character?.personality || 'Brave, cheerful and adventurous'
  );
  const [setupNotice, setSetupNotice] = useState<string | null>(
    initialResolved.setupNotice || null
  );
  const [armSymmetry, setArmSymmetry] = useState<'symmetrical' | 'independent'>('symmetrical');
  const [selectedArm, setSelectedArm] = useState<'left' | 'right'>('left');
  const [legSymmetry, setLegSymmetry] = useState<'symmetrical' | 'independent'>('symmetrical');
  const [selectedLeg, setSelectedLeg] = useState<'left' | 'right'>('left');

  const [activeTab, setActiveTab] = useState<BuilderTab>('head');
  const [activeAction, setActiveAction] = useState<AnimationActionType>('idle');
  const [zoom, setZoom] = useState<number>(1.0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDuplicating, setIsDuplicating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Voice audition preview state
  const [isPreviewingVoice, setIsPreviewingVoice] = useState<boolean>(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const isPlanetSpecies = appearance.species === 'planet';

  const tabsRef = useRef<HTMLDivElement | null>(null);

  const scrollTabs = (offset: number) => {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Automatically switch tab if current tab is not applicable to planet
  useEffect(() => {
    if (isPlanetSpecies && ['neck', 'hair', 'torso', 'arms', 'legs'].includes(activeTab)) {
      setActiveTab('head');
    }
  }, [isPlanetSpecies, activeTab]);

  useEffect(() => {
    if (tabsRef.current) {
      const activeEl = tabsRef.current.querySelector('.char-builder-tab.active') as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab]);

  const handleAuditionVoice = async () => {
    try {
      setIsPreviewingVoice(true);
      const effectiveVoice = appearance.voiceConfig?.voiceId || (
        appearance.species === 'planet' ? 'bm_daniel' :
        appearance.species === 'bear' ? 'bm_george' :
        appearance.species === 'robot' ? 'bm_lewis' :
        appearance.gender === 'girl' ? 'af_bella' : 'am_adam'
      );
      const sampleText = `Hello! I'm ${name || 'your friend'}, and I'm ready to tell our story!`;
      const res = await previewVoice({
        voice: effectiveVoice,
        speed: appearance.voiceConfig?.speed ?? 1.0,
        effect: appearance.voiceConfig?.effect || 'normal',
        sampleText,
      });
      setPreviewAudioUrl(res.audioUrl);
      const audio = new Audio(resolveAssetUrl(res.audioUrl));
      previewAudioRef.current = audio;
      await audio.play();
    } catch (err: any) {
      console.error('Failed to preview character voice:', err);
      alert(`Voice preview failed: ${err.message || String(err)}`);
    } finally {
      setIsPreviewingVoice(false);
    }
  };

  // Animation preview clock
  const [previewTimeMs, setPreviewTimeMs] = useState<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(performance.now());

  // Reset when opened or character prop changes
  useEffect(() => {
    if (isOpen) {
      const resolved = resolveInitialAppearance(character);
      setAppearance(resolved.appearance);
      setHistory([resolved.appearance]);
      setHistoryIndex(0);
      setName(character?.name || 'My Hero');
      setSpecies(
        character?.species ||
          (resolved.appearance.species
            ? resolved.appearance.species.charAt(0).toUpperCase() +
              resolved.appearance.species.slice(1)
            : 'Human')
      );
      setPersonality(character?.personality || 'Brave, cheerful and adventurous');
      setSetupNotice(resolved.setupNotice || null);

      const isArmDiff =
        resolved.appearance.leftArm &&
        resolved.appearance.rightArm &&
        JSON.stringify(resolved.appearance.leftArm) !==
          JSON.stringify(resolved.appearance.rightArm);
      setArmSymmetry(isArmDiff ? 'independent' : 'symmetrical');

      const isLegDiff =
        resolved.appearance.leftLeg &&
        resolved.appearance.rightLeg &&
        JSON.stringify(resolved.appearance.leftLeg) !==
          JSON.stringify(resolved.appearance.rightLeg);
      setLegSymmetry(isLegDiff ? 'independent' : 'symmetrical');

      setErrorMsg(null);
      startTimeRef.current = performance.now();
    }
  }, [isOpen, character]);

  // Lock background body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overscrollBehavior = originalOverscroll;
    };
  }, [isOpen]);

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

  const toggleCharacteristic = (trait: string) => {
    const existing = personality
      .split(/[,;&]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const traitLower = trait.toLowerCase();
    const index = existing.findIndex((t) => t.toLowerCase() === traitLower);
    let next: string[];
    if (index >= 0) {
      next = existing.filter((_, i) => i !== index);
    } else {
      next = [...existing, trait];
    }
    setPersonality(next.join(', '));
  };

  const isTraitActive = (trait: string) => {
    return personality
      .toLowerCase()
      .split(/[,;&]+/)
      .map((t) => t.trim())
      .includes(trait.toLowerCase());
  };

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
    const normalized = normalizeAppearance(preset.appearance);
    updateAppearance(() => normalized);
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
        species: species.trim() || character?.species || 'Human',
        personality: personality.trim() || character?.personality || 'Friendly and adventurous',
        visualDescription:
          character?.visualDescription && character.visualDescription.trim().length > 0
            ? character.visualDescription
            : `Custom vector character: ${appearance.gender || 'neutral'} ${appearance.species || 'human'} with ${appearance.hair.style} hair and ${appearance.torso.clothingStyle}`,
        distinctiveFeatures:
          character?.distinctiveFeatures && character.distinctiveFeatures.trim().length > 0
            ? character.distinctiveFeatures
            : `${appearance.hair.color} hair, ${appearance.torso.shirtColor} top`,
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
    <div
      className="char-builder-overlay"
      onClick={onClose}
      onWheel={(e) => {
        if (Math.abs(e.deltaX) > 0) {
          e.stopPropagation();
        }
      }}
    >
      <div
        className="char-builder-modal"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) > 0) {
            e.stopPropagation();
          }
        }}
      >
        {/* Setup notice banner when opening an existing character that lacked a 2D vector rig */}
        {setupNotice && (
          <div className="char-builder-setup-notice">
            <span>{setupNotice}</span>
            <button
              type="button"
              onClick={() => setSetupNotice(null)}
              title="Dismiss notice"
            >
              ✕
            </button>
          </div>
        )}

        {/* Top Header Bar */}
        <div className="char-builder-header">
          <div className="char-builder-header-left">
            <span className="char-builder-badge">
              {character ? 'Edit Character' : 'Vector Rig Studio'}
            </span>
            <input
              type="text"
              className="char-builder-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Character Name..."
            />
            <span
              className="char-builder-badge"
              style={{
                background: 'rgba(139, 92, 246, 0.2)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                color: '#c4b5fd',
              }}
              title="Species Archetype"
            >
              {species || 'Human'}
            </span>
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
            {/* Tab Navigation with horizontal scrolling */}
            <div className="char-builder-tabs-container">
              <button
                type="button"
                className="char-builder-tab-scroll-btn left"
                onClick={() => scrollTabs(-120)}
                title="Scroll tabs left"
              >
                ‹
              </button>
              <div
                className="char-builder-tabs"
                ref={tabsRef}
                onWheel={(e) => {
                  if (e.deltaY !== 0) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
              >
                <button
                  type="button"
                  className={`char-builder-tab ${activeTab === 'identity' ? 'active' : ''}`}
                  onClick={() => setActiveTab('identity')}
                >
                  🏷️ Identity
                </button>
                <button
                  type="button"
                  className={`char-builder-tab ${activeTab === 'voice' ? 'active' : ''}`}
                  onClick={() => setActiveTab('voice')}
                >
                  🎙️ Voice
                </button>
                <button
                  type="button"
                  className={`char-builder-tab ${activeTab === 'head' ? 'active' : ''}`}
                  onClick={() => setActiveTab('head')}
                >
                  {isPlanetSpecies ? '🌍 Globe' : '👤 Head'}
                </button>
                {!isPlanetSpecies && (
                  <>
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
                  </>
                )}
                <button
                  type="button"
                  className={`char-builder-tab ${activeTab === 'face' ? 'active' : ''}`}
                  onClick={() => setActiveTab('face')}
                >
                  👀 Face
                </button>
                {!isPlanetSpecies && (
                  <button
                    type="button"
                    className={`char-builder-tab ${activeTab === 'torso' ? 'active' : ''}`}
                    onClick={() => setActiveTab('torso')}
                  >
                    👕 Torso
                  </button>
                )}
                {!isPlanetSpecies && (
                  <button
                    type="button"
                    className={`char-builder-tab ${activeTab === 'arms' ? 'active' : ''}`}
                    onClick={() => setActiveTab('arms')}
                  >
                    💪 Arms
                  </button>
                )}
                {!isPlanetSpecies && (
                  <button
                    type="button"
                    className={`char-builder-tab ${activeTab === 'legs' ? 'active' : ''}`}
                    onClick={() => setActiveTab('legs')}
                  >
                    👖 Legs
                  </button>
                )}
                <button
                  type="button"
                  className={`char-builder-tab ${activeTab === 'accessories' ? 'active' : ''}`}
                  onClick={() => setActiveTab('accessories')}
                >
                  👓 Extras
                </button>
              </div>
              <button
                type="button"
                className="char-builder-tab-scroll-btn right"
                onClick={() => scrollTabs(120)}
                title="Scroll tabs right"
              >
                ›
              </button>
            </div>

            {/* Tab Controls Content */}
            <div className="char-builder-tab-body">
              {/* 0. IDENTITY TAB */}
              {activeTab === 'identity' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Character Name</label>
                    <input
                      type="text"
                      className="char-builder-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Sammy, Pip, Sparky..."
                    />
                  </div>

                  <div className="char-control-group">
                    <label>Species / Archetype</label>
                    <div className="char-pill-row">
                      {ALL_SPECIES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`char-pill-btn ${appearance.species === s ? 'active' : ''}`}
                          onClick={() => {
                            if (s === 'planet') {
                              updateAppearance((a) => ({
                                ...a,
                                species: 'planet',
                                head: {
                                  ...a.head,
                                  shape: 'round',
                                  skinColor: a.planet?.oceanColor || '#1d4ed8',
                                },
                                hair: {
                                  ...a.hair,
                                  style: 'none',
                                  color: a.planet?.continentColor || '#10b981',
                                },
                                eyes: {
                                  ...a.eyes,
                                  style: 'round',
                                  size: 1.1,
                                  color: '#0f172a',
                                },
                                eyebrows: {
                                  ...a.eyebrows,
                                  style: 'curved',
                                  color: '#0f172a',
                                },
                                nose: {
                                  ...a.nose,
                                  style: 'button',
                                  color: '#38bdf8',
                                  size: 0.9,
                                },
                                mouth: {
                                  ...a.mouth,
                                  style: 'smile',
                                  color: '#be123c',
                                },
                                planet: {
                                  oceanColor: a.planet?.oceanColor || '#1d4ed8',
                                  continentColor: a.planet?.continentColor || '#10b981',
                                  landmassStyle: a.planet?.landmassStyle || 'earth',
                                  atmosphereGlow: a.planet?.atmosphereGlow || 'cyan',
                                  clouds: a.planet?.clouds ?? true,
                                  showHands: false,
                                },
                                voiceConfig: {
                                  voiceId: a.voiceConfig?.voiceId && a.voiceConfig.voiceId !== 'af_heart' ? a.voiceConfig.voiceId : 'bm_daniel',
                                  speed: a.voiceConfig?.speed ?? 1.0,
                                  style: a.voiceConfig?.style ?? 'cheerful',
                                  effect: a.voiceConfig?.effect ?? 'normal',
                                },
                              }));
                              if (['neck', 'hair', 'torso', 'legs'].includes(activeTab)) {
                                setActiveTab('head');
                              }
                            } else {
                              updateAppearance((a) => ({ ...a, species: s }));
                            }
                            setSpecies(s.charAt(0).toUpperCase() + s.slice(1));
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    {appearance.species === 'other' && (
                      <div style={{ marginTop: '8px' }}>
                        <input
                          type="text"
                          className="char-builder-input"
                          value={species}
                          onChange={(e) => setSpecies(e.target.value)}
                          placeholder="Custom species name (e.g. Dragon, Elf, Fox)..."
                        />
                      </div>
                    )}
                  </div>

                  <div className="char-control-group">
                    <label>Characteristics & Personality Traits</label>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                      Click quick traits to toggle or type custom characteristics below:
                    </div>
                    <div className="char-trait-chip-row">
                      {CHARACTERISTIC_PRESETS.map((trait) => (
                        <button
                          key={trait}
                          type="button"
                          className={`char-trait-chip ${isTraitActive(trait) ? 'active' : ''}`}
                          onClick={() => toggleCharacteristic(trait)}
                        >
                          {isTraitActive(trait) ? '✓ ' : '+ '}
                          {trait}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <label style={{ fontSize: '10px', color: '#64748b' }}>Custom Traits & Description</label>
                      <input
                        type="text"
                        className="char-builder-input"
                        value={personality}
                        onChange={(e) => setPersonality(e.target.value)}
                        placeholder="e.g. Brave, cheerful, loyal and adventurous..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* VOICE TAB */}
              {activeTab === 'voice' && (
                <div className="char-builder-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        🎙️ Voice Configuration for "{name || 'Character'}"
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        Independent Kokoro-82M neural voice for character dialogue
                      </div>
                    </div>
                    <button
                      type="button"
                      className="char-builder-btn secondary"
                      style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      onClick={handleAuditionVoice}
                      disabled={isPreviewingVoice}
                    >
                      {isPreviewingVoice ? '⏳ Generating...' : '🔊 Audition Voice'}
                    </button>
                  </div>

                  {previewAudioUrl && (
                    <div
                      style={{
                        marginBottom: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(139, 92, 246, 0.15)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(139, 92, 246, 0.35)',
                      }}
                    >
                      <button
                        type="button"
                        className="char-builder-icon-btn"
                        style={{ width: '24px', height: '24px', padding: 0 }}
                        onClick={() => {
                          if (previewAudioRef.current) {
                            previewAudioRef.current.currentTime = 0;
                            previewAudioRef.current.play();
                          }
                        }}
                        title="Replay audition sample"
                      >
                        ▶
                      </button>
                      <span style={{ fontSize: '11px', color: '#e2e8f0', flex: 1 }}>
                        Auditioning voice for <strong>{name || 'Character'}</strong>
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
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <div className="char-control-group">
                    <label>Kokoro-82M Voice Assignment</label>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
                      Select the persistent default voice used when this character speaks dialogue in any scene:
                    </div>
                    <div className="char-pill-row">
                      {[
                        { id: 'bm_daniel', name: 'Daniel (Earth / Deep / Mentor)' },
                        { id: 'af_bella', name: 'Bella (Energetic Girl)' },
                        { id: 'am_adam', name: 'Adam (Playful Boy)' },
                        { id: 'bm_george', name: 'George (Warm Bear)' },
                        { id: 'bm_lewis', name: 'Lewis (Robot / Tech)' },
                        { id: 'af_heart', name: 'Heart (Warm Narrator)' },
                        { id: 'af_nicole', name: 'Nicole (Curious)' },
                        { id: 'af_sky', name: 'Sky (Cheerful)' },
                      ].map((v) => {
                        const currentVoice = appearance.voiceConfig?.voiceId || (
                          appearance.species === 'planet' ? 'bm_daniel' :
                          appearance.species === 'bear' ? 'bm_george' :
                          appearance.species === 'robot' ? 'bm_lewis' :
                          appearance.gender === 'girl' ? 'af_bella' : 'am_adam'
                        );
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={`char-pill-btn ${currentVoice === v.id ? 'active' : ''}`}
                            onClick={() =>
                              updateAppearance((a) => ({
                                ...a,
                                voiceConfig: {
                                  speed: a.voiceConfig?.speed ?? 1.0,
                                  style: a.voiceConfig?.style ?? 'cheerful',
                                  effect: a.voiceConfig?.effect ?? 'normal',
                                  voiceId: v.id,
                                },
                              }))
                            }
                          >
                            {v.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>
                      Speaking Pace: {((appearance.voiceConfig?.speed ?? 1.0)).toFixed(2)}x
                    </label>
                    <input
                      type="range"
                      min="0.7"
                      max="1.4"
                      step="0.05"
                      value={appearance.voiceConfig?.speed ?? 1.0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        updateAppearance((a) => {
                          const currentVoice = a.voiceConfig?.voiceId || (
                            a.species === 'planet' ? 'bm_daniel' :
                            a.species === 'bear' ? 'bm_george' :
                            a.species === 'robot' ? 'bm_lewis' :
                            a.gender === 'girl' ? 'af_bella' : 'am_adam'
                          );
                          return {
                            ...a,
                            voiceConfig: {
                              voiceId: currentVoice,
                              style: a.voiceConfig?.style ?? 'cheerful',
                              effect: a.voiceConfig?.effect ?? 'normal',
                              speed: val,
                            },
                          };
                        });
                      }}
                      className="char-builder-slider"
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
                      <span>Slower (0.7x)</span>
                      <span>Default (1.0x)</span>
                      <span>Faster (1.4x)</span>
                    </div>
                  </div>

                  <div className="char-control-group">
                    <label>Default Speaking Style</label>
                    <select
                      className="char-builder-input"
                      value={appearance.voiceConfig?.style || 'cheerful'}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        updateAppearance((a) => {
                          const currentVoice = a.voiceConfig?.voiceId || (
                            a.species === 'planet' ? 'bm_daniel' :
                            a.species === 'bear' ? 'bm_george' :
                            a.species === 'robot' ? 'bm_lewis' :
                            a.gender === 'girl' ? 'af_bella' : 'am_adam'
                          );
                          return {
                            ...a,
                            voiceConfig: {
                              voiceId: currentVoice,
                              speed: a.voiceConfig?.speed ?? 1.0,
                              effect: a.voiceConfig?.effect ?? 'normal',
                              style: val,
                            },
                          };
                        });
                      }}
                    >
                      <option value="cheerful">Cheerful & Friendly</option>
                      <option value="excited">Excited & Eager</option>
                      <option value="calm">Calm & Gentle</option>
                      <option value="curious">Curious & Inquiring</option>
                      <option value="worried">Worried / Shy</option>
                      <option value="sad">Sad / Soft</option>
                      <option value="serious">Serious / Brave</option>
                    </select>
                  </div>

                  <div className="char-control-group">
                    <label>Audio Processing Effect</label>
                    <div className="char-pill-row">
                      {[
                        { id: 'normal', label: 'Normal Clean' },
                        { id: 'cartoon', label: 'Cartoon Pitch (+3 semitones)' },
                        { id: 'robot', label: 'Robotic Vocoder' },
                      ].map((eff) => (
                        <button
                          key={eff.id}
                          type="button"
                          className={`char-pill-btn ${(appearance.voiceConfig?.effect || 'normal') === eff.id ? 'active' : ''}`}
                          onClick={() => {
                            updateAppearance((a) => {
                              const currentVoice = a.voiceConfig?.voiceId || (
                                a.species === 'planet' ? 'bm_daniel' :
                                a.species === 'bear' ? 'bm_george' :
                                a.species === 'robot' ? 'bm_lewis' :
                                a.gender === 'girl' ? 'af_bella' : 'am_adam'
                              );
                              return {
                                ...a,
                                voiceConfig: {
                                  voiceId: currentVoice,
                                  speed: a.voiceConfig?.speed ?? 1.0,
                                  style: a.voiceConfig?.style ?? 'cheerful',
                                  effect: eff.id as any,
                                },
                              };
                            });
                          }}
                        >
                          {eff.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 1. HEAD / GLOBE TAB */}
              {activeTab === 'head' && (
                <div className="char-builder-section">
                  <div className="char-control-group">
                    <label>Species / Archetype</label>
                    <div className="char-pill-row">
                      {ALL_SPECIES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`char-pill-btn ${appearance.species === s ? 'active' : ''}`}
                          onClick={() => {
                            if (s === 'planet') {
                              updateAppearance((a) => ({
                                ...a,
                                species: 'planet',
                                head: {
                                  ...a.head,
                                  shape: 'round',
                                  skinColor: a.planet?.oceanColor || '#1d4ed8',
                                },
                                hair: {
                                  ...a.hair,
                                  style: 'none',
                                  color: a.planet?.continentColor || '#10b981',
                                },
                                eyes: {
                                  ...a.eyes,
                                  style: 'round',
                                  size: 1.1,
                                  color: '#0f172a',
                                },
                                eyebrows: {
                                  ...a.eyebrows,
                                  style: 'curved',
                                  color: '#0f172a',
                                },
                                nose: {
                                  ...a.nose,
                                  style: 'button',
                                  color: '#38bdf8',
                                  size: 0.9,
                                },
                                mouth: {
                                  ...a.mouth,
                                  style: 'smile',
                                  color: '#be123c',
                                },
                                planet: {
                                  oceanColor: a.planet?.oceanColor || '#1d4ed8',
                                  continentColor: a.planet?.continentColor || '#10b981',
                                  landmassStyle: a.planet?.landmassStyle || 'earth',
                                  atmosphereGlow: a.planet?.atmosphereGlow || 'cyan',
                                  clouds: a.planet?.clouds ?? true,
                                  showHands: false,
                                },
                                voiceConfig: {
                                  voiceId: a.voiceConfig?.voiceId && a.voiceConfig.voiceId !== 'af_heart' ? a.voiceConfig.voiceId : 'bm_daniel',
                                  speed: a.voiceConfig?.speed ?? 1.0,
                                  style: a.voiceConfig?.style ?? 'cheerful',
                                  effect: a.voiceConfig?.effect ?? 'normal',
                                },
                              }));
                              if (['neck', 'hair', 'torso', 'legs'].includes(activeTab)) {
                                setActiveTab('head');
                              }
                            } else {
                              updateAppearance((a) => ({ ...a, species: s }));
                            }
                            setSpecies(s.charAt(0).toUpperCase() + s.slice(1));
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {appearance.species === 'planet' ? (
                    <>
                      <div className="char-control-group">
                        <label>Globe Size: {appearance.head.size.toFixed(2)}x</label>
                        <input
                          type="range"
                          min="0.8"
                          max="1.4"
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

                      {/* Ocean Water Color */}
                      <div className="char-control-group">
                        <label>🌊 Ocean Water Color</label>
                        <div className="char-swatch-row">
                          {[
                            '#1d4ed8',
                            '#0284c7',
                            '#0f766e',
                            '#4338ca',
                            '#1e3a8a',
                            '#6d28d9',
                            '#059669',
                          ].map((col) => (
                            <button
                              key={col}
                              type="button"
                              className={`char-color-swatch ${(appearance.planet?.oceanColor || appearance.head.skinColor) === col ? 'active' : ''}`}
                              style={{ backgroundColor: col }}
                              onClick={() =>
                                updateAppearance((a) => ({
                                  ...a,
                                  head: { ...a.head, skinColor: col },
                                  planet: {
                                    ...(a.planet || {
                                      continentColor: '#10b981',
                                      atmosphereGlow: 'cyan',
                                      clouds: true,
                                      showHands: true,
                                    }),
                                    oceanColor: col,
                                  },
                                }))
                              }
                            />
                          ))}
                          <input
                            type="color"
                            value={appearance.planet?.oceanColor || appearance.head.skinColor || '#1d4ed8'}
                            onChange={(e) => {
                              const col = e.target.value;
                              updateAppearance((a) => ({
                                ...a,
                                head: { ...a.head, skinColor: col },
                                planet: {
                                  ...(a.planet || {
                                    continentColor: '#10b981',
                                    atmosphereGlow: 'cyan',
                                    clouds: true,
                                    showHands: true,
                                  }),
                                  oceanColor: col,
                                },
                              }));
                            }}
                            className="char-color-picker"
                            title="Custom ocean color"
                          />
                        </div>
                      </div>

                      {/* Continent Land Color */}
                      <div className="char-control-group">
                        <label>🌱 Continent Landmass Color</label>
                        <div className="char-swatch-row">
                          {[
                            '#10b981',
                            '#059669',
                            '#15803d',
                            '#84cc16',
                            '#ca8a04',
                            '#d97706',
                            '#475569',
                          ].map((col) => (
                            <button
                              key={col}
                              type="button"
                              className={`char-color-swatch ${(appearance.planet?.continentColor || appearance.hair.color) === col ? 'active' : ''}`}
                              style={{ backgroundColor: col }}
                              onClick={() =>
                                updateAppearance((a) => ({
                                  ...a,
                                  hair: { ...a.hair, color: col },
                                  planet: {
                                    ...(a.planet || {
                                      oceanColor: '#1d4ed8',
                                      atmosphereGlow: 'cyan',
                                      clouds: true,
                                      showHands: true,
                                    }),
                                    continentColor: col,
                                  },
                                }))
                              }
                            />
                          ))}
                          <input
                            type="color"
                            value={appearance.planet?.continentColor || appearance.hair.color || '#10b981'}
                            onChange={(e) => {
                              const col = e.target.value;
                              updateAppearance((a) => ({
                                ...a,
                                hair: { ...a.hair, color: col },
                                planet: {
                                  ...(a.planet || {
                                    oceanColor: '#1d4ed8',
                                    atmosphereGlow: 'cyan',
                                    clouds: true,
                                    showHands: true,
                                  }),
                                  continentColor: col,
                                },
                              }));
                            }}
                            className="char-color-picker"
                            title="Custom continent color"
                          />
                        </div>
                      </div>

                      {/* Atmosphere Glow */}
                      <div className="char-control-group">
                        <label>✨ Atmosphere Outer Glow</label>
                        <div className="char-pill-row">
                          {[
                            { id: 'cyan', label: 'Glowing Cyan' },
                            { id: 'gold', label: 'Golden Sun' },
                            { id: 'white', label: 'Soft White' },
                            { id: 'none', label: 'No Glow' },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className={`char-pill-btn ${(appearance.planet?.atmosphereGlow || 'cyan') === opt.id ? 'active' : ''}`}
                              onClick={() =>
                                updateAppearance((a) => ({
                                  ...a,
                                  planet: {
                                    ...(a.planet || {
                                      oceanColor: '#1d4ed8',
                                      continentColor: '#10b981',
                                      clouds: true,
                                      showHands: true,
                                    }),
                                    atmosphereGlow: opt.id as any,
                                  },
                                }))
                              }
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Swirling Clouds Toggle */}
                      <div className="char-control-group">
                        <label>☁️ Atmosphere Clouds</label>
                        <div className="char-pill-row">
                          <button
                            type="button"
                            className={`char-pill-btn ${(appearance.planet?.clouds ?? true) ? 'active' : ''}`}
                            onClick={() =>
                              updateAppearance((a) => ({
                                ...a,
                                planet: {
                                  ...(a.planet || {
                                    oceanColor: '#1d4ed8',
                                    continentColor: '#10b981',
                                    atmosphereGlow: 'cyan',
                                    showHands: true,
                                  }),
                                  clouds: true,
                                },
                              }))
                            }
                          >
                            ☁️ Clouds ON
                          </button>
                          <button
                            type="button"
                            className={`char-pill-btn ${!(appearance.planet?.clouds ?? true) ? 'active' : ''}`}
                            onClick={() =>
                              updateAppearance((a) => ({
                                ...a,
                                planet: {
                                  ...(a.planet || {
                                    oceanColor: '#1d4ed8',
                                    continentColor: '#10b981',
                                    atmosphereGlow: 'cyan',
                                    showHands: true,
                                  }),
                                  clouds: false,
                                },
                              }))
                            }
                          >
                            Clear Skies OFF
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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
                  {appearance.species === 'planet' ? (
                    <div className="char-control-group">
                      <label>🧤 Floating Cartoon Hands</label>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
                        Toggle floating white cartoon gloves for the talking Earth character:
                      </div>
                      <div className="char-pill-row">
                        <button
                          type="button"
                          className={`char-pill-btn ${(appearance.planet?.showHands ?? true) ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              planet: {
                                ...(a.planet || {
                                  oceanColor: '#1d4ed8',
                                  continentColor: '#10b981',
                                  atmosphereGlow: 'cyan',
                                  clouds: true,
                                }),
                                showHands: true,
                              },
                            }))
                          }
                        >
                          🧤 White Gloves ON
                        </button>
                        <button
                          type="button"
                          className={`char-pill-btn ${!(appearance.planet?.showHands ?? true) ? 'active' : ''}`}
                          onClick={() =>
                            updateAppearance((a) => ({
                              ...a,
                              planet: {
                                ...(a.planet || {
                                  oceanColor: '#1d4ed8',
                                  continentColor: '#10b981',
                                  atmosphereGlow: 'cyan',
                                  clouds: true,
                                }),
                                showHands: false,
                              },
                            }))
                          }
                        >
                          Pure Globe (No Hands)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="char-symmetry-bar">
                    <span className="char-symmetry-label">Arm Symmetry</span>
                    <div className="char-pill-row">
                      <button
                        type="button"
                        className={`char-pill-btn ${armSymmetry === 'symmetrical' ? 'active' : ''}`}
                        onClick={() => {
                          setArmSymmetry('symmetrical');
                          updateAppearance((a) => ({
                            ...a,
                            leftArm: { ...a.arms },
                            rightArm: { ...a.arms },
                          }));
                        }}
                      >
                        Symmetrical
                      </button>
                      <button
                        type="button"
                        className={`char-pill-btn ${armSymmetry === 'independent' ? 'active' : ''}`}
                        onClick={() => setArmSymmetry('independent')}
                      >
                        Independent L/R
                      </button>
                    </div>
                  </div>

                  {armSymmetry === 'independent' && (
                    <div className="char-subtabs">
                      <button
                        type="button"
                        className={`char-subtab-btn ${selectedArm === 'left' ? 'active' : ''}`}
                        onClick={() => setSelectedArm('left')}
                      >
                        Left Arm
                      </button>
                      <button
                        type="button"
                        className={`char-subtab-btn ${selectedArm === 'right' ? 'active' : ''}`}
                        onClick={() => setSelectedArm('right')}
                      >
                        Right Arm
                      </button>
                    </div>
                  )}

                  {(() => {
                    const isIndep = armSymmetry === 'independent';
                    const activeArmLimb: ArmLimbConfig | undefined = isIndep
                      ? (selectedArm === 'left' ? appearance.leftArm : appearance.rightArm)
                      : undefined;

                    const currentSleeve = activeArmLimb?.sleeveStyle ?? appearance.arms.sleeveStyle ?? 'short';
                    const currentHand = activeArmLimb?.handShape ?? appearance.arms.handShape ?? 'simple';
                    const currentUpperLength = activeArmLimb?.upperArmLength ?? appearance.arms.length ?? 1.0;
                    const currentUpperThick = activeArmLimb?.upperArmThickness ?? appearance.arms.thickness ?? 1.0;
                    const currentForearmLength = activeArmLimb?.forearmLength ?? appearance.arms.length ?? 1.0;
                    const currentForearmThick = activeArmLimb?.forearmThickness ?? appearance.arms.thickness ?? 1.0;

                    const updateTargetArm = (patch: Partial<ArmLimbConfig>) => {
                      updateAppearance((a) => {
                        if (isIndep) {
                          if (selectedArm === 'left') {
                            const base = a.leftArm || {
                              upperArmLength: a.arms.length,
                              upperArmThickness: a.arms.thickness,
                              forearmLength: a.arms.length,
                              forearmThickness: a.arms.thickness,
                              sleeveStyle: a.arms.sleeveStyle,
                              handShape: a.arms.handShape,
                            };
                            return { ...a, leftArm: { ...base, ...patch } };
                          } else {
                            const base = a.rightArm || {
                              upperArmLength: a.arms.length,
                              upperArmThickness: a.arms.thickness,
                              forearmLength: a.arms.length,
                              forearmThickness: a.arms.thickness,
                              sleeveStyle: a.arms.sleeveStyle,
                              handShape: a.arms.handShape,
                            };
                            return { ...a, rightArm: { ...base, ...patch } };
                          }
                        } else {
                          const nextArms = {
                            ...a.arms,
                            ...(patch.sleeveStyle ? { sleeveStyle: patch.sleeveStyle } : {}),
                            ...(patch.handShape ? { handShape: patch.handShape } : {}),
                            ...(patch.upperArmLength !== undefined ? { length: patch.upperArmLength } : {}),
                            ...(patch.upperArmThickness !== undefined ? { thickness: patch.upperArmThickness } : {}),
                          };
                          return {
                            ...a,
                            arms: nextArms,
                            leftArm: a.leftArm ? { ...a.leftArm, ...patch } : undefined,
                            rightArm: a.rightArm ? { ...a.rightArm, ...patch } : undefined,
                          };
                        }
                      });
                    };

                    return (
                      <>
                        <div className="char-control-group">
                          <label>Sleeve Length</label>
                          <div className="char-pill-row">
                            {(['short', 'long', 'sleeveless'] as const).map((sleeve) => (
                              <button
                                key={sleeve}
                                type="button"
                                className={`char-pill-btn ${currentSleeve === sleeve ? 'active' : ''}`}
                                onClick={() => updateTargetArm({ sleeveStyle: sleeve })}
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
                                className={`char-pill-btn ${currentHand === hand ? 'active' : ''}`}
                                onClick={() => updateTargetArm({ handShape: hand })}
                              >
                                {hand}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="char-control-group">
                          <label>Upper Arm Length: {currentUpperLength.toFixed(2)}x</label>
                          <input
                            type="range"
                            min="0.7"
                            max="1.4"
                            step="0.05"
                            value={currentUpperLength}
                            onChange={(e) => updateTargetArm({ upperArmLength: parseFloat(e.target.value) })}
                          />
                        </div>

                        <div className="char-control-group">
                          <label>Upper Arm Thickness: {currentUpperThick.toFixed(2)}x</label>
                          <input
                            type="range"
                            min="0.7"
                            max="1.4"
                            step="0.05"
                            value={currentUpperThick}
                            onChange={(e) => updateTargetArm({ upperArmThickness: parseFloat(e.target.value) })}
                          />
                        </div>

                        <div className="char-control-group">
                          <label>Forearm Length: {currentForearmLength.toFixed(2)}x</label>
                          <input
                            type="range"
                            min="0.7"
                            max="1.4"
                            step="0.05"
                            value={currentForearmLength}
                            onChange={(e) => updateTargetArm({ forearmLength: parseFloat(e.target.value) })}
                          />
                        </div>

                        <div className="char-control-group">
                          <label>Forearm Thickness: {currentForearmThick.toFixed(2)}x</label>
                          <input
                            type="range"
                            min="0.7"
                            max="1.4"
                            step="0.05"
                            value={currentForearmThick}
                            onChange={(e) => updateTargetArm({ forearmThickness: parseFloat(e.target.value) })}
                          />
                        </div>
                      </>
                    );
                  })()}
                    </>
                  )}
                </div>
              )}

              {/* 6. LEGS TAB */}
              {activeTab === 'legs' && (
                <div className="char-builder-section">
                  <div className="char-symmetry-bar">
                    <span className="char-symmetry-label">Leg Symmetry</span>
                    <div className="char-pill-row">
                      <button
                        type="button"
                        className={`char-pill-btn ${legSymmetry === 'symmetrical' ? 'active' : ''}`}
                        onClick={() => {
                          setLegSymmetry('symmetrical');
                          updateAppearance((a) => ({
                            ...a,
                            leftLeg: { ...a.legs },
                            rightLeg: { ...a.legs },
                          }));
                        }}
                      >
                        Symmetrical
                      </button>
                      <button
                        type="button"
                        className={`char-pill-btn ${legSymmetry === 'independent' ? 'active' : ''}`}
                        onClick={() => setLegSymmetry('independent')}
                      >
                        Independent L/R
                      </button>
                    </div>
                  </div>

                  {legSymmetry === 'independent' && (
                    <div className="char-subtabs">
                      <button
                        type="button"
                        className={`char-subtab-btn ${selectedLeg === 'left' ? 'active' : ''}`}
                        onClick={() => setSelectedLeg('left')}
                      >
                        Left Leg
                      </button>
                      <button
                        type="button"
                        className={`char-subtab-btn ${selectedLeg === 'right' ? 'active' : ''}`}
                        onClick={() => setSelectedLeg('right')}
                      >
                        Right Leg
                      </button>
                    </div>
                  )}

                  {(() => {
                    const isLegIndep = legSymmetry === 'independent';
                    const activeLegLimb: LegLimbConfig | undefined = isLegIndep
                      ? (selectedLeg === 'left' ? appearance.leftLeg : appearance.rightLeg)
                      : undefined;

                    const currentPantsStyle = activeLegLimb?.pantsStyle ?? appearance.legs.pantsStyle ?? 'pants';
                    const currentPantsColor = activeLegLimb?.pantsColor ?? appearance.legs.pantsColor ?? '#1e3a8a';
                    const currentShoeStyle = activeLegLimb?.shoeStyle ?? appearance.legs.shoeStyle ?? 'sneakers';
                    const currentShoeColor = activeLegLimb?.shoeColor ?? appearance.legs.shoeColor ?? '#ef4444';
                    const currentUpperLegLength = activeLegLimb?.upperLegLength ?? appearance.legs.length ?? 1.0;
                    const currentUpperLegThick = activeLegLimb?.upperLegThickness ?? appearance.legs.thickness ?? 1.0;
                    const currentLowerLegLength = activeLegLimb?.lowerLegLength ?? appearance.legs.length ?? 1.0;
                    const currentLowerLegThick = activeLegLimb?.lowerLegThickness ?? appearance.legs.thickness ?? 1.0;

                    const updateTargetLeg = (patch: Partial<LegLimbConfig>) => {
                      updateAppearance((a) => {
                        if (isLegIndep) {
                          if (selectedLeg === 'left') {
                            const base = a.leftLeg || {
                              upperLegLength: a.legs.length,
                              upperLegThickness: a.legs.thickness,
                              lowerLegLength: a.legs.length,
                              lowerLegThickness: a.legs.thickness,
                              pantsStyle: a.legs.pantsStyle,
                              pantsColor: a.legs.pantsColor,
                              shoeStyle: a.legs.shoeStyle,
                              shoeColor: a.legs.shoeColor,
                            };
                            return { ...a, leftLeg: { ...base, ...patch } };
                          } else {
                            const base = a.rightLeg || {
                              upperLegLength: a.legs.length,
                              upperLegThickness: a.legs.thickness,
                              lowerLegLength: a.legs.length,
                              lowerLegThickness: a.legs.thickness,
                              pantsStyle: a.legs.pantsStyle,
                              pantsColor: a.legs.pantsColor,
                              shoeStyle: a.legs.shoeStyle,
                              shoeColor: a.legs.shoeColor,
                            };
                            return { ...a, rightLeg: { ...base, ...patch } };
                          }
                        } else {
                          const nextLegs = {
                            ...a.legs,
                            ...(patch.pantsStyle ? { pantsStyle: patch.pantsStyle } : {}),
                            ...(patch.pantsColor ? { pantsColor: patch.pantsColor } : {}),
                            ...(patch.shoeStyle ? { shoeStyle: patch.shoeStyle } : {}),
                            ...(patch.shoeColor ? { shoeColor: patch.shoeColor } : {}),
                            ...(patch.upperLegLength !== undefined ? { length: patch.upperLegLength } : {}),
                            ...(patch.upperLegThickness !== undefined ? { thickness: patch.upperLegThickness } : {}),
                          };
                          return {
                            ...a,
                            legs: nextLegs,
                            leftLeg: a.leftLeg ? { ...a.leftLeg, ...patch } : undefined,
                            rightLeg: a.rightLeg ? { ...a.rightLeg, ...patch } : undefined,
                          };
                        }
                      });
                    };

                    return (
                      <>
                        <div className="char-control-group">
                          <label>Bottom Style</label>
                          <div className="char-pill-row">
                            {(['pants', 'shorts', 'skirt'] as const).map((style) => (
                              <button
                                key={style}
                                type="button"
                                className={`char-pill-btn ${currentPantsStyle === style ? 'active' : ''}`}
                                onClick={() => updateTargetLeg({ pantsStyle: style })}
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
                                className={`char-color-swatch ${currentPantsColor === col ? 'active' : ''}`}
                                style={{ backgroundColor: col }}
                                onClick={() => updateTargetLeg({ pantsColor: col })}
                              />
                            ))}
                            <input
                              type="color"
                              value={currentPantsColor}
                              onChange={(e) => updateTargetLeg({ pantsColor: e.target.value })}
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
                                className={`char-pill-btn ${currentShoeStyle === style ? 'active' : ''}`}
                                onClick={() => updateTargetLeg({ shoeStyle: style })}
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
                                className={`char-color-swatch ${currentShoeColor === col ? 'active' : ''}`}
                                style={{ backgroundColor: col }}
                                onClick={() => updateTargetLeg({ shoeColor: col })}
                              />
                            ))}
                            <input
                              type="color"
                              value={currentShoeColor}
                              onChange={(e) => updateTargetLeg({ shoeColor: e.target.value })}
                              className="char-color-picker"
                            />
                          </div>
                        </div>

                        <div className="char-control-group">
                          <label>Upper Leg Length: {currentUpperLegLength.toFixed(2)}x</label>
                          <input
                            type="range"
                            min="0.7"
                            max="1.4"
                            step="0.05"
                            value={currentUpperLegLength}
                            onChange={(e) => updateTargetLeg({ upperLegLength: parseFloat(e.target.value) })}
                          />
                        </div>

                        <div className="char-control-group">
                          <label>Upper Leg Thickness: {currentUpperLegThick.toFixed(2)}x</label>
                          <input
                            type="range"
                            min="0.7"
                            max="1.4"
                            step="0.05"
                            value={currentUpperLegThick}
                            onChange={(e) => updateTargetLeg({ upperLegThickness: parseFloat(e.target.value) })}
                          />
                        </div>

                        <div className="char-control-group">
                          <label>Lower Leg Length: {currentLowerLegLength.toFixed(2)}x</label>
                          <input
                            type="range"
                            min="0.7"
                            max="1.4"
                            step="0.05"
                            value={currentLowerLegLength}
                            onChange={(e) => updateTargetLeg({ lowerLegLength: parseFloat(e.target.value) })}
                          />
                        </div>

                        <div className="char-control-group">
                          <label>Lower Leg Thickness: {currentLowerLegThick.toFixed(2)}x</label>
                          <input
                            type="range"
                            min="0.7"
                            max="1.4"
                            step="0.05"
                            value={currentLowerLegThick}
                            onChange={(e) => updateTargetLeg({ lowerLegThickness: parseFloat(e.target.value) })}
                          />
                        </div>
                      </>
                    );
                  })()}
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

