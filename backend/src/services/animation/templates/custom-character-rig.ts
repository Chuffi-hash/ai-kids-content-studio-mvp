import {
  VectorRigDefinition,
  VectorPartShape,
  VectorRigPart,
} from './default-characters.js';

export interface ArmLimbConfig {
  shoulderOffset?: { x: number; y: number };
  upperArmLength?: number;
  upperArmThickness?: number;
  elbowOffset?: { x: number; y: number };
  forearmLength?: number;
  forearmThickness?: number;
  handSize?: number;
  handShape?: 'simple' | 'mitten' | 'paw';
  sleeveStyle?: 'short' | 'long' | 'sleeveless';
  skinColor?: string;
}

export interface LegLimbConfig {
  hipOffset?: { x: number; y: number };
  upperLegLength?: number;
  upperLegThickness?: number;
  kneeOffset?: { x: number; y: number };
  lowerLegLength?: number;
  lowerLegThickness?: number;
  footSize?: number;
  pantsStyle?: 'pants' | 'shorts' | 'skirt';
  pantsColor?: string;
  shoeStyle?: 'sneakers' | 'boots' | 'shoes';
  shoeColor?: string;
}

export interface PlanetCustomConfig {
  oceanColor?: string;
  continentColor?: string;
  landmassStyle?: 'earth' | 'islands' | 'pangaea';
  atmosphereGlow?: 'cyan' | 'gold' | 'white' | 'none';
  clouds?: boolean;
  showHands?: boolean;
}

export interface CustomCharacterAppearance {
  version: 1;
  species: 'human' | 'bear' | 'robot' | 'animal' | 'alien' | 'fantasy_creature' | 'plant' | 'object' | 'other' | string;
  gender?: 'neutral' | 'boy' | 'girl';
  head: {
    shape: 'round' | 'oval' | 'square' | 'heart';
    size: number;
    skinColor: string;
  };
  neck?: {
    length?: 'short' | 'normal' | 'long';
    thickness?: 'slim' | 'normal' | 'wide';
    style?: 'plain' | 'band' | 'scarf' | 'chibi';
    color?: string;
  };
  hair: {
    style: 'short' | 'curly' | 'spiky' | 'bob' | 'long' | 'ponytail' | 'bear_ears' | 'none';
    color: string;
  };
  eyes: {
    style: 'round' | 'dot' | 'anime' | 'happy' | 'sleepy';
    color: string;
    size: number;
  };
  eyebrows: {
    style: 'curved' | 'flat' | 'bushy' | 'arched';
    color: string;
  };
  nose: {
    style: 'button' | 'dot' | 'triangle' | 'oval' | 'bear_snout';
    size: number;
    color?: string;
  };
  mouth: {
    style: 'smile' | 'open_grin' | 'laugh' | 'surprised' | 'line';
    color?: string;
  };
  ears: {
    style: 'round' | 'human' | 'bear' | 'elf';
    size: number;
  };
  accessories?: {
    glasses?: 'none' | 'round' | 'square';
    glassesColor?: string;
    freckles?: boolean;
    blush?: boolean;
    hat?: 'none' | 'cap' | 'beanie';
    hatColor?: string;
  };
  torso: {
    shape: 'standard' | 'slim' | 'stocky';
    width: number;
    height: number;
    clothingStyle: 'tshirt' | 'hoodie' | 'vest' | 'collared' | 'dress';
    shirtColor: string;
    collarColor?: string;
    pattern?: 'none' | 'star' | 'stripe' | 'circle';
  };
  arms: {
    length: number;
    thickness: number;
    sleeveStyle: 'short' | 'long' | 'sleeveless';
    handShape: 'simple' | 'mitten' | 'paw';
    skinColor?: string;
  };
  legs: {
    length: number;
    thickness: number;
    pantsStyle: 'pants' | 'shorts' | 'skirt';
    pantsColor: string;
    shoeStyle: 'sneakers' | 'boots' | 'shoes';
    shoeColor: string;
  };
  leftArm?: ArmLimbConfig;
  rightArm?: ArmLimbConfig;
  leftLeg?: LegLimbConfig;
  rightLeg?: LegLimbConfig;
  voiceConfig?: {
    lang?: string;
    voiceId: string;
    speed?: number;
    emotion?: string;
    style?: string;
    effect?: 'normal' | 'cartoon' | 'robot' | 'whisper' | 'shout' | string;
  };
  planet?: PlanetCustomConfig;
}

export const DEFAULT_APPEARANCE: CustomCharacterAppearance = {
  version: 1,
  species: 'human',
  gender: 'boy',
  head: {
    shape: 'round',
    size: 1.0,
    skinColor: '#fed7aa', // Natural warm peach
  },
  neck: {
    length: 'normal',
    thickness: 'normal',
    style: 'plain',
    color: '#fed7aa',
  },
  hair: {
    style: 'short',
    color: '#78350f', // Warm brown
  },
  eyes: {
    style: 'round',
    color: '#0f172a',
    size: 1.0,
  },
  eyebrows: {
    style: 'curved',
    color: '#78350f',
  },
  nose: {
    style: 'button',
    size: 1.0,
  },
  mouth: {
    style: 'smile',
  },
  ears: {
    style: 'human',
    size: 1.0,
  },
  accessories: {
    glasses: 'none',
    freckles: false,
    blush: true,
    hat: 'none',
  },
  torso: {
    shape: 'standard',
    width: 1.0,
    height: 1.0,
    clothingStyle: 'tshirt',
    shirtColor: '#3b82f6', // Bright blue
    collarColor: '#93c5fd',
    pattern: 'star',
  },
  arms: {
    length: 1.0,
    thickness: 1.0,
    sleeveStyle: 'short',
    handShape: 'simple',
  },
  legs: {
    length: 1.0,
    thickness: 1.0,
    pantsStyle: 'pants',
    pantsColor: '#1e3a8a', // Dark denim
    shoeStyle: 'sneakers',
    shoeColor: '#ef4444', // Red sneakers
  },
};

export const CHARACTER_PRESETS: Record<string, { label: string; appearance: CustomCharacterAppearance }> = {
  kid_boy: {
    label: 'Sammy (Kid Boy)',
    appearance: {
      ...DEFAULT_APPEARANCE,
      torso: {
        ...DEFAULT_APPEARANCE.torso,
        shirtColor: '#f59e0b',
        collarColor: '#fde68a',
        pattern: 'star',
      },
      hair: {
        style: 'short',
        color: '#78350f',
      },
    },
  },
  kid_girl: {
    label: 'Maya (Kid Girl)',
    appearance: {
      ...DEFAULT_APPEARANCE,
      gender: 'girl',
      hair: {
        style: 'ponytail',
        color: '#b45309',
      },
      head: {
        shape: 'round',
        size: 1.0,
        skinColor: '#fed7aa', // Natural healthy warm peach (no yellow jaundice!)
      },
      torso: {
        shape: 'standard',
        width: 0.95,
        height: 1.0,
        clothingStyle: 'hoodie',
        shirtColor: '#ec4899', // Pink
        collarColor: '#fbcfe8',
        pattern: 'circle',
      },
      legs: {
        length: 1.0,
        thickness: 0.95,
        pantsStyle: 'pants',
        pantsColor: '#6366f1',
        shoeStyle: 'sneakers',
        shoeColor: '#ffffff',
      },
    },
  },
  bear_cub: {
    label: 'Pip (Bear Cub)',
    appearance: {
      version: 1,
      species: 'bear',
      gender: 'neutral',
      head: {
        shape: 'round',
        size: 1.1,
        skinColor: '#d97706', // Honey golden brown
      },
      hair: {
        style: 'bear_ears',
        color: '#b45309',
      },
      eyes: {
        style: 'round',
        color: '#0f172a',
        size: 1.0,
      },
      eyebrows: {
        style: 'curved',
        color: '#78350f',
      },
      nose: {
        style: 'bear_snout',
        size: 1.1,
        color: '#1e293b',
      },
      mouth: {
        style: 'smile',
      },
      ears: {
        style: 'bear',
        size: 1.2,
      },
      accessories: {
        blush: true,
      },
      torso: {
        shape: 'stocky',
        width: 1.15,
        height: 1.0,
        clothingStyle: 'vest',
        shirtColor: '#2563eb', // Blue vest
        collarColor: '#93c5fd',
        pattern: 'none',
      },
      arms: {
        length: 1.0,
        thickness: 1.15,
        sleeveStyle: 'short',
        handShape: 'paw',
        skinColor: '#b45309',
      },
      legs: {
        length: 0.95,
        thickness: 1.15,
        pantsStyle: 'shorts',
        pantsColor: '#92400e',
        shoeStyle: 'sneakers',
        shoeColor: '#1e293b',
      },
    },
  },
  robot: {
    label: 'Sparky (Robot)',
    appearance: {
      version: 1,
      species: 'robot',
      gender: 'neutral',
      head: {
        shape: 'square',
        size: 1.0,
        skinColor: '#64748b', // Slate metallic
      },
      hair: {
        style: 'none',
        color: '#475569',
      },
      eyes: {
        style: 'anime',
        color: '#06b6d4', // Glowing cyan digital eyes
        size: 1.1,
      },
      eyebrows: {
        style: 'flat',
        color: '#475569',
      },
      nose: {
        style: 'triangle',
        size: 0.9,
        color: '#334155',
      },
      mouth: {
        style: 'open_grin',
        color: '#06b6d4',
      },
      ears: {
        style: 'round',
        size: 0.9,
      },
      accessories: {
        glasses: 'none',
      },
      torso: {
        shape: 'stocky',
        width: 1.1,
        height: 1.05,
        clothingStyle: 'tshirt',
        shirtColor: '#475569',
        collarColor: '#06b6d4',
        pattern: 'circle',
      },
      arms: {
        length: 1.0,
        thickness: 1.05,
        sleeveStyle: 'sleeveless',
        handShape: 'mitten',
        skinColor: '#94a3b8',
      },
      legs: {
        length: 1.0,
        thickness: 1.1,
        pantsStyle: 'pants',
        pantsColor: '#334155',
        shoeStyle: 'boots',
        shoeColor: '#0f172a',
      },
    },
  },
  earth: {
    label: 'Terra (Talking Earth)',
    appearance: {
      version: 1,
      species: 'planet',
      gender: 'neutral',
      head: {
        shape: 'round',
        size: 1.2,
        skinColor: '#1d4ed8', // Vibrant ocean blue
      },
      neck: {
        length: 'short',
        thickness: 'normal',
        style: 'plain',
        color: '#1d4ed8',
      },
      hair: {
        style: 'none',
        color: '#10b981', // Continent emerald green
      },
      eyes: {
        style: 'round',
        color: '#0f172a',
        size: 1.1,
      },
      eyebrows: {
        style: 'curved',
        color: '#0f172a',
      },
      nose: {
        style: 'button',
        size: 0.9,
        color: '#38bdf8',
      },
      mouth: {
        style: 'smile',
        color: '#be123c',
      },
      ears: {
        style: 'round',
        size: 0.5,
      },
      accessories: {
        glasses: 'none',
        freckles: false,
        blush: true,
        hat: 'none',
      },
      torso: {
        shape: 'standard',
        width: 1.0,
        height: 1.0,
        clothingStyle: 'tshirt',
        shirtColor: '#1d4ed8',
        collarColor: '#38bdf8',
        pattern: 'none',
      },
      arms: {
        length: 0.85,
        thickness: 0.9,
        sleeveStyle: 'sleeveless',
        handShape: 'mitten',
        skinColor: '#ffffff',
      },
      legs: {
        length: 0.7,
        thickness: 0.8,
        pantsStyle: 'pants',
        pantsColor: '#1d4ed8',
        shoeStyle: 'shoes',
        shoeColor: '#1e3a8a',
      },
      planet: {
        oceanColor: '#1d4ed8',
        continentColor: '#10b981',
        landmassStyle: 'earth',
        atmosphereGlow: 'cyan',
        clouds: true,
        showHands: false,
      },
      voiceConfig: {
        voiceId: 'bm_daniel',
        speed: 1.0,
        style: 'cheerful',
        effect: 'normal',
      },
    },
  },
};

