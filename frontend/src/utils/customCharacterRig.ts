import {
  CustomCharacterAppearance,
  VectorRigDefinition,
  VectorPartShape,
  VectorRigPart,
  ArmLimbConfig,
  LegLimbConfig,
} from '../types/animation';

export const DEFAULT_APPEARANCE: CustomCharacterAppearance = {
  version: 1,
  species: 'human',
  gender: 'boy',
  head: {
    shape: 'round',
    size: 1.0,
    skinColor: '#fed7aa', // Light peach
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
        skinColor: '#fde68a',
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
        skinColor: '#d97706', // Honey brown
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
        shoeStyle: 'shoes',
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
        skinColor: '#94a3b8', // Silver
      },
      hair: {
        style: 'none',
        color: '#64748b',
      },
      eyes: {
        style: 'anime',
        color: '#06b6d4', // Cyan glowing eyes
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
        skinColor: '#cbd5e1',
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
  };
}

/**
 * Builds a valid, articulated VectorRigDefinition from a customizable appearance model.
 */
export function buildRigFromAppearance(
  id: string,
  name: string,
  rawAppearance: CustomCharacterAppearance
): VectorRigDefinition {
  const app = normalizeAppearance(rawAppearance);

  const headSize = app.head.size;
  const skin = app.head.skinColor;
  const hairColor = app.hair.color;
  const eyeColor = app.eyes.color;
  const eyeSize = app.eyes.size;

  const torsoWidth = app.torso.width;
  const torsoHeight = app.torso.height;
  const shirtColor = app.torso.shirtColor;
  const collarColor = app.torso.collarColor || '#93c5fd';

  // -------------------------------------------------------------------------
  // 1. HEAD & NECK PROPORTIONS & SHAPES
  // -------------------------------------------------------------------------
  const neckLength = app.neck?.length || 'normal';
  const neckThickness = app.neck?.thickness || 'normal';
  const neckStyle = app.neck?.style || 'plain';
  const neckColor = app.neck?.color || skin;

  const neckWMult = neckThickness === 'slim' ? 18 : neckThickness === 'wide' ? 30 : 24;
  const neckW = neckWMult * Math.max(0.8, Math.min(1.2, torsoWidth));

  const isPlanet = app.species?.toLowerCase() === 'planet' || app.species?.toLowerCase() === 'earth';
  const headYOffset = isPlanet ? 14 : (neckLength === 'short' || neckStyle === 'chibi' ? 8 : neckLength === 'long' ? -4 : 0);
  const baseHeadY = isPlanet ? -40 : -54 + headYOffset;

  const headShapes: VectorPartShape[] = [];

  // Ears (Skip for planet)
  if (!isPlanet) {
    const earRx = (app.ears.style === 'bear' ? 12 : 7) * (app.ears.size || 1.0);
    const earRy = (app.ears.style === 'bear' ? 12 : 11) * (app.ears.size || 1.0);
    const earY = app.ears.style === 'bear' ? baseHeadY - 24 : baseHeadY;

    if (app.ears.style === 'bear') {
      headShapes.push(
        { type: 'circle', cx: -28 * headSize, cy: earY, r: earRx, fill: skin },
        { type: 'circle', cx: 28 * headSize, cy: earY, r: earRx, fill: skin },
        { type: 'circle', cx: -28 * headSize, cy: earY, r: earRx * 0.55, fill: '#fef3c7' },
        { type: 'circle', cx: 28 * headSize, cy: earY, r: earRx * 0.55, fill: '#fef3c7' }
      );
    } else if (app.ears.style === 'elf') {
      headShapes.push(
        {
          type: 'path',
          d: `M ${-28 * headSize} ${earY - 2} Q ${-46 * headSize} ${earY - 14} ${-30 * headSize} ${earY + 10} Z`,
          fill: skin,
        },
        {
          type: 'path',
          d: `M ${28 * headSize} ${earY - 2} Q ${46 * headSize} ${earY - 14} ${30 * headSize} ${earY + 10} Z`,
          fill: skin,
        }
      );
    } else if (app.ears.style === 'round') {
      headShapes.push(
        { type: 'circle', cx: -30 * headSize, cy: earY, r: 7 * (app.ears.size || 1.0), fill: skin },
        { type: 'circle', cx: 30 * headSize, cy: earY, r: 7 * (app.ears.size || 1.0), fill: skin }
      );
    } else {
      headShapes.push(
        { type: 'ellipse', cx: -31 * headSize, cy: earY, rx: earRx, ry: earRy, fill: skin },
        { type: 'ellipse', cx: 31 * headSize, cy: earY, rx: earRx, ry: earRy, fill: skin }
      );
    }
  }

  // Head Base Geometry
  const headRx = (isPlanet ? 46 : 30) * headSize;
  const headRy = (isPlanet ? 46 : 28) * headSize;
  const headChinY = baseHeadY + headRy;

  if (isPlanet) {
    // Atmosphere soft rim glow
    headShapes.push(
      { type: 'circle', cx: 0, cy: baseHeadY, r: headRx + 6, fill: '#38bdf8', opacity: 0.22, tag: 'face_base' },
      { type: 'circle', cx: 0, cy: baseHeadY, r: headRx + 3, fill: '#60a5fa', opacity: 0.28, tag: 'face_base' },
      { type: 'circle', cx: 0, cy: baseHeadY, r: headRx, fill: skin || '#1d4ed8', tag: 'face_base' }
    );
    // Green continents / Landmasses
    const continent1 = app.hair.color || '#10b981';
    const continent2 = '#059669';
    headShapes.push(
      {
        type: 'path',
        d: `M ${-headRx * 0.7} ${baseHeadY - headRx * 0.43} Q ${-headRx * 0.39} ${baseHeadY - headRx * 0.74} ${-headRx * 0.09} ${baseHeadY - headRx * 0.52} Q ${-headRx * 0.17} ${baseHeadY - headRx * 0.17} ${-headRx * 0.48} ${baseHeadY - headRx * 0.09} Q ${-headRx * 0.7} ${baseHeadY - headRx * 0.17} ${-headRx * 0.7} ${baseHeadY - headRx * 0.43} Z`,
        fill: continent1,
        tag: 'face_base',
      },
      {
        type: 'path',
        d: `M ${-headRx * 0.57} ${baseHeadY + headRx * 0.13} Q ${-headRx * 0.3} ${baseHeadY + headRx * 0.17} ${-headRx * 0.22} ${baseHeadY + headRx * 0.52} Q ${-headRx * 0.43} ${baseHeadY + headRx * 0.78} ${-headRx * 0.61} ${baseHeadY + headRx * 0.57} Z`,
        fill: continent2,
        tag: 'face_base',
      },
      {
        type: 'path',
        d: `M ${headRx * 0.13} ${baseHeadY - headRx * 0.61} Q ${headRx * 0.65} ${baseHeadY - headRx * 0.7} ${headRx * 0.83} ${baseHeadY - headRx * 0.3} Q ${headRx * 0.65} ${baseHeadY - headRx * 0.09} ${headRx * 0.35} ${baseHeadY - headRx * 0.17} Q ${headRx * 0.09} ${baseHeadY - headRx * 0.35} ${headRx * 0.13} ${baseHeadY - headRx * 0.61} Z`,
        fill: continent1,
        tag: 'face_base',
      },
      {
        type: 'path',
        d: `M ${headRx * 0.22} ${baseHeadY + headRx * 0.09} Q ${headRx * 0.61} ${baseHeadY + headRx * 0.17} ${headRx * 0.7} ${baseHeadY + headRx * 0.48} Q ${headRx * 0.48} ${baseHeadY + headRx * 0.74} ${headRx * 0.26} ${baseHeadY + headRx * 0.52} Z`,
        fill: continent2,
        tag: 'face_base',
      },
      {
        type: 'path',
        d: `M ${-headRx * 0.6} ${baseHeadY - headRx * 0.6} Q 0 ${baseHeadY - headRx * 0.45} ${headRx * 0.55} ${baseHeadY - headRx * 0.65}`,
        stroke: '#ffffff',
        strokeWidth: 3,
        strokeLinecap: 'round',
        opacity: 0.45,
        fill: 'none',
        tag: 'face_base',
      },
      {
        type: 'path',
        d: `M ${-headRx * 0.4} ${baseHeadY + headRx * 0.7} Q ${headRx * 0.2} ${baseHeadY + headRx * 0.55} ${headRx * 0.6} ${baseHeadY + headRx * 0.7}`,
        stroke: '#ffffff',
        strokeWidth: 2.5,
        strokeLinecap: 'round',
        opacity: 0.4,
        fill: 'none',
        tag: 'face_base',
      }
    );
  } else if (app.head.shape === 'square') {
    headShapes.push({
      type: 'rect',
      x: -headRx,
      y: baseHeadY - headRy,
      width: headRx * 2,
      height: headRy * 2,
      rx: 6,
      fill: skin,
    });
  } else if (app.head.shape === 'oval') {
    headShapes.push({
      type: 'ellipse',
      cx: 0,
      cy: baseHeadY,
      rx: headRx * 0.82,
      ry: headRy * 1.25,
      fill: skin,
    });
  } else if (app.head.shape === 'heart') {
    const heartPath = `M 0 ${baseHeadY + headRy * 1.05} C ${-headRx * 1.2} ${baseHeadY + headRy * 0.3} ${-headRx * 1.15} ${baseHeadY - headRy * 0.85} ${-headRx * 0.55} ${baseHeadY - headRy * 0.95} C ${-headRx * 0.15} ${baseHeadY - headRy * 1.0} 0 ${baseHeadY - headRy * 0.45} 0 ${baseHeadY - headRy * 0.35} C 0 ${baseHeadY - headRy * 0.45} ${headRx * 0.15} ${baseHeadY - headRy * 1.0} ${headRx * 0.55} ${baseHeadY - headRy * 0.95} C ${headRx * 1.15} ${baseHeadY - headRy * 0.85} ${headRx * 1.2} ${baseHeadY + headRy * 0.3} 0 ${baseHeadY + headRy * 1.05} Z`;
    headShapes.push({
      type: 'path',
      d: heartPath,
      fill: skin,
    });
  } else {
    headShapes.push({
      type: 'ellipse',
      cx: 0,
      cy: baseHeadY,
      rx: headRx,
      ry: headRy,
      fill: skin,
    });
  }

  // Snout (for bear / animal)
  if (!isPlanet && (app.species === 'bear' || app.nose.style === 'bear_snout')) {
    headShapes.push({
      type: 'ellipse',
      cx: 0,
      cy: baseHeadY + 9,
      rx: 18 * headSize,
      ry: 13 * headSize,
      fill: '#fef3c7',
    });
  }

  // Hair Back/Main (Skip for planet)
  if (!isPlanet) {
    if (app.hair.style === 'short') {
      headShapes.push(
        {
          type: 'path',
          d: `M ${-34 * headSize} -60 Q ${-36 * headSize} -90 0 -92 Q ${36 * headSize} -90 ${34 * headSize} -60 Q 24 -70 12 -72 Q 0 -66 -10 -72 Q -24 -70 ${-34 * headSize} -60 Z`,
          fill: hairColor,
        },
        {
          type: 'path',
          d: 'M -22 -68 Q -10 -58 0 -68 Q 12 -58 24 -68',
          stroke: hairColor,
          strokeWidth: 4,
          strokeLinecap: 'round',
          fill: 'none',
        }
      );
    } else if (app.hair.style === 'curly') {
      headShapes.push(
        {
          type: 'path',
          d: `M ${-36 * headSize} -55 Q ${-42 * headSize} -85 -18 -88 Q 0 -96 22 -88 Q ${42 * headSize} -85 ${36 * headSize} -55 Q 26 -72 10 -70 Q 0 -76 -12 -70 Q -26 -72 ${-36 * headSize} -55 Z`,
          fill: hairColor,
        },
        { type: 'circle', cx: -24, cy: -82, r: 10, fill: hairColor },
        { type: 'circle', cx: 0, cy: -88, r: 12, fill: hairColor },
        { type: 'circle', cx: 24, cy: -82, r: 10, fill: hairColor }
      );
    } else if (app.hair.style === 'spiky') {
      headShapes.push({
        type: 'path',
        d: `M ${-34 * headSize} -60 L -30 -85 L -16 -75 L 0 -94 L 16 -75 L 30 -85 L ${34 * headSize} -60 Q 18 -72 0 -68 Q -18 -72 ${-34 * headSize} -60 Z`,
        fill: hairColor,
      });
    } else if (app.hair.style === 'bob') {
      headShapes.push({
        type: 'path',
        d: `M ${-34 * headSize} -36 Q ${-38 * headSize} -90 0 -92 Q ${38 * headSize} -90 ${34 * headSize} -36 L 26 -38 Q 30 -68 0 -68 Q -30 -68 -26 -38 Z`,
        fill: hairColor,
      });
    } else if (app.hair.style === 'long') {
      headShapes.push({
        type: 'path',
        d: `M ${-34 * headSize} -20 Q ${-40 * headSize} -90 0 -92 Q ${40 * headSize} -90 ${34 * headSize} -20 Q 24 -30 20 -40 Q 30 -70 0 -70 Q -30 -70 -20 -40 Q -24 -30 ${-34 * headSize} -20 Z`,
        fill: hairColor,
      });
    } else if (app.hair.style === 'ponytail') {
      headShapes.push(
        {
          type: 'path',
          d: `M ${-34 * headSize} -60 Q -36 -90 0 -92 Q 36 -90 ${34 * headSize} -60 Q 24 -70 12 -72 Q 0 -66 -10 -72 Q -24 -70 ${-34 * headSize} -60 Z`,
          fill: hairColor,
        },
        {
          type: 'path',
          d: 'M 18 -88 Q 42 -105 48 -78 Q 40 -64 26 -76 Z',
          fill: hairColor,
        },
        { type: 'circle', cx: 22, cy: -82, r: 4, fill: '#ec4899' }
      );
    }
  }

  // Eyes (Issue 1: genuinely distinct eye styles)
  const eyeR = (isPlanet ? 6 : 5) * eyeSize;
  const eyeY = isPlanet ? baseHeadY - 4 : baseHeadY;
  const leftEyeX = (isPlanet ? -15 : -12) * headSize;
  const rightEyeX = (isPlanet ? 15 : 12) * headSize;
  const eyeStartIdx = headShapes.length;

  if (app.eyes.style === 'dot') {
    headShapes.push(
      { type: 'circle', cx: leftEyeX, cy: eyeY, r: 3.2 * eyeSize, fill: eyeColor },
      { type: 'circle', cx: rightEyeX, cy: eyeY, r: 3.2 * eyeSize, fill: eyeColor }
    );
  } else if (app.eyes.style === 'happy') {
    headShapes.push(
      {
        type: 'path',
        d: `M ${leftEyeX - 6} ${eyeY + 2} Q ${leftEyeX} ${eyeY - 6} ${leftEyeX + 6} ${eyeY + 2}`,
        stroke: eyeColor,
        strokeWidth: 3,
        strokeLinecap: 'round',
        fill: 'none',
      },
      {
        type: 'path',
        d: `M ${rightEyeX - 6} ${eyeY + 2} Q ${rightEyeX} ${eyeY - 6} ${rightEyeX + 6} ${eyeY + 2}`,
        stroke: eyeColor,
        strokeWidth: 3,
        strokeLinecap: 'round',
        fill: 'none',
      }
    );
  } else if (app.eyes.style === 'sleepy') {
    // Half-closed relaxed eyelid with resting pupil
    headShapes.push(
      {
        type: 'path',
        d: `M ${leftEyeX - 6} ${eyeY - 1} Q ${leftEyeX} ${eyeY + 5} ${leftEyeX + 6} ${eyeY - 1}`,
        stroke: eyeColor,
        strokeWidth: 3,
        strokeLinecap: 'round',
        fill: 'none',
      },
      { type: 'circle', cx: leftEyeX, cy: eyeY + 1, r: eyeR * 0.65, fill: eyeColor },
      {
        type: 'path',
        d: `M ${rightEyeX - 6} ${eyeY - 1} Q ${rightEyeX} ${eyeY + 5} ${rightEyeX + 6} ${eyeY - 1}`,
        stroke: eyeColor,
        strokeWidth: 3,
        strokeLinecap: 'round',
        fill: 'none',
      },
      { type: 'circle', cx: rightEyeX, cy: eyeY + 1, r: eyeR * 0.65, fill: eyeColor }
    );
  } else if (app.eyes.style === 'anime') {
    // Distinct anime eye geometry: tall iris, inner dark pupil, dual sparkle speculars, bold top eyelash
    headShapes.push(
      { type: 'ellipse', cx: leftEyeX, cy: eyeY, rx: eyeR * 1.35, ry: eyeR * 1.7, fill: eyeColor },
      { type: 'ellipse', cx: leftEyeX, cy: eyeY + 1.2, rx: eyeR * 0.8, ry: eyeR * 1.05, fill: '#0a0f1d' },
      { type: 'circle', cx: leftEyeX - 2.2, cy: eyeY - 3, r: eyeR * 0.45, fill: '#ffffff' },
      { type: 'circle', cx: leftEyeX + 2.4, cy: eyeY + 2.8, r: eyeR * 0.25, fill: '#ffffff' },
      {
        type: 'path',
        d: `M ${leftEyeX - 7} ${eyeY - 4.5} Q ${leftEyeX} ${eyeY - 10} ${leftEyeX + 7} ${eyeY - 4.5}`,
        stroke: '#0f172a',
        strokeWidth: 2.6,
        strokeLinecap: 'round',
        fill: 'none',
      },

      { type: 'ellipse', cx: rightEyeX, cy: eyeY, rx: eyeR * 1.35, ry: eyeR * 1.7, fill: eyeColor },
      { type: 'ellipse', cx: rightEyeX, cy: eyeY + 1.2, rx: eyeR * 0.8, ry: eyeR * 1.05, fill: '#0a0f1d' },
      { type: 'circle', cx: rightEyeX - 2.2, cy: eyeY - 3, r: eyeR * 0.45, fill: '#ffffff' },
      { type: 'circle', cx: rightEyeX + 2.4, cy: eyeY + 2.8, r: eyeR * 0.25, fill: '#ffffff' },
      {
        type: 'path',
        d: `M ${rightEyeX - 7} ${eyeY - 4.5} Q ${rightEyeX} ${eyeY - 10} ${rightEyeX + 7} ${eyeY - 4.5}`,
        stroke: '#0f172a',
        strokeWidth: 2.6,
        strokeLinecap: 'round',
        fill: 'none',
      }
    );
  } else {
    // Round standard cartoon eye
    headShapes.push(
      { type: 'circle', cx: leftEyeX, cy: eyeY, r: eyeR, fill: eyeColor },
      { type: 'circle', cx: leftEyeX - 1.5, cy: eyeY - 2, r: eyeR * 0.4, fill: '#ffffff' },
      { type: 'circle', cx: rightEyeX, cy: eyeY, r: eyeR, fill: eyeColor },
      { type: 'circle', cx: rightEyeX - 1.5, cy: eyeY - 2, r: eyeR * 0.4, fill: '#ffffff' }
    );
  }
  for (let i = eyeStartIdx; i < headShapes.length; i++) {
    headShapes[i].tag = 'eyes';
  }

  // Eyebrows (Issue 1: distinct eyebrow styles)
  const browStartIdx = headShapes.length;
  const browY = isPlanet ? baseHeadY - 15 * headSize : baseHeadY - 10 * headSize;
  const browColor = app.eyebrows.color || hairColor;

  if (app.eyebrows.style === 'flat') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 6} ${browY} L ${leftEyeX + 6} ${browY}`, stroke: browColor, strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 6} ${browY} L ${rightEyeX + 6} ${browY}`, stroke: browColor, strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none' }
    );
  } else if (app.eyebrows.style === 'bushy') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 7} ${browY + 1} Q ${leftEyeX} ${browY - 4} ${leftEyeX + 7} ${browY}`, stroke: browColor, strokeWidth: 5.0, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 7} ${browY} Q ${rightEyeX} ${browY - 4} ${rightEyeX + 7} ${browY + 1}`, stroke: browColor, strokeWidth: 5.0, strokeLinecap: 'round', fill: 'none' }
    );
  } else if (app.eyebrows.style === 'arched') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 7} ${browY + 2} Q ${leftEyeX - 1} ${browY - 6} ${leftEyeX + 6} ${browY + 1}`, stroke: browColor, strokeWidth: 2.4, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 6} ${browY + 1} Q ${rightEyeX + 1} ${browY - 6} ${rightEyeX + 7} ${browY + 2}`, stroke: browColor, strokeWidth: 2.4, strokeLinecap: 'round', fill: 'none' }
    );
  } else {
    // Curved
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 6} ${browY} Q ${leftEyeX} ${browY - 3} ${leftEyeX + 6} ${browY}`, stroke: browColor, strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 6} ${browY} Q ${rightEyeX} ${browY - 3} ${rightEyeX + 6} ${browY}`, stroke: browColor, strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none' }
    );
  }
  for (let i = browStartIdx; i < headShapes.length; i++) {
    headShapes[i].tag = 'eyebrows';
  }

  // Nose (Issue 1: distinct nose styles including oval and button)
  const noseStartIdx = headShapes.length;
  const noseY = isPlanet ? baseHeadY + 4 : baseHeadY + 6;
  const noseColor = app.nose.color || '#d97706';

  if (app.nose.style === 'bear_snout') {
    headShapes.push({
      type: 'path',
      d: `M -6 ${baseHeadY + 4} Q 0 ${baseHeadY} 6 ${baseHeadY + 4} Q 0 ${baseHeadY + 10} -6 ${baseHeadY + 4} Z`,
      fill: app.nose.color || '#1e293b',
    });
  } else if (app.nose.style === 'triangle') {
    headShapes.push({
      type: 'path',
      d: `M -3.5 ${noseY + 2.5} L 0 ${noseY - 3.5} L 3.5 ${noseY + 2.5} Z`,
      fill: noseColor,
    });
  } else if (app.nose.style === 'oval') {
    // Distinct vertical ellipse nose
    headShapes.push({
      type: 'ellipse',
      cx: 0,
      cy: noseY,
      rx: 2.2 * (app.nose.size || 1.0),
      ry: 4.4 * (app.nose.size || 1.0),
      fill: noseColor,
    });
  } else if (app.nose.style === 'dot') {
    headShapes.push({
      type: 'circle',
      cx: 0,
      cy: noseY,
      r: 1.8 * (app.nose.size || 1.0),
      fill: noseColor,
    });
  } else {
    // Button: rounded circle with nostril curve
    headShapes.push(
      {
        type: 'circle',
        cx: 0,
        cy: noseY,
        r: 3.2 * (app.nose.size || 1.0),
        fill: noseColor,
      },
      {
        type: 'path',
        d: `M -2 ${noseY + 1.5} Q 0 ${noseY + 3.5} 2 ${noseY + 1.5}`,
        stroke: '#78350f',
        strokeWidth: 1.2,
        fill: 'none',
      }
    );
  }
  for (let i = noseStartIdx; i < headShapes.length; i++) {
    headShapes[i].tag = 'nose';
  }

  // Mouth (Issue 1: distinct mouth expressions)
  const mouthStartIdx = headShapes.length;
  const mouthY = isPlanet ? baseHeadY + 14 : baseHeadY + 16;
  const mouthColor = app.mouth.color || '#b91c1c';

  if (app.mouth.style === 'open_grin') {
    headShapes.push(
      {
        type: 'path',
        d: `M -9 ${mouthY} Q 0 ${mouthY + 12} 9 ${mouthY} Z`,
        fill: '#991b1b',
      },
      {
        type: 'path',
        d: `M -7 ${mouthY} Q 0 ${mouthY + 4} 7 ${mouthY} L 6 ${mouthY + 3} Q 0 ${mouthY + 5} -6 ${mouthY + 3} Z`,
        fill: '#ffffff',
      }
    );
  } else if (app.mouth.style === 'laugh') {
    headShapes.push(
      {
        type: 'path',
        d: `M -11 ${mouthY} Q 0 ${mouthY + 16} 11 ${mouthY} Z`,
        fill: '#991b1b',
      },
      {
        type: 'path',
        d: `M -6 ${mouthY + 8} Q 0 ${mouthY + 16} 6 ${mouthY + 8} Z`,
        fill: '#f87171',
      }
    );
  } else if (app.mouth.style === 'surprised') {
    headShapes.push({
      type: 'circle',
      cx: 0,
      cy: mouthY + 2,
      r: 4.5,
      fill: '#991b1b',
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
    // Smile curve
    headShapes.push({
      type: 'path',
      d: `M -8 ${mouthY} Q 0 ${mouthY + 8} 8 ${mouthY}`,
      stroke: mouthColor,
      strokeWidth: 2.8,
      strokeLinecap: 'round',
      fill: 'none',
    });
  }
  for (let i = mouthStartIdx; i < headShapes.length; i++) {
    headShapes[i].tag = 'mouth';
  }

  // Accessories: Blush & Freckles & Hats
  if (isPlanet) {
    if (app.accessories?.blush !== false) {
      headShapes.push(
        { type: 'ellipse', cx: -24 * headSize, cy: baseHeadY + 5, rx: 7, ry: 4.5, fill: '#f43f5e', opacity: 0.45, tag: 'face_base' },
        { type: 'ellipse', cx: 24 * headSize, cy: baseHeadY + 5, rx: 7, ry: 4.5, fill: '#f43f5e', opacity: 0.45, tag: 'face_base' }
      );
    }
  } else {
    if (app.accessories?.blush !== false) {
      headShapes.push(
        { type: 'ellipse', cx: -22 * headSize, cy: baseHeadY + 8, rx: 6, ry: 4, fill: '#f87171', opacity: 0.45 },
        { type: 'ellipse', cx: 22 * headSize, cy: baseHeadY + 8, rx: 6, ry: 4, fill: '#f87171', opacity: 0.45 }
      );
    }
    if (app.accessories?.freckles === true) {
      headShapes.push(
        { type: 'circle', cx: -20 * headSize, cy: baseHeadY + 6, r: 1.2, fill: '#b45309' },
        { type: 'circle', cx: -17 * headSize, cy: baseHeadY + 8, r: 1.2, fill: '#b45309' },
        { type: 'circle', cx: -22 * headSize, cy: baseHeadY + 9, r: 1.1, fill: '#b45309' },
        { type: 'circle', cx: 20 * headSize, cy: baseHeadY + 6, r: 1.2, fill: '#b45309' },
        { type: 'circle', cx: 17 * headSize, cy: baseHeadY + 8, r: 1.2, fill: '#b45309' },
        { type: 'circle', cx: 22 * headSize, cy: baseHeadY + 9, r: 1.1, fill: '#b45309' }
      );
    }

    // Accessories: Glasses
    if (app.accessories?.glasses === 'round') {
      const gc = app.accessories.glassesColor || '#0f172a';
      headShapes.push(
        { type: 'circle', cx: leftEyeX, cy: eyeY, r: eyeR + 4, fill: 'none', stroke: gc, strokeWidth: 2.5 },
        { type: 'circle', cx: rightEyeX, cy: eyeY, r: eyeR + 4, fill: 'none', stroke: gc, strokeWidth: 2.5 },
        { type: 'path', d: `M ${leftEyeX + eyeR + 4} ${eyeY} L ${rightEyeX - eyeR - 4} ${eyeY}`, stroke: gc, strokeWidth: 2.5 }
      );
    } else if (app.accessories?.glasses === 'square') {
      const gc = app.accessories.glassesColor || '#0f172a';
      headShapes.push(
        { type: 'rect', x: leftEyeX - 10, y: eyeY - 8, width: 20, height: 16, rx: 3, fill: 'none', stroke: gc, strokeWidth: 2.5 },
        { type: 'rect', x: rightEyeX - 10, y: eyeY - 8, width: 20, height: 16, rx: 3, fill: 'none', stroke: gc, strokeWidth: 2.5 },
        { type: 'path', d: `M ${leftEyeX + 10} ${eyeY} L ${rightEyeX - 10} ${eyeY}`, stroke: gc, strokeWidth: 2.5 }
      );
    }

    // Accessories: Hat
    if (app.accessories?.hat === 'cap') {
      const hc = app.accessories.hatColor || '#2563eb';
      headShapes.push(
        {
          type: 'path',
          d: `M ${-32 * headSize} ${baseHeadY - 14} Q 0 ${baseHeadY - 36} ${32 * headSize} ${baseHeadY - 14} Z`,
          fill: hc,
        },
        {
          type: 'path',
          d: `M ${-10 * headSize} ${baseHeadY - 14} Q ${28 * headSize} ${baseHeadY - 12} ${42 * headSize} ${baseHeadY - 8} Q ${24 * headSize} ${baseHeadY - 2} ${-4 * headSize} ${baseHeadY - 12} Z`,
          fill: hc,
        }
      );
    } else if (app.accessories?.hat === 'beanie') {
      const hc = app.accessories.hatColor || '#ef4444';
      headShapes.push(
        {
          type: 'path',
          d: `M ${-32 * headSize} ${baseHeadY - 12} Q 0 ${baseHeadY - 38} ${32 * headSize} ${baseHeadY - 12} Z`,
          fill: hc,
        },
        {
          type: 'rect',
          x: -32 * headSize,
          y: baseHeadY - 14,
          width: 64 * headSize,
          height: 6,
          rx: 2,
          fill: '#f8fafc',
        },
        { type: 'circle', cx: 0, cy: baseHeadY - 37, r: 6.5, fill: '#f8fafc' }
      );
    }
  }

  // -------------------------------------------------------------------------
  // 2. TORSO & NECK SHAPES
  // -------------------------------------------------------------------------
  const torsoShapes: VectorPartShape[] = [];
  const halfW = 28 * torsoWidth;
  const bottomY = 42 * torsoHeight;

  // Neck
  const neckTopY = headChinY - 4;
  const neckBottomY = 4;
  torsoShapes.push({
    type: 'rect',
    x: -neckW / 2,
    y: neckTopY,
    width: neckW,
    height: neckBottomY - neckTopY,
    fill: skin,
  });

  // Neck accessories
  if (neckStyle === 'band') {
    const bandY = headChinY + 2;
    torsoShapes.push(
      {
        type: 'rect',
        x: -neckW / 2 - 2,
        y: bandY,
        width: neckW + 4,
        height: 6,
        fill: neckColor === skin ? '#0f172a' : neckColor,
        rx: 1,
      },
      {
        type: 'circle',
        cx: 0,
        cy: bandY + 3,
        r: 2.5,
        fill: '#f59e0b',
      }
    );
  } else if (neckStyle === 'scarf') {
    const scarfColor = neckColor === skin ? '#ef4444' : neckColor;
    const bandY = headChinY + 1;
    torsoShapes.push(
      {
        type: 'path',
        d: `M ${-neckW / 2 - 3} ${bandY} Q 0 ${bandY + 8} ${neckW / 2 + 3} ${bandY} L ${neckW / 2 + 2} ${bandY + 9} Q 0 ${bandY + 14} ${-neckW / 2 - 2} ${bandY + 9} Z`,
        fill: scarfColor,
      },
      {
        type: 'path',
        d: `M -2 ${bandY + 7} L -6 ${bandY + 20} L 2 ${bandY + 16} Z`,
        fill: scarfColor,
      },
      {
        type: 'path',
        d: `M 1 ${bandY + 7} L 6 ${bandY + 19} L 0 ${bandY + 15} Z`,
        fill: scarfColor,
      }
    );
  }

  // Main Clothing / Torso body
  if (app.torso.clothingStyle === 'dress') {
    torsoShapes.push({
      type: 'path',
      d: `M ${-halfW} 0 Q 0 -8 ${halfW} 0 L ${halfW + 14} ${bottomY + 18} Q 0 ${bottomY + 24} ${-halfW - 14} ${bottomY + 18} Z`,
      fill: shirtColor,
    });
  } else if (app.torso.clothingStyle === 'vest') {
    torsoShapes.push(
      {
        type: 'path',
        d: `M ${-halfW} 0 Q 0 -8 ${halfW} 0 L ${halfW - 2} ${bottomY} Q 0 ${bottomY + 4} ${-halfW + 2} ${bottomY} Z`,
        fill: '#f8fafc',
      },
      {
        type: 'path',
        d: `M ${-halfW} 0 L ${-halfW * 0.4} 18 L ${-halfW * 0.2} ${bottomY} L ${-halfW + 2} ${bottomY} Z`,
        fill: shirtColor,
      },
      {
        type: 'path',
        d: `M ${halfW} 0 L ${halfW * 0.4} 18 L ${halfW * 0.2} ${bottomY} L ${halfW - 2} ${bottomY} Z`,
        fill: shirtColor,
      }
    );
  } else if (app.torso.clothingStyle === 'collared') {
    torsoShapes.push(
      {
        type: 'path',
        d: `M ${-halfW} 0 Q 0 -8 ${halfW} 0 L ${halfW - 2} ${bottomY} Q 0 ${bottomY + 4} ${-halfW + 2} ${bottomY} Z`,
        fill: shirtColor,
      },
      {
        type: 'path',
        d: `M -14 0 L -6 12 L 0 3 L 6 12 L 14 0 Z`,
        fill: collarColor,
      }
    );
  } else {
    // T-shirt / Hoodie / Standard
    torsoShapes.push({
      type: 'path',
      d: `M ${-halfW} 0 Q 0 -8 ${halfW} 0 L ${halfW - 2} ${bottomY} Q 0 ${bottomY + 4} ${-halfW + 2} ${bottomY} Z`,
      fill: shirtColor,
    });
  }

  // Collar stripe / hoodie pouch
  if (app.torso.clothingStyle === 'hoodie') {
    torsoShapes.push({
      type: 'path',
      d: `M -14 20 L 14 20 L 18 36 L -18 36 Z`,
      fill: collarColor,
      opacity: 0.9,
    });
  } else if (app.torso.clothingStyle !== 'vest' && app.torso.clothingStyle !== 'collared') {
    torsoShapes.push({
      type: 'path',
      d: 'M -14 0 Q 0 8 14 0',
      stroke: collarColor,
      strokeWidth: 3.5,
      strokeLinecap: 'round',
      fill: 'none',
    });
  }

  // Chest Pattern/Emblem
  if (app.torso.pattern === 'star') {
    torsoShapes.push({
      type: 'circle',
      cx: 0,
      cy: 18,
      r: 7,
      fill: '#ef4444',
    });
  } else if (app.torso.pattern === 'circle') {
    torsoShapes.push({
      type: 'circle',
      cx: 0,
      cy: 18,
      r: 6,
      fill: '#fde047',
    });
  } else if (app.torso.pattern === 'stripe') {
    torsoShapes.push(
      { type: 'rect', x: -halfW + 2, y: 14, width: halfW * 2 - 4, height: 4, fill: collarColor },
      { type: 'rect', x: -halfW + 2, y: 26, width: halfW * 2 - 4, height: 4, fill: collarColor }
    );
  }

  // Belt / Waistband
  torsoShapes.push({
    type: 'rect',
    x: -halfW + 4,
    y: bottomY,
    width: halfW * 2 - 8,
    height: 10,
    fill: app.leftLeg?.pantsColor || app.legs.pantsColor || '#1e3a8a',
  });

  // -------------------------------------------------------------------------
  // 3. CONNECTED JOINT HIERARCHY: ARMS & FOREARMS (Issue 2)
  // -------------------------------------------------------------------------
  const armPivotX = 28 * torsoWidth;

  // Left Arm config
  const lArm = app.leftArm!;
  const leftShoulderX = -armPivotX + (lArm.shoulderOffset?.x ?? 0);
  const leftShoulderY = -4 + (lArm.shoulderOffset?.y ?? 0);
  const leftUpperArmLen = 14 * (lArm.upperArmLength ?? 1.0);
  const leftUpperArmThick = lArm.upperArmThickness ?? 1.0;
  const leftForearmLen = 16 * (lArm.forearmLength ?? 1.0);
  const leftForearmThick = lArm.forearmThickness ?? 1.0;
  const leftHandSize = lArm.handSize ?? 1.0;
  const leftHandShape = lArm.handShape ?? 'simple';
  const leftArmSkin = lArm.skinColor ?? skin;
  const leftSleeve = lArm.sleeveStyle ?? 'short';

  // Left Elbow (connected child of shoulder)
  const leftElbowX = leftShoulderX - 6 + (lArm.elbowOffset?.x ?? 0);
  const leftElbowY = leftShoulderY + leftUpperArmLen + (lArm.elbowOffset?.y ?? 0);

  // Right Arm config
  const rArm = app.rightArm!;
  const rightShoulderX = armPivotX + (rArm.shoulderOffset?.x ?? 0);
  const rightShoulderY = -4 + (rArm.shoulderOffset?.y ?? 0);
  const rightUpperArmLen = 14 * (rArm.upperArmLength ?? 1.0);
  const rightUpperArmThick = rArm.upperArmThickness ?? 1.0;
  const rightForearmLen = 16 * (rArm.forearmLength ?? 1.0);
  const rightForearmThick = rArm.forearmThickness ?? 1.0;
  const rightHandSize = rArm.handSize ?? 1.0;
  const rightHandShape = rArm.handShape ?? 'simple';
  const rightArmSkin = rArm.skinColor ?? skin;
  const rightSleeve = rArm.sleeveStyle ?? 'short';

  // Right Elbow (connected child of shoulder)
  const rightElbowX = rightShoulderX + 6 + (rArm.elbowOffset?.x ?? 0);
  const rightElbowY = rightShoulderY + rightUpperArmLen + (rArm.elbowOffset?.y ?? 0);

  // Helper for drawing hand geometry
  const buildHandShapes = (cx: number, cy: number, size: number, shape: 'simple' | 'mitten' | 'paw', handSkin: string): VectorPartShape[] => {
    if (shape === 'paw') {
      return [
        { type: 'circle', cx, cy, r: 6.5 * size, fill: handSkin },
        { type: 'circle', cx: cx - 3.5 * size, cy: cy - 4.5 * size, r: 2.2 * size, fill: '#fef3c7' },
        { type: 'circle', cx, cy: cy - 6 * size, r: 2.4 * size, fill: '#fef3c7' },
        { type: 'circle', cx: cx + 3.5 * size, cy: cy - 4.5 * size, r: 2.2 * size, fill: '#fef3c7' },
      ];
    } else if (shape === 'mitten') {
      return [
        { type: 'ellipse', cx, cy, rx: 6 * size, ry: 7.5 * size, fill: handSkin },
        { type: 'ellipse', cx: cx - 4 * size, cy: cy - 2 * size, rx: 2.8 * size, ry: 4 * size, fill: handSkin },
      ];
    }
    // simple
    return [
      { type: 'circle', cx, cy, r: 6 * size, fill: handSkin },
    ];
  };

  // Build Left Arm (Upper Arm)
  const leftArmShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${leftShoulderX} ${leftShoulderY} Q ${leftShoulderX - 12 * leftUpperArmThick} ${leftShoulderY + leftUpperArmLen * 0.5} ${leftElbowX} ${leftElbowY} L ${leftElbowX + 6 * leftUpperArmThick} ${leftElbowY} Q ${leftShoulderX + 4} ${leftShoulderY + leftUpperArmLen * 0.4} ${leftShoulderX + 3} ${leftShoulderY} Z`,
      fill: leftArmSkin,
    },
  ];
  if (leftSleeve !== 'sleeveless') {
    leftArmShapes.push({
      type: 'path',
      d: `M ${leftShoulderX} ${leftShoulderY} Q ${leftShoulderX - 10 * leftUpperArmThick} ${leftShoulderY + 6} ${leftShoulderX - 4 * leftUpperArmThick} ${leftShoulderY + 12} L ${leftShoulderX + 6} ${leftShoulderY + 8} Z`,
      fill: shirtColor,
    });
  }

  // Build Left Forearm & Hand (Articulated from Left Elbow)
  const leftForearmShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${leftElbowX} ${leftElbowY} Q ${leftElbowX - 8 * leftForearmThick} ${leftElbowY + leftForearmLen * 0.6} ${leftElbowX - 2} ${leftElbowY + leftForearmLen} L ${leftElbowX + 6 * leftForearmThick} ${leftElbowY + leftForearmLen} Q ${leftElbowX + 7} ${leftElbowY + leftForearmLen * 0.4} ${leftElbowX + 6} ${leftElbowY} Z`,
      fill: leftArmSkin,
    },
    ...buildHandShapes(leftElbowX + 2, leftElbowY + leftForearmLen + 2, leftHandSize, leftHandShape, leftArmSkin),
  ];

  // Build Right Arm (Upper Arm)
  const rightArmShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${rightShoulderX} ${rightShoulderY} Q ${rightShoulderX + 12 * rightUpperArmThick} ${rightShoulderY + rightUpperArmLen * 0.5} ${rightElbowX} ${rightElbowY} L ${rightElbowX - 6 * rightUpperArmThick} ${rightElbowY} Q ${rightShoulderX - 4} ${rightShoulderY + rightUpperArmLen * 0.4} ${rightShoulderX - 3} ${rightShoulderY} Z`,
      fill: rightArmSkin,
    },
  ];
  if (rightSleeve !== 'sleeveless') {
    rightArmShapes.push({
      type: 'path',
      d: `M ${rightShoulderX} ${rightShoulderY} Q ${rightShoulderX + 10 * rightUpperArmThick} ${rightShoulderY + 6} ${rightShoulderX + 4 * rightUpperArmThick} ${rightShoulderY + 12} L ${rightShoulderX - 6} ${rightShoulderY + 8} Z`,
      fill: shirtColor,
    });
  }

  // Build Right Forearm & Hand (Articulated from Right Elbow)
  const rightForearmShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${rightElbowX} ${rightElbowY} Q ${rightElbowX + 8 * rightForearmThick} ${rightElbowY + rightForearmLen * 0.6} ${rightElbowX + 2} ${rightElbowY + rightForearmLen} L ${rightElbowX - 6 * rightForearmThick} ${rightElbowY + rightForearmLen} Q ${rightElbowX - 7} ${rightElbowY + rightForearmLen * 0.4} ${rightElbowX - 6} ${rightElbowY} Z`,
      fill: rightArmSkin,
    },
    ...buildHandShapes(rightElbowX - 2, rightElbowY + rightForearmLen + 2, rightHandSize, rightHandShape, rightArmSkin),
  ];

  // -------------------------------------------------------------------------
  // 4. CONNECTED JOINT HIERARCHY: LEGS, KNEES & FEET (Issue 2)
  // -------------------------------------------------------------------------
  const hipBaseX = 16 * (0.8 + 0.2 * torsoWidth);
  const hipBaseY = bottomY + 10;

  // Left Leg
  const lLeg = app.leftLeg!;
  const leftHipX = -hipBaseX + (lLeg.hipOffset?.x ?? 0);
  const leftHipY = hipBaseY + (lLeg.hipOffset?.y ?? 0);
  const leftUpperLegLen = 15 * (lLeg.upperLegLength ?? 1.0);
  const leftLowerLegLen = 15 * (lLeg.lowerLegLength ?? 1.0);
  const leftLegTotalH = leftUpperLegLen + leftLowerLegLen;
  const leftLegThick = lLeg.upperLegThickness ?? 1.0;
  const leftFootSize = lLeg.footSize ?? 1.0;
  const leftPantsColor = lLeg.pantsColor || '#1e3a8a';
  const leftShoeColor = lLeg.shoeColor || '#ef4444';
  const leftShoeStyle = lLeg.shoeStyle || 'sneakers';

  // Right Leg
  const rLeg = app.rightLeg!;
  const rightHipX = hipBaseX + (rLeg.hipOffset?.x ?? 0);
  const rightHipY = hipBaseY + (rLeg.hipOffset?.y ?? 0);
  const rightUpperLegLen = 15 * (rLeg.upperLegLength ?? 1.0);
  const rightLowerLegLen = 15 * (rLeg.lowerLegLength ?? 1.0);
  const rightLegTotalH = rightUpperLegLen + rightLowerLegLen;
  const rightLegThick = rLeg.upperLegThickness ?? 1.0;
  const rightFootSize = rLeg.footSize ?? 1.0;
  const rightPantsColor = rLeg.pantsColor || '#1e3a8a';
  const rightShoeColor = rLeg.shoeColor || '#ef4444';
  const rightShoeStyle = rLeg.shoeStyle || 'sneakers';

  // Helper for footwear geometry
  const buildFootwearShapes = (
    hx: number,
    hy: number,
    totalH: number,
    thick: number,
    footSize: number,
    style: 'sneakers' | 'boots' | 'shoes',
    shoeColor: string,
    isLeft: boolean
  ): VectorPartShape[] => {
    const footY = hy + totalH;
    const footW = 18 * footSize * thick;
    const footH = 10 * footSize;
    const footStartX = isLeft ? hx - footW * 0.6 : hx - footW * 0.4;

    if (style === 'boots') {
      return [
        {
          type: 'path',
          d: `M ${hx - 9 * thick} ${footY - 8} L ${hx + 9 * thick} ${footY - 8} L ${hx + 10 * thick} ${footY + footH} L ${hx - 10 * thick} ${footY + footH} Z`,
          fill: shoeColor,
        },
        {
          type: 'rect',
          x: hx - 10 * thick,
          y: footY - 10,
          width: 20 * thick,
          height: 3.5,
          rx: 1,
          fill: '#0f172a',
        },
      ];
    } else if (style === 'sneakers') {
      return [
        {
          type: 'path',
          d: `M ${footStartX} ${footY} Q ${hx} ${footY - 4} ${footStartX + footW} ${footY} L ${footStartX + footW} ${footY + footH} L ${footStartX} ${footY + footH} Z`,
          fill: shoeColor,
        },
        // White sneaker rubber sole
        {
          type: 'rect',
          x: footStartX - 1,
          y: footY + footH - 3,
          width: footW + 2,
          height: 3.5,
          rx: 1,
          fill: '#ffffff',
        },
        // White lace accent
        {
          type: 'path',
          d: `M ${hx - 3} ${footY + 2} L ${hx + 3} ${footY + 2}`,
          stroke: '#ffffff',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          fill: 'none',
        },
      ];
    }
    // classic shoes
    return [
      {
        type: 'path',
        d: `M ${footStartX} ${footY} Q ${hx} ${footY - 3} ${footStartX + footW} ${footY} Q ${footStartX + footW + 2} ${footY + footH} ${hx} ${footY + footH} Q ${footStartX - 2} ${footY + footH} ${footStartX} ${footY} Z`,
        fill: shoeColor,
      },
    ];
  };

  // Build Left Leg shapes
  const leftLegShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${leftHipX - 8 * leftLegThick} ${leftHipY} L ${leftHipX - 5 * leftLegThick} ${leftHipY + leftLegTotalH} L ${leftHipX + 7 * leftLegThick} ${leftHipY + leftLegTotalH} L ${leftHipX + 8 * leftLegThick} ${leftHipY} Z`,
      fill: leftPantsColor,
    },
    ...buildFootwearShapes(leftHipX, leftHipY, leftLegTotalH, leftLegThick, leftFootSize, leftShoeStyle, leftShoeColor, true),
  ];

  // Build Right Leg shapes
  const rightLegShapes: VectorPartShape[] = [
    {
      type: 'path',
      d: `M ${rightHipX - 8 * rightLegThick} ${rightHipY} L ${rightHipX - 5 * rightLegThick} ${rightHipY + rightLegTotalH} L ${rightHipX + 7 * rightLegThick} ${rightHipY + rightLegTotalH} L ${rightHipX + 8 * rightLegThick} ${rightHipY} Z`,
      fill: rightPantsColor,
    },
    ...buildFootwearShapes(rightHipX, rightHipY, rightLegTotalH, rightLegThick, rightFootSize, rightShoeStyle, rightShoeColor, false),
  ];

  // -------------------------------------------------------------------------
  // 5. ASSEMBLE RIG DEFINITION (Issue 2 connected joints)
  // -------------------------------------------------------------------------
  const finalTorsoShapes: VectorPartShape[] = isPlanet ? [] : torsoShapes;
  const finalLeftLegShapes: VectorPartShape[] = isPlanet ? [] : leftLegShapes;
  const finalRightLegShapes: VectorPartShape[] = isPlanet ? [] : rightLegShapes;
  const finalLeftArmShapes: VectorPartShape[] = isPlanet
    ? [
        { type: 'circle' as const, cx: -54, cy: baseHeadY + 8, r: 9, fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1.5 },
        { type: 'ellipse' as const, cx: -60, cy: baseHeadY + 4, rx: 4, ry: 3, fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1.2 },
      ]
    : leftArmShapes;
  const finalRightArmShapes: VectorPartShape[] = isPlanet
    ? [
        { type: 'circle' as const, cx: 54, cy: baseHeadY + 8, r: 9, fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1.5 },
        { type: 'ellipse' as const, cx: 60, cy: baseHeadY + 4, rx: 4, ry: 3, fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1.2 },
      ]
    : rightArmShapes;
  const finalLeftForearmShapes: VectorPartShape[] = isPlanet ? [] : leftForearmShapes;
  const finalRightForearmShapes: VectorPartShape[] = isPlanet ? [] : rightForearmShapes;

  return {
    id: `custom-rig-${id}`,
    name,
    species: app.species || 'Human',
    viewBox: '-100 -160 200 240',
    baseWidth: isPlanet ? 160 : 150 * torsoWidth,
    baseHeight: isPlanet ? 200 : 220,
    parts: {
      torso: {
        id: 'torso',
        label: 'Torso',
        pivot: { x: 0, y: isPlanet ? 0 : 15 },
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
        label: isPlanet ? 'Left Arm & Glove' : 'Left Upper Arm',
        pivot: { x: isPlanet ? -50 : leftShoulderX, y: isPlanet ? baseHeadY + 5 : leftShoulderY },
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
        label: isPlanet ? 'Right Arm & Glove' : 'Right Upper Arm',
        pivot: { x: isPlanet ? 50 : rightShoulderX, y: isPlanet ? baseHeadY + 5 : rightShoulderY },
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
        pivot: { x: isPlanet ? 0 : leftHipX, y: isPlanet ? 0 : leftHipY },
        zIndex: 1,
        shapes: finalLeftLegShapes,
      },
      rightLeg: {
        id: 'rightLeg',
        label: 'Right Leg',
        pivot: { x: isPlanet ? 0 : rightHipX, y: isPlanet ? 0 : rightHipY },
        zIndex: 1,
        shapes: finalRightLegShapes,
      },
    },
  };
}