/**
 * Safely normalizes any legacy or incomplete appearance data into a full, valid CustomCharacterAppearance.
 */
export function normalizeAppearance(rawApp?: any): CustomCharacterAppearance {
  if (!rawApp || typeof rawApp !== 'object') {
    return { ...DEFAULT_APPEARANCE };
  }

  const head = {
    ...DEFAULT_APPEARANCE.head,
    ...(rawApp.head || {}),
  };
  head.size = isFinite(head.size) && head.size > 0 ? Math.max(0.7, Math.min(1.5, head.size)) : 1.0;
  head.skinColor = head.skinColor || DEFAULT_APPEARANCE.head.skinColor;
  head.shape = ['round', 'oval', 'square', 'heart'].includes(head.shape) ? head.shape : 'round';

  const neck = {
    ...DEFAULT_APPEARANCE.neck,
    ...(rawApp.neck || {}),
  };

  const hair = {
    ...DEFAULT_APPEARANCE.hair,
    ...(rawApp.hair || {}),
  };

  const eyes = {
    ...DEFAULT_APPEARANCE.eyes,
    ...(rawApp.eyes || {}),
  };
  eyes.size = isFinite(eyes.size) && eyes.size > 0 ? Math.max(0.6, Math.min(1.6, eyes.size)) : 1.0;

  const eyebrows = {
    ...DEFAULT_APPEARANCE.eyebrows,
    ...(rawApp.eyebrows || {}),
  };

  const nose = {
    ...DEFAULT_APPEARANCE.nose,
    ...(rawApp.nose || {}),
  };
  nose.size = isFinite(nose.size) && nose.size > 0 ? Math.max(0.5, Math.min(2.0, nose.size)) : 1.0;

  const mouth = {
    ...DEFAULT_APPEARANCE.mouth,
    ...(rawApp.mouth || {}),
  };

  const ears = {
    ...DEFAULT_APPEARANCE.ears,
    ...(rawApp.ears || {}),
  };
  ears.size = isFinite(ears.size) && ears.size > 0 ? Math.max(0.5, Math.min(2.0, ears.size)) : 1.0;

  const accessories = {
    ...DEFAULT_APPEARANCE.accessories,
    ...(rawApp.accessories || {}),
  };

  const torso = {
    ...DEFAULT_APPEARANCE.torso,
    ...(rawApp.torso || {}),
  };
  torso.width = isFinite(torso.width) && torso.width > 0 ? Math.max(0.7, Math.min(1.6, torso.width)) : 1.0;
  torso.height = isFinite(torso.height) && torso.height > 0 ? Math.max(0.7, Math.min(1.5, torso.height)) : 1.0;

  const arms = {
    ...DEFAULT_APPEARANCE.arms,
    ...(rawApp.arms || {}),
  };
  arms.length = isFinite(arms.length) && arms.length > 0 ? Math.max(0.7, Math.min(1.5, arms.length)) : 1.0;
  arms.thickness = isFinite(arms.thickness) && arms.thickness > 0 ? Math.max(0.7, Math.min(1.6, arms.thickness)) : 1.0;

  const legs = {
    ...DEFAULT_APPEARANCE.legs,
    ...(rawApp.legs || {}),
  };
  legs.length = isFinite(legs.length) && legs.length > 0 ? Math.max(0.7, Math.min(1.5, legs.length)) : 1.0;
  legs.thickness = isFinite(legs.thickness) && legs.thickness > 0 ? Math.max(0.7, Math.min(1.6, legs.thickness)) : 1.0;

  const normalizeArmLimb = (limb?: any): ArmLimbConfig => {
    const baseLength = arms.length;
    const baseThick = arms.thickness;
    const uLen = limb?.upperArmLength !== undefined && isFinite(limb.upperArmLength) && limb.upperArmLength > 0
      ? Math.max(0.6, Math.min(1.6, limb.upperArmLength))
      : baseLength;
    const uThick = limb?.upperArmThickness !== undefined && isFinite(limb.upperArmThickness) && limb.upperArmThickness > 0
      ? Math.max(0.6, Math.min(1.6, limb.upperArmThickness))
      : baseThick;
    const fLen = limb?.forearmLength !== undefined && isFinite(limb.forearmLength) && limb.forearmLength > 0
      ? Math.max(0.6, Math.min(1.6, limb.forearmLength))
      : baseLength;
    const fThick = limb?.forearmThickness !== undefined && isFinite(limb.forearmThickness) && limb.forearmThickness > 0
      ? Math.max(0.6, Math.min(1.6, limb.forearmThickness))
      : baseThick;
    const hSize = limb?.handSize !== undefined && isFinite(limb.handSize) && limb.handSize > 0
      ? Math.max(0.6, Math.min(1.8, limb.handSize))
      : 1.0;
    const shOff = {
      x: isFinite(limb?.shoulderOffset?.x) ? Math.max(-20, Math.min(20, limb.shoulderOffset.x)) : 0,
      y: isFinite(limb?.shoulderOffset?.y) ? Math.max(-20, Math.min(20, limb.shoulderOffset.y)) : 0,
    };
    const elOff = {
      x: isFinite(limb?.elbowOffset?.x) ? Math.max(-20, Math.min(20, limb.elbowOffset.x)) : 0,
      y: isFinite(limb?.elbowOffset?.y) ? Math.max(-20, Math.min(20, limb.elbowOffset.y)) : 0,
    };

    return {
      shoulderOffset: shOff,
      upperArmLength: uLen,
      upperArmThickness: uThick,
      elbowOffset: elOff,
      forearmLength: fLen,
      forearmThickness: fThick,
      handSize: hSize,
      handShape: limb?.handShape || arms.handShape,
      sleeveStyle: limb?.sleeveStyle || arms.sleeveStyle,
      skinColor: limb?.skinColor || arms.skinColor || head.skinColor,
    };
  };

  const normalizeLegLimb = (limb?: any): LegLimbConfig => {
    const baseLength = legs.length;
    const baseThick = legs.thickness;
    const uLen = limb?.upperLegLength !== undefined && isFinite(limb.upperLegLength) && limb.upperLegLength > 0
      ? Math.max(0.6, Math.min(1.6, limb.upperLegLength))
      : baseLength;
    const uThick = limb?.upperLegThickness !== undefined && isFinite(limb.upperLegThickness) && limb.upperLegThickness > 0
      ? Math.max(0.6, Math.min(1.6, limb.upperLegThickness))
      : baseThick;
    const lLen = limb?.lowerLegLength !== undefined && isFinite(limb.lowerLegLength) && limb.lowerLegLength > 0
      ? Math.max(0.6, Math.min(1.6, limb.lowerLegLength))
      : baseLength;
    const lThick = limb?.lowerLegThickness !== undefined && isFinite(limb.lowerLegThickness) && limb.lowerLegThickness > 0
      ? Math.max(0.6, Math.min(1.6, limb.lowerLegThickness))
      : baseThick;
    const fSize = limb?.footSize !== undefined && isFinite(limb.footSize) && limb.footSize > 0
      ? Math.max(0.6, Math.min(1.8, limb.footSize))
      : 1.0;
    const hipOff = {
      x: isFinite(limb?.hipOffset?.x) ? Math.max(-20, Math.min(20, limb.hipOffset.x)) : 0,
      y: isFinite(limb?.hipOffset?.y) ? Math.max(-20, Math.min(20, limb.hipOffset.y)) : 0,
    };
    const knOff = {
      x: isFinite(limb?.kneeOffset?.x) ? Math.max(-20, Math.min(20, limb.kneeOffset.x)) : 0,
      y: isFinite(limb?.kneeOffset?.y) ? Math.max(-20, Math.min(20, limb.kneeOffset.y)) : 0,
    };

    return {
      hipOffset: hipOff,
      upperLegLength: uLen,
      upperLegThickness: uThick,
      kneeOffset: knOff,
      lowerLegLength: lLen,
      lowerLegThickness: lThick,
      footSize: fSize,
      pantsStyle: limb?.pantsStyle || legs.pantsStyle,
      pantsColor: limb?.pantsColor || legs.pantsColor,
      shoeStyle: limb?.shoeStyle || legs.shoeStyle,
      shoeColor: limb?.shoeColor || legs.shoeColor,
    };
  };

  const leftArm = normalizeArmLimb(rawApp.leftArm);
  const rightArm = normalizeArmLimb(rawApp.rightArm);
  const leftLeg = normalizeLegLimb(rawApp.leftLeg);
  const rightLeg = normalizeLegLimb(rawApp.rightLeg);

  return {
    version: 1,
    species: rawApp.species || DEFAULT_APPEARANCE.species,
    gender: rawApp.gender || DEFAULT_APPEARANCE.gender,
    head,
    neck,
    hair,
    eyes,
    eyebrows,
    nose,
    mouth,
    ears,
    accessories,
    torso,
    arms,
    legs,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    voiceConfig: rawApp.voiceConfig
      ? {
          lang: rawApp.voiceConfig.lang || 'hi',
          voiceId: String(rawApp.voiceConfig.voiceId || 'hf_alpha'),
          speed: typeof rawApp.voiceConfig.speed === 'number' && isFinite(rawApp.voiceConfig.speed)
            ? Math.max(0.5, Math.min(2.0, rawApp.voiceConfig.speed))
            : 1.0,
          emotion: rawApp.voiceConfig.emotion || rawApp.voiceConfig.style || 'neutral',
          style: rawApp.voiceConfig.style || rawApp.voiceConfig.emotion || 'cheerful',
          effect: rawApp.voiceConfig.effect || 'normal',
        }
      : {
          lang: 'hi',
          voiceId: 'hf_alpha',
          speed: 1.0,
          emotion: 'neutral',
          style: 'cheerful',
          effect: 'normal',
        },
    planet: rawApp.planet
      ? {
          oceanColor: rawApp.planet.oceanColor || '#1d4ed8',
          continentColor: rawApp.planet.continentColor || '#10b981',
          landmassStyle: rawApp.planet.landmassStyle || 'earth',
          atmosphereGlow: rawApp.planet.atmosphereGlow || 'cyan',
          clouds: rawApp.planet.clouds !== false,
          showHands: rawApp.planet.showHands !== false,
        }
      : undefined,
  };
}

/**
 * Builds a valid, articulated VectorRigDefinition from a customizable appearance model.
 * Enhanced with professional 2D cartoon proportions, natural depth, and expressive life.
 */
export function buildRigFromAppearance(
  id: string,
  name: string,
  rawAppearance: CustomCharacterAppearance
): VectorRigDefinition {
  const app = normalizeAppearance(rawAppearance);

  const isPlanet = app.species?.toLowerCase() === 'planet' || app.species?.toLowerCase() === 'earth';
  const isBear = app.species?.toLowerCase() === 'bear';
  const isRobot = app.species?.toLowerCase() === 'robot';

  const headSize = app.head.size || 1.0;
  const skin = isRobot ? (app.head.skinColor || '#64748b') : (app.head.skinColor || '#fed7aa');
  const hairColor = app.hair.color || '#78350f';
  const eyeColor = app.eyes.color || '#0f172a';
  const eyeSize = app.eyes.size || 1.0;

  const torsoWidth = app.torso.width || 1.0;
  const torsoHeight = app.torso.height || 1.0;
  const shirtColor = app.torso.shirtColor || '#3b82f6';
  const collarColor = app.torso.collarColor || '#93c5fd';

  // ---------------------------------------------------------------------------
  // 1. VERTICAL PROPORTIONS & COORDINATES (Natural cartoon silhouette)
  // ---------------------------------------------------------------------------
  // Spans from top of hair (y = -70) to bottom of shoes (y = +70), perfectly fitting viewBox.
  const baseHeadY = isPlanet ? -18 : isBear ? -28 : isRobot ? -30 : -28;
  const headRx = (isPlanet ? 48 : isBear ? 32 : isRobot ? 28 : 27) * headSize;
  const headRy = (isPlanet ? 48 : isBear ? 28 : isRobot ? 26 : 25) * headSize;
  const headChinY = baseHeadY + headRy; // around -3 to -2

  // Neck connects jawline into torso
  const neckTopY = headChinY - 3;
  const neckBottomY = 4;
  const neckW = (isRobot ? 16 : isBear ? 26 : 18) * Math.max(0.8, Math.min(1.2, torsoWidth));

  const headShapes: VectorPartShape[] = [];

  // ---------------------------------------------------------------------------
  // 2. HEAD BASE SHAPE
  // ---------------------------------------------------------------------------
  if (isPlanet) {
    const oceanColor = app.planet?.oceanColor || '#1d4ed8';
    const continentColor = app.planet?.continentColor || '#10b981';
    const continentAccent = '#059669';
    const continentShelf = '#34d399';
    const glowStyle = app.planet?.atmosphereGlow || 'cyan';

    headShapes.push(
      { type: 'circle', cx: 0, cy: baseHeadY, r: headRx + 2.5, fill: 'none', stroke: glowStyle === 'gold' ? '#facc15' : glowStyle === 'white' ? '#ffffff' : '#38bdf8', strokeWidth: 2.0, opacity: 0.5, tag: 'face_base' },
      { type: 'circle', cx: 0, cy: baseHeadY, r: headRx, fill: oceanColor, stroke: glowStyle === 'gold' ? '#fde68a' : glowStyle === 'white' ? '#ffffff' : '#38bdf8', strokeWidth: 2.2, tag: 'face_base' },
      { type: 'path', d: `M 0 ${baseHeadY + 48} A 48 48 0 0 0 48 ${baseHeadY} Q 30 ${baseHeadY + 30} 0 ${baseHeadY + 48} Z`, fill: '#0f172a', opacity: 0.30, tag: 'face_base' },
      { type: 'path', d: `M -16 ${baseHeadY - 45.2} Q 0 ${baseHeadY - 41.5} 16 ${baseHeadY - 45.2} A 48 48 0 0 0 -16 ${baseHeadY - 45.2} Z`, fill: '#f8fafc', tag: 'face_base' },
      { type: 'path', d: `M -41 ${baseHeadY - 20} Q -38 ${baseHeadY - 30} -28 ${baseHeadY - 34} Q -16 ${baseHeadY - 33} -12 ${baseHeadY - 25} Q -16 ${baseHeadY - 20} -23 ${baseHeadY - 22} Q -30 ${baseHeadY - 21} -36 ${baseHeadY - 14} Z`, fill: continentColor, tag: 'face_base' },
      { type: 'path', d: `M -17 ${baseHeadY - 28} Q -5 ${baseHeadY - 30} 1 ${baseHeadY - 24} Q -3 ${baseHeadY - 17} -9 ${baseHeadY - 16} Q -16 ${baseHeadY - 17} -17 ${baseHeadY - 28} Z`, fill: continentAccent, tag: 'face_base' },
      { type: 'path', d: `M -34 ${baseHeadY - 14} Q -20 ${baseHeadY - 16} -9 ${baseHeadY - 12} Q -6 ${baseHeadY - 7} -7 ${baseHeadY - 2} Q -14 ${baseHeadY - 4} -21 ${baseHeadY - 2} Q -28 ${baseHeadY - 6} -34 ${baseHeadY - 14} Z`, fill: continentColor, tag: 'face_base' },
      { type: 'path', d: `M -9 ${baseHeadY + 16} Q -2 ${baseHeadY + 18} 3 ${baseHeadY + 24} Q 4 ${baseHeadY + 32} -3 ${baseHeadY + 38} Q -8 ${baseHeadY + 44} -12 ${baseHeadY + 46} Q -14 ${baseHeadY + 40} -14 ${baseHeadY + 30} Q -15 ${baseHeadY + 22} -9 ${baseHeadY + 16} Z`, fill: continentColor, tag: 'face_base' },
      { type: 'path', d: `M 16 ${baseHeadY - 26} Q 22 ${baseHeadY - 34} 32 ${baseHeadY - 32} Q 43 ${baseHeadY - 26} 45 ${baseHeadY - 16} Q 36 ${baseHeadY - 15} 26 ${baseHeadY - 18} Q 17 ${baseHeadY - 18} 16 ${baseHeadY - 26} Z`, fill: continentColor, tag: 'face_base' },
      { type: 'path', d: `M 18 ${baseHeadY - 14} Q 28 ${baseHeadY - 16} 36 ${baseHeadY - 8} Q 43 ${baseHeadY} 41 ${baseHeadY + 12} Q 36 ${baseHeadY + 22} 29 ${baseHeadY + 30} Q 25 ${baseHeadY + 34} 24 ${baseHeadY + 26} Q 22 ${baseHeadY + 14} 16 ${baseHeadY + 4} Q 15 ${baseHeadY - 6} 18 ${baseHeadY - 14} Z`, fill: continentColor, tag: 'face_base' },
      { type: 'path', d: `M -15 ${baseHeadY + 45.5} Q 0 ${baseHeadY + 42} 15 ${baseHeadY + 45.5} A 48 48 0 0 1 -15 ${baseHeadY + 45.5} Z`, fill: '#f8fafc', tag: 'face_base' },
      { type: 'path', d: `M -34 ${baseHeadY - 34} A 48 48 0 0 1 -5 ${baseHeadY - 47.7}`, stroke: '#ffffff', strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none', opacity: 0.6, tag: 'face_base' },
      { type: 'ellipse', cx: -14 * headSize, cy: baseHeadY + 2, rx: 5.5, ry: 3.5, fill: '#f43f5e', opacity: 0.6, tag: 'face_base' },
      { type: 'ellipse', cx: 14 * headSize, cy: baseHeadY + 2, rx: 5.5, ry: 3.5, fill: '#f43f5e', opacity: 0.6, tag: 'face_base' }
    );
  } else if (isRobot || app.head.shape === 'square') {
    headShapes.push(
      { type: 'rect', x: -headRx, y: baseHeadY - headRy, width: headRx * 2, height: headRy * 2, rx: 8, fill: skin, stroke: '#475569', strokeWidth: 2, tag: 'face_base' },
      { type: 'rect', x: -headRx + 5, y: baseHeadY - headRy + 6, width: headRx * 2 - 10, height: headRy * 2 - 12, rx: 6, fill: '#1e293b', opacity: 0.85, tag: 'face_base' },
      { type: 'rect', x: -2, y: baseHeadY - headRy - 12, width: 4, height: 12, fill: '#64748b', tag: 'face_base' },
      { type: 'circle', cx: 0, cy: baseHeadY - headRy - 14, r: 5, fill: '#06b6d4', stroke: '#22d3ee', strokeWidth: 1.5, tag: 'face_base' },
      { type: 'circle', cx: -1.5, cy: baseHeadY - headRy - 15.5, r: 1.5, fill: '#ffffff', tag: 'face_base' }
    );
  } else if (app.head.shape === 'heart') {
    const heartPath = `M 0 ${baseHeadY + headRy * 1.05} C ${-headRx * 1.2} ${baseHeadY + headRy * 0.3} ${-headRx * 1.15} ${baseHeadY - headRy * 0.85} ${-headRx * 0.55} ${baseHeadY - headRy * 0.95} C ${-headRx * 0.15} ${baseHeadY - headRy * 1.0} 0 ${baseHeadY - headRy * 0.45} 0 ${baseHeadY - headRy * 0.35} C 0 ${baseHeadY - headRy * 0.45} ${headRx * 0.15} ${baseHeadY - headRy * 1.0} ${headRx * 0.55} ${baseHeadY - headRy * 0.95} C ${headRx * 1.15} ${baseHeadY - headRy * 0.85} ${headRx * 1.2} ${baseHeadY + headRy * 0.3} 0 ${baseHeadY + headRy * 1.05} Z`;
    headShapes.push({ type: 'path', d: heartPath, fill: skin, tag: 'face_base' });
  } else if (app.head.shape === 'oval') {
    headShapes.push({ type: 'ellipse', cx: 0, cy: baseHeadY, rx: headRx * 0.85, ry: headRy * 1.15, fill: skin, tag: 'face_base' });
  } else {
    // Round head (guaranteed circle shape for test assertions + chubby cheeks)
    headShapes.push({ type: 'circle', cx: 0, cy: baseHeadY, r: headRx, fill: skin, tag: 'face_base' });
  }

  // Snout (Bear muzzle)
  if (isBear || app.nose.style === 'bear_snout') {
    headShapes.push(
      { type: 'ellipse', cx: 0, cy: baseHeadY + 8, rx: 17 * headSize, ry: 13 * headSize, fill: '#fef3c7', stroke: '#d97706', strokeWidth: 1.2, tag: 'face_base' }
    );
  }

  // ---------------------------------------------------------------------------
  // 3. EARS
  // ---------------------------------------------------------------------------
  if (!isPlanet) {
    const earY = isBear ? baseHeadY - 22 : baseHeadY;
    const earRx = (isBear ? 12 : 6.5) * (app.ears.size || 1.0);
    const earRy = (isBear ? 12 : 9.5) * (app.ears.size || 1.0);

    if (isBear || app.ears.style === 'bear') {
      headShapes.push(
        { type: 'circle', cx: -28 * headSize, cy: earY, r: earRx, fill: skin, stroke: '#92400e', strokeWidth: 1.5, tag: 'ears' },
        { type: 'circle', cx: 28 * headSize, cy: earY, r: earRx, fill: skin, stroke: '#92400e', strokeWidth: 1.5, tag: 'ears' },
        { type: 'circle', cx: -28 * headSize, cy: earY, r: earRx * 0.58, fill: '#fef3c7', tag: 'ears' },
        { type: 'circle', cx: 28 * headSize, cy: earY, r: earRx * 0.58, fill: '#fef3c7', tag: 'ears' }
      );
    } else if (isRobot) {
      headShapes.push(
        { type: 'rect', x: -32 * headSize, y: earY - 6, width: 6, height: 12, rx: 2, fill: '#64748b', stroke: '#334155', strokeWidth: 1.2, tag: 'ears' },
        { type: 'rect', x: 26 * headSize, y: earY - 6, width: 6, height: 12, rx: 2, fill: '#64748b', stroke: '#334155', strokeWidth: 1.2, tag: 'ears' },
        { type: 'circle', cx: -29 * headSize, cy: earY, r: 1.8, fill: '#06b6d4', tag: 'ears' },
        { type: 'circle', cx: 29 * headSize, cy: earY, r: 1.8, fill: '#06b6d4', tag: 'ears' }
      );
    } else if (app.ears.style === 'elf') {
      headShapes.push(
        { type: 'path', d: `M ${-26 * headSize} ${earY - 2} C ${-36 * headSize} ${earY - 8} ${-44 * headSize} ${earY - 14} ${-28 * headSize} ${earY + 10} Z`, fill: skin, stroke: '#e2a97e', strokeWidth: 1, tag: 'ears' },
        { type: 'path', d: `M ${26 * headSize} ${earY - 2} C ${36 * headSize} ${earY - 8} ${44 * headSize} ${earY - 14} ${28 * headSize} ${earY + 10} Z`, fill: skin, stroke: '#e2a97e', strokeWidth: 1, tag: 'ears' }
      );
    } else {
      headShapes.push(
        { type: 'ellipse', cx: -29 * headSize, cy: earY, rx: earRx, ry: earRy, fill: skin, tag: 'ears' },
        { type: 'path', d: `M ${-29 * headSize} ${earY - 4} C ${-31 * headSize} ${earY - 1} ${-31 * headSize} ${earY + 2} ${-28 * headSize} ${earY + 4}`, stroke: '#d97706', strokeWidth: 1.2, strokeLinecap: 'round', fill: 'none', opacity: 0.5, tag: 'ears' },
        { type: 'ellipse', cx: 29 * headSize, cy: earY, rx: earRx, ry: earRy, fill: skin, tag: 'ears' },
        { type: 'path', d: `M ${29 * headSize} ${earY - 4} C ${31 * headSize} ${earY - 1} ${31 * headSize} ${earY + 2} ${28 * headSize} ${earY + 4}`, stroke: '#d97706', strokeWidth: 1.2, strokeLinecap: 'round', fill: 'none', opacity: 0.5, tag: 'ears' }
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 4. HAIR (Natural, volumetric, stylish 2D cartoon hair)
  // ---------------------------------------------------------------------------
  if (!isPlanet && !isRobot) {
    if (app.hair.style === 'short') {
      headShapes.push(
        {
          type: 'path',
          d: `M ${-headRx - 4} ${baseHeadY - 2} Q ${-headRx - 4} ${baseHeadY - headRy - 12} 0 ${baseHeadY - headRy - 14} Q ${headRx + 4} ${baseHeadY - headRy - 12} ${headRx + 4} ${baseHeadY - 2} Q ${headRx + 1} ${baseHeadY - 14} ${headRx - 6} ${baseHeadY - 16} Q 0 ${baseHeadY - 20} ${-headRx + 6} ${baseHeadY - 16} Q ${-headRx - 1} ${baseHeadY - 14} ${-headRx - 4} ${baseHeadY - 2} Z`,
          fill: hairColor,
          tag: 'hair',
        },
        {
          type: 'path',
          d: `M ${-headRx - 3} ${baseHeadY - 4} Q ${-headRx + 4} ${baseHeadY - 12} ${-12} ${baseHeadY - 10} Q -4 ${baseHeadY - 16} 4 ${baseHeadY - 11} Q 14 ${baseHeadY - 16} 22 ${baseHeadY - 9} Q ${headRx} ${baseHeadY - 12} ${headRx + 3} ${baseHeadY - 4} Q ${headRx - 2} ${baseHeadY - 20} 0 ${baseHeadY - headRy - 10} Q ${-headRx + 2} ${baseHeadY - 20} ${-headRx - 3} ${baseHeadY - 4} Z`,
          fill: hairColor,
          tag: 'hair',
        },
        {
          type: 'path',
          d: `M ${-14} ${baseHeadY - headRy - 5} Q 0 ${baseHeadY - headRy - 9} 14 ${baseHeadY - headRy - 5} Q 0 ${baseHeadY - headRy - 7} ${-14} ${baseHeadY - headRy - 5} Z`,
          fill: '#ffffff',
          opacity: 0.3,
          tag: 'hair',
        }
      );
    } else if (app.hair.style === 'ponytail') {
      headShapes.push(
        {
          type: 'path',
          d: `M ${-headRx - 4} ${baseHeadY - 2} Q ${-headRx - 4} ${baseHeadY - headRy - 12} 0 ${baseHeadY - headRy - 14} Q ${headRx + 4} ${baseHeadY - headRy - 12} ${headRx + 4} ${baseHeadY - 2} Q 18 ${baseHeadY - 18} 0 ${baseHeadY - 18} Q -18 ${baseHeadY - 18} ${-headRx - 4} ${baseHeadY - 2} Z`,
          fill: hairColor,
          tag: 'hair',
        },
        {
          type: 'path',
          d: `M ${-headRx - 3} ${baseHeadY - 3} Q -6 ${baseHeadY - 14} 8 ${baseHeadY - 8} Q 18 ${baseHeadY - 14} ${headRx + 3} ${baseHeadY - 3} Q ${headRx - 2} ${baseHeadY - 22} 0 ${baseHeadY - headRy - 10} Q ${-headRx + 2} ${baseHeadY - 22} ${-headRx - 3} ${baseHeadY - 3} Z`,
          fill: hairColor,
          tag: 'hair',
        },
        {
          type: 'path',
          d: `M ${headRx - 6} ${baseHeadY - headRy + 2} Q ${headRx + 24} ${baseHeadY - headRy - 14} ${headRx + 26} ${baseHeadY - headRy + 14} Q ${headRx + 18} ${baseHeadY - headRy + 28} ${headRx - 2} ${baseHeadY - headRy + 12} Z`,
          fill: hairColor,
          tag: 'hair',
        },
        { type: 'circle', cx: headRx - 2, cy: baseHeadY - headRy + 6, r: 5, fill: '#ec4899', stroke: '#be185d', strokeWidth: 1.5, tag: 'hair' },
        {
          type: 'path',
          d: `M -14 ${baseHeadY - headRy - 5} Q 0 ${baseHeadY - headRy - 9} 14 ${baseHeadY - headRy - 5} Q 0 ${baseHeadY - headRy - 7} -14 ${baseHeadY - headRy - 5} Z`,
          fill: '#ffffff',
          opacity: 0.3,
          tag: 'hair',
        }
      );
    } else if (app.hair.style === 'curly') {
      headShapes.push(
        {
          type: 'path',
          d: `M ${-headRx - 4} ${baseHeadY} Q ${-headRx - 10} ${baseHeadY - headRy} 0 ${baseHeadY - headRy - 12} Q ${headRx + 10} ${baseHeadY - headRy} ${headRx + 4} ${baseHeadY} Z`,
          fill: hairColor,
          tag: 'hair',
        },
        { type: 'circle', cx: -18, cy: baseHeadY - headRy - 4, r: 9, fill: hairColor, tag: 'hair' },
        { type: 'circle', cx: 0, cy: baseHeadY - headRy - 8, r: 10, fill: hairColor, tag: 'hair' },
        { type: 'circle', cx: 18, cy: baseHeadY - headRy - 4, r: 9, fill: hairColor, tag: 'hair' }
      );
    } else if (app.hair.style === 'spiky') {
      headShapes.push({
        type: 'path',
        d: `M ${-headRx - 4} ${baseHeadY} L ${-headRx} ${baseHeadY - headRy - 10} L -14 ${baseHeadY - headRy - 4} L 0 ${baseHeadY - headRy - 14} L 14 ${baseHeadY - headRy - 4} L ${headRx} ${baseHeadY - headRy - 10} L ${headRx + 4} ${baseHeadY} Z`,
        fill: hairColor,
        tag: 'hair',
      });
    } else if (app.hair.style === 'bob') {
      headShapes.push({
        type: 'path',
        d: `M ${-headRx - 4} ${baseHeadY + 8} Q ${-headRx - 6} ${baseHeadY - headRy - 12} 0 ${baseHeadY - headRy - 12} Q ${headRx + 6} ${baseHeadY - headRy - 12} ${headRx + 4} ${baseHeadY + 8} L ${headRx - 4} ${baseHeadY + 6} Q ${headRx} ${baseHeadY - 14} 0 ${baseHeadY - 16} Q ${-headRx} ${baseHeadY - 14} ${-headRx + 4} ${baseHeadY + 6} Z`,
        fill: hairColor,
        tag: 'hair',
      });
    } else if (app.hair.style === 'long') {
      headShapes.push({
        type: 'path',
        d: `M ${-headRx - 4} ${baseHeadY + 24} Q ${-headRx - 8} ${baseHeadY - headRy - 12} 0 ${baseHeadY - headRy - 12} Q ${headRx + 8} ${baseHeadY - headRy - 12} ${headRx + 4} ${baseHeadY + 24} L ${headRx - 2} ${baseHeadY + 16} Q ${headRx} ${baseHeadY - 12} 0 ${baseHeadY - 14} Q ${-headRx} ${baseHeadY - 12} ${-headRx + 2} ${baseHeadY + 16} Z`,
        fill: hairColor,
        tag: 'hair',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. HIGH-CONTRAST, ALIVE CARTOON EYES
  // ---------------------------------------------------------------------------
  const eyeR = (isPlanet ? 6.5 : isRobot ? 6.0 : 5.8) * eyeSize;
  const eyeY = isPlanet ? baseHeadY - 4 : baseHeadY - 2;
  const leftEyeX = (isPlanet ? -11 : -11) * headSize;
  const rightEyeX = (isPlanet ? 11 : 11) * headSize;
  const eyeStartIdx = headShapes.length;

  if (isRobot) {
    headShapes.push(
      { type: 'rect', x: leftEyeX - 6, y: eyeY - 5, width: 12, height: 10, rx: 3, fill: '#0891b2', stroke: '#22d3ee', strokeWidth: 1.5 },
      { type: 'rect', x: leftEyeX - 4, y: eyeY - 2, width: 8, height: 4, rx: 1.5, fill: '#67e8f9' },
      { type: 'circle', cx: leftEyeX - 2, cy: eyeY - 2.5, r: 1.2, fill: '#ffffff' },

      { type: 'rect', x: rightEyeX - 6, y: eyeY - 5, width: 12, height: 10, rx: 3, fill: '#0891b2', stroke: '#22d3ee', strokeWidth: 1.5 },
      { type: 'rect', x: rightEyeX - 4, y: eyeY - 2, width: 8, height: 4, rx: 1.5, fill: '#67e8f9' },
      { type: 'circle', cx: rightEyeX - 2, cy: eyeY - 2.5, r: 1.2, fill: '#ffffff' }
    );
  } else if (app.eyes.style === 'anime') {
    headShapes.push(
      { type: 'ellipse', cx: leftEyeX, cy: eyeY, rx: eyeR * 1.35, ry: eyeR * 1.7, fill: eyeColor },
      { type: 'ellipse', cx: leftEyeX, cy: eyeY + 1.2, rx: eyeR * 0.8, ry: eyeR * 1.05, fill: '#0a0f1d' },
      { type: 'circle', cx: leftEyeX - 2.2, cy: eyeY - 3, r: eyeR * 0.45, fill: '#ffffff' },
      { type: 'circle', cx: leftEyeX + 2.4, cy: eyeY + 2.8, r: eyeR * 0.25, fill: '#ffffff' },
      { type: 'path', d: `M ${leftEyeX - 7} ${eyeY - 4.5} Q ${leftEyeX} ${eyeY - 10} ${leftEyeX + 7} ${eyeY - 4.5}`, stroke: '#0f172a', strokeWidth: 2.6, strokeLinecap: 'round', fill: 'none' },

      { type: 'ellipse', cx: rightEyeX, cy: eyeY, rx: eyeR * 1.35, ry: eyeR * 1.7, fill: eyeColor },
      { type: 'ellipse', cx: rightEyeX, cy: eyeY + 1.2, rx: eyeR * 0.8, ry: eyeR * 1.05, fill: '#0a0f1d' },
      { type: 'circle', cx: rightEyeX - 2.2, cy: eyeY - 3, r: eyeR * 0.45, fill: '#ffffff' },
      { type: 'circle', cx: rightEyeX + 2.4, cy: eyeY + 2.8, r: eyeR * 0.25, fill: '#ffffff' },
      { type: 'path', d: `M ${rightEyeX - 7} ${eyeY - 4.5} Q ${rightEyeX} ${eyeY - 10} ${rightEyeX + 7} ${eyeY - 4.5}`, stroke: '#0f172a', strokeWidth: 2.6, strokeLinecap: 'round', fill: 'none' }
    );
  } else if (app.eyes.style === 'sleepy') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 6} ${eyeY - 1} Q ${leftEyeX} ${eyeY + 5} ${leftEyeX + 6} ${eyeY - 1}`, stroke: eyeColor, strokeWidth: 3, strokeLinecap: 'round', fill: 'none' },
      { type: 'circle', cx: leftEyeX, cy: eyeY + 1, r: eyeR * 0.65, fill: eyeColor },
      { type: 'path', d: `M ${rightEyeX - 6} ${eyeY - 1} Q ${rightEyeX} ${eyeY + 5} ${rightEyeX + 6} ${eyeY - 1}`, stroke: eyeColor, strokeWidth: 3, strokeLinecap: 'round', fill: 'none' },
      { type: 'circle', cx: rightEyeX, cy: eyeY + 1, r: eyeR * 0.65, fill: eyeColor }
    );
  } else if (app.eyes.style === 'happy') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 6} ${eyeY + 2} Q ${leftEyeX} ${eyeY - 6} ${leftEyeX + 6} ${eyeY + 2}`, stroke: eyeColor, strokeWidth: 3.2, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 6} ${eyeY + 2} Q ${rightEyeX} ${eyeY - 6} ${rightEyeX + 6} ${eyeY + 2}`, stroke: eyeColor, strokeWidth: 3.2, strokeLinecap: 'round', fill: 'none' }
    );
  } else if (app.eyes.style === 'dot') {
    headShapes.push(
      { type: 'circle', cx: leftEyeX, cy: eyeY, r: eyeR * 0.7, fill: eyeColor },
      { type: 'circle', cx: leftEyeX - 1.2, cy: eyeY - 1.5, r: eyeR * 0.25, fill: '#ffffff' },
      { type: 'circle', cx: rightEyeX, cy: eyeY, r: eyeR * 0.7, fill: eyeColor },
      { type: 'circle', cx: rightEyeX - 1.2, cy: eyeY - 1.5, r: eyeR * 0.25, fill: '#ffffff' }
    );
  } else {
    // Round standard cartoon eyes: White sclera + iris + dual sparkles + upper lash line
    headShapes.push(
      { type: 'circle', cx: leftEyeX, cy: eyeY, r: eyeR, fill: '#ffffff', stroke: '#0f172a', strokeWidth: 1.4 },
      { type: 'circle', cx: leftEyeX, cy: eyeY, r: eyeR * 0.72, fill: eyeColor },
      { type: 'circle', cx: leftEyeX - eyeR * 0.28, cy: eyeY - eyeR * 0.3, r: eyeR * 0.28, fill: '#ffffff' },
      { type: 'circle', cx: leftEyeX + eyeR * 0.32, cy: eyeY + eyeR * 0.3, r: eyeR * 0.15, fill: '#ffffff' },
      { type: 'path', d: `M ${leftEyeX - eyeR * 1.1} ${eyeY - eyeR * 0.3} Q ${leftEyeX} ${eyeY - eyeR * 1.15} ${leftEyeX + eyeR * 1.1} ${eyeY - eyeR * 0.2}`, stroke: '#0f172a', strokeWidth: 1.8, strokeLinecap: 'round', fill: 'none' },

      { type: 'circle', cx: rightEyeX, cy: eyeY, r: eyeR, fill: '#ffffff', stroke: '#0f172a', strokeWidth: 1.4 },
      { type: 'circle', cx: rightEyeX, cy: eyeY, r: eyeR * 0.72, fill: eyeColor },
      { type: 'circle', cx: rightEyeX - eyeR * 0.28, cy: eyeY - eyeR * 0.3, r: eyeR * 0.28, fill: '#ffffff' },
      { type: 'circle', cx: rightEyeX + eyeR * 0.32, cy: eyeY + eyeR * 0.3, r: eyeR * 0.15, fill: '#ffffff' },
      { type: 'path', d: `M ${rightEyeX - eyeR * 1.1} ${eyeY - eyeR * 0.2} Q ${rightEyeX} ${eyeY - 1.15 * eyeR} ${rightEyeX + eyeR * 1.1} ${eyeY - eyeR * 0.3}`, stroke: '#0f172a', strokeWidth: 1.8, strokeLinecap: 'round', fill: 'none' }
    );
  }
  for (let i = eyeStartIdx; i < headShapes.length; i++) {
    headShapes[i].tag = 'eyes';
  }

  // ---------------------------------------------------------------------------
  // 6. EYEBROWS
  // ---------------------------------------------------------------------------
  const browStartIdx = headShapes.length;
  const browY = baseHeadY - 11 * headSize;
  const browColor = isPlanet ? '#0f172a' : isRobot ? '#475569' : (app.eyebrows.color || hairColor);

  if (app.eyebrows.style === 'flat') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 6} ${browY} L ${leftEyeX + 6} ${browY}`, stroke: browColor, strokeWidth: 2.4, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 6} ${browY} L ${rightEyeX + 6} ${browY}`, stroke: browColor, strokeWidth: 2.4, strokeLinecap: 'round', fill: 'none' }
    );
  } else if (app.eyebrows.style === 'bushy') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 7} ${browY + 1} Q ${leftEyeX} ${browY - 4} ${leftEyeX + 7} ${browY}`, stroke: browColor, strokeWidth: 5.2, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 7} ${browY} Q ${rightEyeX} ${browY - 4} ${rightEyeX + 7} ${browY + 1}`, stroke: browColor, strokeWidth: 5.2, strokeLinecap: 'round', fill: 'none' }
    );
  } else if (app.eyebrows.style === 'arched') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 7} ${browY + 2} Q ${leftEyeX - 1} ${browY - 6} ${leftEyeX + 6} ${browY + 1}`, stroke: browColor, strokeWidth: 2.4, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 6} ${browY + 1} Q ${rightEyeX + 1} ${browY - 6} ${rightEyeX + 7} ${browY + 2}`, stroke: browColor, strokeWidth: 2.4, strokeLinecap: 'round', fill: 'none' }
    );
  } else {
    // Curved
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 6} ${browY} Q ${leftEyeX} ${browY - 3} ${leftEyeX + 6} ${browY}`, stroke: browColor, strokeWidth: 2.4, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 6} ${browY} Q ${rightEyeX} ${browY - 3} ${rightEyeX + 6} ${browY}`, stroke: browColor, strokeWidth: 2.4, strokeLinecap: 'round', fill: 'none' }
    );
  }
  for (let i = browStartIdx; i < headShapes.length; i++) {
    headShapes[i].tag = 'eyebrows';
  }

  // ---------------------------------------------------------------------------
  // 7. NOSE
  // ---------------------------------------------------------------------------
  const noseStartIdx = headShapes.length;
  const noseY = baseHeadY + 5;

  if (isBear || app.nose.style === 'bear_snout') {
    headShapes.push(
      { type: 'path', d: `M -6 ${noseY - 1} Q 0 ${noseY - 4} 6 ${noseY - 1} Q 4 ${noseY + 4} 0 ${noseY + 5} Q -4 ${noseY + 4} -6 ${noseY - 1} Z`, fill: '#1e293b' },
      { type: 'ellipse', cx: -1.5, cy: noseY, rx: 1.8, ry: 1.0, fill: '#ffffff', opacity: 0.6 },
      { type: 'path', d: `M 0 ${noseY + 5} L 0 ${noseY + 9}`, stroke: '#1e293b', strokeWidth: 1.6, fill: 'none' }
    );
  } else if (isRobot || app.nose.style === 'triangle') {
    headShapes.push(
      { type: 'path', d: `M -3.5 ${noseY + 2.5} L 0 ${noseY - 3.5} L 3.5 ${noseY + 2.5} Z`, fill: isRobot ? '#06b6d4' : (app.nose.color || '#d97706') }
    );
  } else if (app.nose.style === 'oval') {
    headShapes.push(
      { type: 'ellipse', cx: 0, cy: noseY, rx: 2.2 * (app.nose.size || 1.0), ry: 4.4 * (app.nose.size || 1.0), fill: app.nose.color || '#fcd34d' }
    );
  } else if (isPlanet) {
    headShapes.push(
      { type: 'circle', cx: 0, cy: noseY - 1, r: 2.5, fill: '#38bdf8', stroke: '#0284c7', strokeWidth: 1.2 }
    );
  } else {
    // Button: Natural soft human nose with warm skin contour and nostril curve
    headShapes.push(
      { type: 'circle', cx: 0, cy: noseY + 0.5, r: 2.5 * (app.nose.size || 1.0), fill: '#fcd34d', opacity: 0.45 },
      { type: 'path', d: `M -2.5 ${noseY + 1} Q 0 ${noseY + 3.5} 2.5 ${noseY + 1}`, stroke: '#d97706', strokeWidth: 1.5, strokeLinecap: 'round', fill: 'none', opacity: 0.7 }
    );
  }
  for (let i = noseStartIdx; i < headShapes.length; i++) {
    headShapes[i].tag = 'nose';
  }

  // ---------------------------------------------------------------------------
  // 8. MOUTH
  // ---------------------------------------------------------------------------
  const mouthStartIdx = headShapes.length;
  const mouthY = baseHeadY + (isBear ? 15 : isPlanet ? 12 : 13);
  const mouthColor = isRobot ? '#06b6d4' : isBear ? '#1e293b' : (app.mouth.color || '#b91c1c');

  if (isBear) {
    headShapes.push({
      type: 'path',
      d: `M -7 ${mouthY} Q 0 ${mouthY + 5} 7 ${mouthY}`,
      stroke: '#1e293b',
      strokeWidth: 2.2,
      strokeLinecap: 'round',
      fill: 'none',
    });
  } else if (isRobot) {
    headShapes.push(
      { type: 'rect', x: -8, y: mouthY - 3, width: 16, height: 6, rx: 2, fill: '#0e7490', stroke: '#22d3ee', strokeWidth: 1.2 },
      { type: 'path', d: `M -6 ${mouthY} L 6 ${mouthY}`, stroke: '#67e8f9', strokeWidth: 1.2 }
    );
  } else if (app.mouth.style === 'open_grin') {
    headShapes.push(
      { type: 'path', d: `M -9 ${mouthY} Q 0 ${mouthY + 12} 9 ${mouthY} Z`, fill: '#881337' },
      { type: 'path', d: `M -7 ${mouthY} Q 0 ${mouthY + 4} 7 ${mouthY} L 6 ${mouthY + 3} Q 0 ${mouthY + 5} -6 ${mouthY + 3} Z`, fill: '#ffffff' }
    );
  } else if (app.mouth.style === 'laugh') {
    headShapes.push(
      { type: 'path', d: `M -11 ${mouthY} Q 0 ${mouthY + 16} 11 ${mouthY} Z`, fill: '#881337' },
      { type: 'path', d: `M -6 ${mouthY + 8} Q 0 ${mouthY + 16} 6 ${mouthY + 8} Z`, fill: '#fb7185' }
    );
  } else if (app.mouth.style === 'surprised') {
    headShapes.push({
      type: 'circle',
      cx: 0,
      cy: mouthY + 2,
      r: 4.5,
      fill: '#881337',
      stroke: '#7f1d1d',
      strokeWidth: 1.5,
    });
  } else if (app.mouth.style === 'line') {
    headShapes.push({
      type: 'path',
      d: `M -7 ${mouthY} L 7 ${mouthY}`,
      stroke: mouthColor,
      strokeWidth: 2.6,
      strokeLinecap: 'round',
      fill: 'none',
    });
  } else {
    // Cute cheerful smile with subtle lip depth and corner creases
    headShapes.push(
      { type: 'path', d: `M -8 ${mouthY} Q 0 ${mouthY + 7} 8 ${mouthY}`, stroke: mouthColor, strokeWidth: 2.6, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M -8.5 ${mouthY + 0.5} Q -7.5 ${mouthY - 2} -6 ${mouthY}`, stroke: mouthColor, strokeWidth: 1.4, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M 8.5 ${mouthY + 0.5} Q 7.5 ${mouthY - 2} 6 ${mouthY}`, stroke: mouthColor, strokeWidth: 1.4, strokeLinecap: 'round', fill: 'none' }
    );
  }
  for (let i = mouthStartIdx; i < headShapes.length; i++) {
    headShapes[i].tag = 'mouth';
  }

  // Accessories: Blush & Freckles & Glasses & Hats
  if (!isPlanet) {
    if (!isRobot && app.accessories?.blush !== false) {
      headShapes.push(
        { type: 'ellipse', cx: -18 * headSize, cy: baseHeadY + 5, rx: 5.5, ry: 3.5, fill: '#f87171', opacity: 0.45 },
        { type: 'ellipse', cx: 18 * headSize, cy: baseHeadY + 5, rx: 5.5, ry: 3.5, fill: '#f87171', opacity: 0.45 }
      );
    }
    if (app.accessories?.freckles === true) {
      headShapes.push(
        { type: 'circle', cx: -16 * headSize, cy: baseHeadY + 5, r: 1.2, fill: '#b45309' },
        { type: 'circle', cx: -13 * headSize, cy: baseHeadY + 7, r: 1.2, fill: '#b45309' },
        { type: 'circle', cx: 16 * headSize, cy: baseHeadY + 5, r: 1.2, fill: '#b45309' },
        { type: 'circle', cx: 13 * headSize, cy: baseHeadY + 7, r: 1.2, fill: '#b45309' }
      );
    }
    if (app.accessories?.glasses === 'round') {
      const gc = app.accessories.glassesColor || '#0f172a';
      headShapes.push(
        { type: 'circle', cx: leftEyeX, cy: eyeY, r: eyeR + 3.5, fill: 'none', stroke: gc, strokeWidth: 2.2 },
        { type: 'circle', cx: rightEyeX, cy: eyeY, r: eyeR + 3.5, fill: 'none', stroke: gc, strokeWidth: 2.2 },
        { type: 'path', d: `M ${leftEyeX + eyeR + 3.5} ${eyeY} L ${rightEyeX - eyeR - 3.5} ${eyeY}`, stroke: gc, strokeWidth: 2.2 }
      );
    } else if (app.accessories?.glasses === 'square') {
      const gc = app.accessories.glassesColor || '#0f172a';
      headShapes.push(
        { type: 'rect', x: leftEyeX - 9, y: eyeY - 7, width: 18, height: 14, rx: 3, fill: 'none', stroke: gc, strokeWidth: 2.2 },
        { type: 'rect', x: rightEyeX - 9, y: eyeY - 7, width: 18, height: 14, rx: 3, fill: 'none', stroke: gc, strokeWidth: 2.2 },
        { type: 'path', d: `M ${leftEyeX + 9} ${eyeY} L ${rightEyeX - 9} ${eyeY}`, stroke: gc, strokeWidth: 2.2 }
      );
    }
    if (app.accessories?.hat === 'cap') {
      const hc = app.accessories.hatColor || '#2563eb';
      headShapes.push(
        { type: 'path', d: `M ${-headRx - 2} ${baseHeadY - 10} Q 0 ${baseHeadY - headRy - 18} ${headRx + 2} ${baseHeadY - 10} Z`, fill: hc },
        { type: 'path', d: `M ${-10} ${baseHeadY - 10} Q 28 ${baseHeadY - 8} 38 ${baseHeadY - 4} Q 20 ${baseHeadY} -4 ${baseHeadY - 8} Z`, fill: hc }
      );
    } else if (app.accessories?.hat === 'beanie') {
      const hc = app.accessories.hatColor || '#ef4444';
      headShapes.push(
        { type: 'path', d: `M ${-headRx - 2} ${baseHeadY - 8} Q 0 ${baseHeadY - headRy - 20} ${headRx + 2} ${baseHeadY - 8} Z`, fill: hc },
        { type: 'rect', x: -headRx - 2, y: baseHeadY - 10, width: (headRx + 2) * 2, height: 6, rx: 2, fill: '#f8fafc' },
        { type: 'circle', cx: 0, cy: baseHeadY - headRy - 19, r: 6.0, fill: '#f8fafc' }
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 9. TORSO & CLOTHING (Natural sloped shoulders, rounded curves, depth)
  // ---------------------------------------------------------------------------
  const torsoShapes: VectorPartShape[] = [];
  const shoulderW = (isBear ? 26 : 21) * torsoWidth;
  const waistW = (isBear ? 27 : 19) * torsoWidth;
  const bottomY = 34 * torsoHeight;

  // Neck
  if (!isPlanet) {
    if (isRobot) {
      torsoShapes.push(
        { type: 'rect', x: -neckW / 2, y: neckTopY, width: neckW, height: neckBottomY - neckTopY, rx: 2, fill: '#475569' },
        { type: 'rect', x: -neckW / 2 - 1, y: neckTopY + 3, width: neckW + 2, height: 3, rx: 1, fill: '#64748b' },
        { type: 'rect', x: -neckW / 2 - 1, y: neckTopY + 8, width: neckW + 2, height: 3, rx: 1, fill: '#64748b' }
      );
    } else {
      torsoShapes.push({
        type: 'rect',
        x: -neckW / 2,
        y: neckTopY,
        width: neckW,
        height: neckBottomY - neckTopY,
        rx: 3,
        fill: skin,
      });
      // Soft chin drop-shadow on neck for depth
      torsoShapes.push({
        type: 'path',
        d: `M ${-neckW / 2} ${neckTopY + 2} Q 0 ${neckTopY + 6} ${neckW / 2} ${neckTopY + 2} L ${neckW / 2} ${neckTopY} L ${-neckW / 2} ${neckTopY} Z`,
        fill: '#000000',
        opacity: 0.15,
      });
    }
  }

  // Torso Body Contours
  if (isBear) {
    torsoShapes.push(
      { type: 'path', d: `M 0 -2 Q ${shoulderW * 0.6} -1 ${shoulderW} 6 Q ${shoulderW + 3} 18 ${waistW} ${bottomY} Q 0 ${bottomY + 6} ${-waistW} ${bottomY} Q ${-shoulderW - 3} 18 ${-shoulderW} 6 Q ${-shoulderW * 0.6} -1 0 -2 Z`, fill: skin },
      { type: 'ellipse', cx: 0, cy: bottomY * 0.52, rx: waistW * 0.68, ry: bottomY * 0.48, fill: '#fef3c7' },
      { type: 'path', d: `M ${-shoulderW} 6 Q ${-shoulderW * 0.6} -1 0 -2 L -4 10 L ${-waistW * 0.65} ${bottomY} L ${-waistW} ${bottomY} Q ${-shoulderW - 3} 18 ${-shoulderW} 6 Z`, fill: shirtColor },
      { type: 'path', d: `M ${shoulderW} 6 Q ${shoulderW * 0.6} -1 0 -2 L 4 10 L ${waistW * 0.65} ${bottomY} L ${waistW} ${bottomY} Q ${shoulderW + 3} 18 ${shoulderW} 6 Z`, fill: shirtColor },
      { type: 'circle', cx: -6, cy: 16, r: 1.8, fill: '#facc15' },
      { type: 'circle', cx: -6, cy: 25, r: 1.8, fill: '#facc15' }
    );
  } else if (isRobot) {
    torsoShapes.push(
      { type: 'rect', x: -shoulderW - 1, y: -2, width: (shoulderW + 1) * 2, height: bottomY + 2, rx: 6, fill: '#475569', stroke: '#334155', strokeWidth: 1.5 },
      { type: 'rect', x: -shoulderW + 5, y: 7, width: (shoulderW - 5) * 2, height: 18, rx: 3, fill: '#1e293b' },
      { type: 'rect', x: -14, y: 11, width: 7, height: 10, rx: 1.5, fill: '#22c55e' },
      { type: 'rect', x: -5, y: 11, width: 7, height: 10, rx: 1.5, fill: '#eab308' },
      { type: 'rect', x: 4, y: 11, width: 7, height: 10, rx: 1.5, fill: '#06b6d4' },
      { type: 'circle', cx: 16, cy: 16, r: 3, fill: '#f43f5e' }
    );
  } else if (app.torso.clothingStyle === 'dress') {
    torsoShapes.push(
      { type: 'path', d: `M 0 -2 Q ${shoulderW * 0.6} -1 ${shoulderW} 5 L ${shoulderW + 8} ${bottomY + 14} Q 0 ${bottomY + 18} ${-shoulderW - 8} ${bottomY + 14} L ${-shoulderW} 5 Q ${-shoulderW * 0.6} -1 0 -2 Z`, fill: shirtColor },
      { type: 'path', d: `M -11 -1 Q 0 5 11 -1`, stroke: collarColor, strokeWidth: 3.0, strokeLinecap: 'round', fill: 'none' },
      { type: 'rect', x: -waistW, y: bottomY - 4, width: waistW * 2, height: 5, fill: collarColor }
    );
  } else if (app.torso.clothingStyle === 'collared') {
    torsoShapes.push(
      { type: 'path', d: `M 0 -2 Q ${shoulderW * 0.6} -1 ${shoulderW} 5 Q ${shoulderW + 1} 16 ${waistW} ${bottomY} Q 0 ${bottomY + 4} ${-waistW} ${bottomY} Q ${-shoulderW - 1} 16 ${-shoulderW} 5 Q ${-shoulderW * 0.6} -1 0 -2 Z`, fill: shirtColor },
      { type: 'path', d: `M -12 -1 L -5 9 L 0 2 L 5 9 L 12 -1 Z`, fill: collarColor }
    );
  } else if (app.torso.clothingStyle === 'hoodie') {
    torsoShapes.push(
      { type: 'path', d: `M 0 -2 Q ${shoulderW * 0.6} -1 ${shoulderW} 5 Q ${shoulderW + 1} 16 ${waistW} ${bottomY} Q 0 ${bottomY + 4} ${-waistW} ${bottomY} Q ${-shoulderW - 1} 16 ${-shoulderW} 5 Q ${-shoulderW * 0.6} -1 0 -2 Z`, fill: shirtColor },
      { type: 'path', d: `M ${-waistW * 0.55} ${bottomY - 14} L ${waistW * 0.55} ${bottomY - 14} L ${waistW * 0.75} ${bottomY} L ${-waistW * 0.75} ${bottomY} Z`, fill: collarColor, opacity: 0.9 },
      { type: 'path', d: `M ${-waistW * 0.55} ${bottomY - 14} L ${waistW * 0.55} ${bottomY - 14}`, stroke: '#ffffff', strokeWidth: 1.0, strokeLinecap: 'round', fill: 'none', opacity: 0.4 },
      { type: 'path', d: `M -12 -2 Q 0 4 12 -2 Q 9 2 0 4 Q -9 2 -12 -2 Z`, fill: collarColor },
      { type: 'path', d: `M -4 2 L -4 13`, stroke: '#ffffff', strokeWidth: 1.5, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M 4 2 L 4 13`, stroke: '#ffffff', strokeWidth: 1.5, strokeLinecap: 'round', fill: 'none' }
    );
  } else {
    // T-shirt
    torsoShapes.push(
      { type: 'path', d: `M 0 -2 Q ${shoulderW * 0.6} -1 ${shoulderW} 5 Q ${shoulderW + 1} 16 ${waistW} ${bottomY} Q 0 ${bottomY + 4} ${-waistW} ${bottomY} Q ${-shoulderW - 1} 16 ${-shoulderW} 5 Q ${-shoulderW * 0.6} -1 0 -2 Z`, fill: shirtColor },
      { type: 'path', d: `M -11 -1 Q 0 5 11 -1`, stroke: collarColor, strokeWidth: 3.0, strokeLinecap: 'round', fill: 'none' }
    );
    if (app.torso.pattern === 'star') {
      torsoShapes.push(
        { type: 'circle', cx: 0, cy: 15, r: 7.0, fill: '#ef4444' },
        { type: 'circle', cx: 0, cy: 15, r: 3.8, fill: '#fef08a' }
      );
    } else if (app.torso.pattern === 'circle') {
      torsoShapes.push({ type: 'circle', cx: 0, cy: 15, r: 6.5, fill: '#fde047', stroke: '#ca8a04', strokeWidth: 1.2 });
    } else if (app.torso.pattern === 'stripe') {
      torsoShapes.push(
        { type: 'rect', x: -waistW + 2, y: 12, width: waistW * 2 - 4, height: 3.5, fill: collarColor },
        { type: 'rect', x: -waistW + 2, y: 22, width: waistW * 2 - 4, height: 3.5, fill: collarColor }
      );
    }
  }

  // Waistband
  if (!isPlanet) {
    torsoShapes.push({
      type: 'rect',
      x: -waistW,
      y: bottomY,
      width: waistW * 2,
      height: 7,
      rx: 2,
      fill: app.leftLeg?.pantsColor || app.legs.pantsColor || '#1e3a8a',
    });
  }

  // ---------------------------------------------------------------------------
  // 10. CONNECTED ARMS & HANDS
  // ---------------------------------------------------------------------------
  const lArm = app.leftArm || {
    upperArmLength: app.arms.length,
    upperArmThickness: app.arms.thickness,
    forearmLength: app.arms.length,
    forearmThickness: app.arms.thickness,
    handSize: 1.0,
    skinColor: skin,
  };
  const rArm = app.rightArm || {
    upperArmLength: app.arms.length,
    upperArmThickness: app.arms.thickness,
    forearmLength: app.arms.length,
    forearmThickness: app.arms.thickness,
    handSize: 1.0,
    skinColor: skin,
  };

  const leftUpperArmLen = 14 * (lArm.upperArmLength ?? 1.0);
  const leftForearmLen = 14 * (lArm.forearmLength ?? 1.0);
  const leftArmThick = (lArm.upperArmThickness ?? 1.0) * (isBear ? 1.15 : 1.0);
  const leftArmSkin = lArm.skinColor || skin;
  const leftShoulderX = -shoulderW;
  const leftShoulderY = 5;
  const leftElbowX = leftShoulderX - 2;
  const leftElbowY = leftShoulderY + leftUpperArmLen;

  const rightUpperArmLen = 14 * (rArm.upperArmLength ?? 1.0);
  const rightForearmLen = 14 * (rArm.forearmLength ?? 1.0);
  const rightArmThick = (rArm.upperArmThickness ?? 1.0) * (isBear ? 1.15 : 1.0);
  const rightArmSkin = rArm.skinColor || skin;
  const rightShoulderX = shoulderW;
  const rightShoulderY = 5;
  const rightElbowX = rightShoulderX + 2;
  const rightElbowY = rightShoulderY + rightUpperArmLen;

  const drawHand = (cx: number, cy: number, isLeft: boolean, handSize: number = 1.0, handSkin: string = skin): VectorPartShape[] => {
    if (isBear) {
      return [
        { type: 'circle', cx, cy, r: 5.8 * handSize, fill: handSkin, stroke: '#92400e', strokeWidth: 1.2 },
        { type: 'circle', cx: cx + (isLeft ? -1.8 : 1.8) * handSize, cy: cy - 3.8 * handSize, r: 1.6 * handSize, fill: '#fef3c7' },
        { type: 'circle', cx: cx, cy: cy - 4.8 * handSize, r: 1.8 * handSize, fill: '#fef3c7' },
        { type: 'circle', cx: cx + (isLeft ? 1.8 : -1.8) * handSize, cy: cy - 3.8 * handSize, r: 1.6 * handSize, fill: '#fef3c7' },
        { type: 'ellipse', cx, cy: cy + 0.8 * handSize, rx: 3.0 * handSize, ry: 2.0 * handSize, fill: '#fef3c7' }
      ];
    } else if (isRobot) {
      return [
        { type: 'circle', cx, cy: cy - 1, r: 3.8 * handSize, fill: '#64748b' },
        { type: 'path', d: `M ${cx - 3 * handSize} ${cy} Q ${cx - 4.5 * handSize} ${cy + 6 * handSize} ${cx - 1 * handSize} ${cy + 5.5 * handSize} L ${cx} ${cy + 2 * handSize}`, fill: '#94a3b8', stroke: '#475569', strokeWidth: 1 },
        { type: 'path', d: `M ${cx + 3 * handSize} ${cy} Q ${cx + 4.5 * handSize} ${cy + 6 * handSize} ${cx + 1 * handSize} ${cy + 5.5 * handSize} L ${cx} ${cy + 2 * handSize}`, fill: '#94a3b8', stroke: '#475569', strokeWidth: 1 }
      ];
    }
    const thumbDir = isLeft ? 1 : -1;
    return [
      { type: 'ellipse', cx, cy: cy + 1, rx: 4.5 * handSize, ry: 5.2 * handSize, fill: handSkin },
      { type: 'ellipse', cx: cx + thumbDir * 3.0 * handSize, cy: cy - 0.5 * handSize, rx: 2.0 * handSize, ry: 2.8 * handSize, fill: handSkin },
      { type: 'path', d: `M ${cx - 1.8 * handSize} ${cy + 3.2 * handSize} Q ${cx} ${cy + 4.2 * handSize} ${cx + 1.8 * handSize} ${cy + 3.2 * handSize}`, stroke: '#d97706', strokeWidth: 0.9, strokeLinecap: 'round', fill: 'none', opacity: 0.35 }
    ];
  };

  // Left Arm (Upper)
  const leftArmShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${leftShoulderX - 2.5 * leftArmThick} ${leftShoulderY} Q ${leftShoulderX - 4 * leftArmThick} ${leftShoulderY + leftUpperArmLen * 0.5} ${leftElbowX - 2.5 * leftArmThick} ${leftElbowY} L ${leftElbowX + 2.5 * leftArmThick} ${leftElbowY} Q ${leftShoulderX + 2.5 * leftArmThick} ${leftShoulderY + leftUpperArmLen * 0.5} ${leftShoulderX + 2.5 * leftArmThick} ${leftShoulderY} Z`,
      fill: leftArmSkin,
    },
    {
      type: 'path',
      d: `M ${leftShoulderX - 3.5 * leftArmThick} ${leftShoulderY - 1} Q ${leftShoulderX - 4.5 * leftArmThick} ${leftShoulderY + 4} ${leftShoulderX - 3.5 * leftArmThick} ${leftShoulderY + 8} L ${leftShoulderX + 2.5 * leftArmThick} ${leftShoulderY + 8} L ${leftShoulderX + 2.5 * leftArmThick} ${leftShoulderY - 1} Z`,
      fill: shirtColor,
    },
    {
      type: 'path',
      d: `M ${leftShoulderX - 3.5 * leftArmThick} ${leftShoulderY + 8} L ${leftShoulderX + 2.5 * leftArmThick} ${leftShoulderY + 8}`,
      stroke: collarColor,
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      fill: 'none',
    }
  ];

  // Left Forearm
  const leftForearmShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${leftElbowX - 2.5 * leftArmThick} ${leftElbowY} Q ${leftElbowX - 3.5 * leftArmThick} ${leftElbowY + leftForearmLen * 0.5} ${leftElbowX - 2} ${leftElbowY + leftForearmLen} L ${leftElbowX + 2.5 * leftArmThick} ${leftElbowY + leftForearmLen} Q ${leftElbowX + 3.5 * leftArmThick} ${leftElbowY + leftForearmLen * 0.5} ${leftElbowX + 2.5 * leftArmThick} ${leftElbowY} Z`,
      fill: leftArmSkin,
    },
    ...drawHand(leftElbowX, leftElbowY + leftForearmLen + 3, true, lArm.handSize || 1.0, leftArmSkin),
  ];

  // Right Arm (Upper)
  const rightArmShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${rightShoulderX - 2.5 * rightArmThick} ${rightShoulderY} Q ${rightShoulderX - 2.5 * rightArmThick} ${rightShoulderY + rightUpperArmLen * 0.5} ${rightElbowX - 2.5 * rightArmThick} ${rightElbowY} L ${rightElbowX + 2.5 * rightArmThick} ${rightElbowY} Q ${rightShoulderX + 4 * rightArmThick} ${rightShoulderY + rightUpperArmLen * 0.5} ${rightShoulderX + 2.5 * rightArmThick} ${rightShoulderY} Z`,
      fill: rightArmSkin,
    },
    {
      type: 'path',
      d: `M ${rightShoulderX - 2.5 * rightArmThick} ${rightShoulderY - 1} L ${rightShoulderX - 2.5 * rightArmThick} ${rightShoulderY + 8} L ${rightShoulderX + 3.5 * rightArmThick} ${rightShoulderY + 8} Q ${rightShoulderX + 4.5 * rightArmThick} ${rightShoulderY + 4} ${rightShoulderX + 3.5 * rightArmThick} ${rightShoulderY - 1} Z`,
      fill: shirtColor,
    },
    {
      type: 'path',
      d: `M ${rightShoulderX - 2.5 * rightArmThick} ${rightShoulderY + 8} L ${rightShoulderX + 3.5 * rightArmThick} ${rightShoulderY + 8}`,
      stroke: collarColor,
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      fill: 'none',
    }
  ];

  // Right Forearm
  const rightForearmShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${rightElbowX - 2.5 * rightArmThick} ${rightElbowY} Q ${rightElbowX - 3.5 * rightArmThick} ${rightElbowY + rightForearmLen * 0.5} ${rightElbowX - 2.5 * rightArmThick} ${rightElbowY + rightForearmLen} L ${rightElbowX + 2} ${rightElbowY + rightForearmLen} Q ${rightElbowX + 3.5 * rightArmThick} ${rightElbowY + rightForearmLen * 0.5} ${rightElbowX + 2.5 * rightArmThick} ${rightElbowY} Z`,
      fill: rightArmSkin,
    },
    ...drawHand(rightElbowX, rightElbowY + rightForearmLen + 3, false, rArm.handSize || 1.0, rightArmSkin),
  ];

  // ---------------------------------------------------------------------------
  // 11. LEGS & FOOTWEAR
  // ---------------------------------------------------------------------------
  const hipX = 10 * (isBear ? 1.2 : 1.0);
  const hipY = bottomY + 7;
  const lLeg = app.leftLeg || {
    upperLegLength: app.legs.length,
    upperLegThickness: app.legs.thickness,
    lowerLegLength: app.legs.length,
    lowerLegThickness: app.legs.thickness,
    footSize: 1.0,
    pantsStyle: app.legs.pantsStyle,
    pantsColor: app.legs.pantsColor,
    shoeStyle: app.legs.shoeStyle,
    shoeColor: app.legs.shoeColor,
    hipOffset: { x: 0, y: 0 },
  };
  const rLeg = app.rightLeg || {
    upperLegLength: app.legs.length,
    upperLegThickness: app.legs.thickness,
    lowerLegLength: app.legs.length,
    lowerLegThickness: app.legs.thickness,
    footSize: 1.0,
    pantsStyle: app.legs.pantsStyle,
    pantsColor: app.legs.pantsColor,
    shoeStyle: app.legs.shoeStyle,
    shoeColor: app.legs.shoeColor,
    hipOffset: { x: 0, y: 0 },
  };

  const leftHipX = -hipX + (lLeg.hipOffset?.x ?? 0);
  const leftHipY = hipY + (lLeg.hipOffset?.y ?? 0);
  const leftLegLen = 22 * (lLeg.lowerLegLength ?? 1.0);
  const leftLegThick = lLeg.upperLegThickness ?? 1.0;
  const leftPantsColor = lLeg.pantsColor || app.legs.pantsColor || '#1e3a8a';
  const leftShoeColor = lLeg.shoeColor || app.legs.shoeColor || '#dc2626';
  const leftShoeStyle = lLeg.shoeStyle || app.legs.shoeStyle || 'sneakers';
  const leftFootSize = lLeg.footSize ?? 1.0;

  const rightHipX = hipX + (rLeg.hipOffset?.x ?? 0);
  const rightHipY = hipY + (rLeg.hipOffset?.y ?? 0);
  const rightLegLen = 22 * (rLeg.lowerLegLength ?? 1.0);
  const rightLegThick = rLeg.upperLegThickness ?? 1.0;
  const rightPantsColor = rLeg.pantsColor || app.legs.pantsColor || '#1e3a8a';
  const rightShoeColor = rLeg.shoeColor || app.legs.shoeColor || '#dc2626';
  const rightShoeStyle = rLeg.shoeStyle || app.legs.shoeStyle || 'sneakers';
  const rightFootSize = rLeg.footSize ?? 1.0;

  const drawFootwear = (hx: number, footY: number, isLeft: boolean, shoeStyle: string, shoeColor: string, footSize: number = 1.0): VectorPartShape[] => {
    const footW = 16 * footSize;
    const footH = 9 * footSize;
    const footX = isLeft ? hx - footW * 0.65 : hx - footW * 0.35;

    if (isRobot) {
      return [
        { type: 'rect', x: hx - 7, y: footY, width: 14, height: footH, rx: 2, fill: '#334155', stroke: '#1e293b', strokeWidth: 1.2 },
        { type: 'rect', x: hx - 8, y: footY + footH - 3, width: 16, height: 3, rx: 1, fill: '#0f172a' },
        { type: 'circle', cx: hx, cy: footY + 3.5, r: 1.3, fill: '#06b6d4' }
      ];
    } else if (shoeStyle === 'boots') {
      return [
        { type: 'path', d: `M ${hx - 7 * footSize} ${footY - 3} L ${hx + 7 * footSize} ${footY - 3} L ${hx + 8 * footSize} ${footY + footH} L ${hx - 8 * footSize} ${footY + footH} Z`, fill: shoeColor },
        { type: 'rect', x: hx - 9 * footSize, y: footY + footH - 3, width: 18 * footSize, height: 3.5, rx: 1, fill: '#0f172a' },
        { type: 'rect', x: hx - 3.5 * footSize, y: footY, width: 7 * footSize, height: 2.5, rx: 1, fill: '#facc15' }
      ];
    }
    // Sneakers
    return [
      { type: 'path', d: `M ${footX} ${footY} Q ${hx} ${footY - 3} ${footX + footW} ${footY} L ${footX + footW} ${footY + footH} L ${footX} ${footY + footH} Z`, fill: shoeColor },
      {
        type: 'path',
        d: isLeft
          ? `M ${footX} ${footY + 2} Q ${footX + 5} ${footY + 1} ${footX + 6} ${footY + footH} L ${footX} ${footY + footH} Z`
          : `M ${footX + footW} ${footY + 2} Q ${footX + footW - 5} ${footY + 1} ${footX + footW - 6} ${footY + footH} L ${footX + footW} ${footY + footH} Z`,
        fill: '#ffffff',
      },
      { type: 'rect', x: footX - 1, y: footY + footH - 3, width: footW + 2, height: 3, rx: 1, fill: '#ffffff' },
      { type: 'path', d: `M ${footX - 1} ${footY + footH - 1.5} L ${footX + footW + 1} ${footY + footH - 1.5}`, stroke: '#94a3b8', strokeWidth: 0.8 },
      { type: 'path', d: `M ${hx - 2.5} ${footY + 1.8} L ${hx + 2.5} ${footY + 1.8}`, stroke: '#ffffff', strokeWidth: 1.3, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${hx - 2} ${footY + 4} L ${hx + 2} ${footY + 4}`, stroke: '#ffffff', strokeWidth: 1.3, strokeLinecap: 'round', fill: 'none' }
    ];
  };

  // Left Leg
  const leftLegShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${leftHipX - 6 * leftLegThick} ${leftHipY} L ${leftHipX - 4.5 * leftLegThick} ${leftHipY + leftLegLen} L ${leftHipX + 4.5 * leftLegThick} ${leftHipY + leftLegLen} L ${leftHipX + 6 * leftLegThick} ${leftHipY} Z`,
      fill: leftPantsColor,
    },
    {
      type: 'rect',
      x: leftHipX - 5 * leftLegThick,
      y: leftHipY + leftLegLen - 2.5,
      width: 10 * leftLegThick,
      height: 2.5,
      rx: 1,
      fill: leftPantsColor,
      stroke: '#0f172a',
      strokeWidth: 0.6,
      opacity: 0.8,
    },
    ...drawFootwear(leftHipX, leftHipY + leftLegLen, true, leftShoeStyle, leftShoeColor, leftFootSize),
  ];

  // Right Leg
  const rightLegShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${rightHipX - 6 * rightLegThick} ${rightHipY} L ${rightHipX - 4.5 * rightLegThick} ${rightHipY + rightLegLen} L ${rightHipX + 4.5 * rightLegThick} ${rightHipY + rightLegLen} L ${rightHipX + 6 * rightLegThick} ${rightHipY} Z`,
      fill: rightPantsColor,
    },
    {
      type: 'rect',
      x: rightHipX - 5 * rightLegThick,
      y: rightHipY + rightLegLen - 2.5,
      width: 10 * rightLegThick,
      height: 2.5,
      rx: 1,
      fill: rightPantsColor,
      stroke: '#0f172a',
      strokeWidth: 0.6,
      opacity: 0.8,
    },
    ...drawFootwear(rightHipX, rightHipY + rightLegLen, false, rightShoeStyle, rightShoeColor, rightFootSize),
  ];

  const finalTorsoShapes = isPlanet ? [] : torsoShapes;
  const finalLeftArmShapes = isPlanet ? [] : leftArmShapes;
  const finalRightArmShapes = isPlanet ? [] : rightArmShapes;
  const finalLeftForearmShapes = isPlanet ? [] : leftForearmShapes;
  const finalRightForearmShapes = isPlanet ? [] : rightForearmShapes;
  const finalLeftLegShapes = isPlanet ? [] : leftLegShapes;
  const finalRightLegShapes = isPlanet ? [] : rightLegShapes;

  return {
    id: `custom-rig-${id}`,
    name,
    species: app.species || 'Human',
    viewBox: '-100 -115 200 220',
    baseWidth: isPlanet ? 160 : 150 * torsoWidth,
    baseHeight: isPlanet ? 200 : 210,
    parts: {
      torso: {
        id: 'torso',
        label: 'Torso',
        pivot: { x: 0, y: isPlanet ? 0 : 12 },
        zIndex: 2,
        shapes: finalTorsoShapes,
      },
      head: {
        id: 'head',
        label: isPlanet ? 'Globe' : 'Head',
        pivot: { x: 0, y: isPlanet ? baseHeadY : headChinY },
        zIndex: 4,
        shapes: headShapes,
      },
      leftArm: {
        id: 'leftArm',
        label: 'Left Upper Arm',
        pivot: { x: leftShoulderX, y: leftShoulderY },
        zIndex: 1,
        shapes: finalLeftArmShapes,
      },
      leftForearm: {
        id: 'leftForearm',
        label: 'Left Forearm',
        pivot: { x: leftElbowX, y: leftElbowY },
        zIndex: 1,
        shapes: finalLeftForearmShapes,
      },
      rightArm: {
        id: 'rightArm',
        label: 'Right Upper Arm',
        pivot: { x: rightShoulderX, y: rightShoulderY },
        zIndex: 3,
        shapes: finalRightArmShapes,
      },
      rightForearm: {
        id: 'rightForearm',
        label: 'Right Forearm',
        pivot: { x: rightElbowX, y: rightElbowY },
        zIndex: 4,
        shapes: finalRightForearmShapes,
      },
      leftLeg: {
        id: 'leftLeg',
        label: 'Left Leg',
        pivot: { x: leftHipX, y: leftHipY },
        zIndex: 1,
        shapes: finalLeftLegShapes,
      },
      rightLeg: {
        id: 'rightLeg',
        label: 'Right Leg',
        pivot: { x: rightHipX, y: rightHipY },
        zIndex: 1,
        shapes: finalRightLegShapes,
      },
    },
  };
}
