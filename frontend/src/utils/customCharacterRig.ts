import {
  CustomCharacterAppearance,
  VectorRigDefinition,
  VectorPartShape,
  VectorRigPart,
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
};

/**
 * Builds a valid, articulated VectorRigDefinition from a customizable appearance model.
 */
export function buildRigFromAppearance(
  id: string,
  name: string,
  app: CustomCharacterAppearance
): VectorRigDefinition {
  const headSize = app.head.size || 1.0;
  const skin = app.head.skinColor || '#fed7aa';
  const hairColor = app.hair.color || '#78350f';
  const eyeColor = app.eyes.color || '#0f172a';
  const eyeSize = app.eyes.size || 1.0;

  const torsoWidth = app.torso.width || 1.0;
  const torsoHeight = app.torso.height || 1.0;
  const shirtColor = app.torso.shirtColor || '#3b82f6';
  const collarColor = app.torso.collarColor || '#93c5fd';

  const armLen = app.arms.length || 1.0;
  const armThick = app.arms.thickness || 1.0;
  const armSkin = app.arms.skinColor || skin;

  const legLen = app.legs.length || 1.0;
  const legThick = app.legs.thickness || 1.0;
  const pantsColor = app.legs.pantsColor || '#1e3a8a';
  const shoeColor = app.legs.shoeColor || '#ef4444';

  // -------------------------------------------------------------------------
  // 1. HEAD & NECK PROPORTIONS
  // -------------------------------------------------------------------------
  const neckLength = app.neck?.length || 'normal';
  const neckThickness = app.neck?.thickness || 'normal';
  const neckStyle = app.neck?.style || 'plain';
  const neckColor = app.neck?.color || skin;

  const neckWMult = neckThickness === 'slim' ? 18 : neckThickness === 'wide' ? 30 : 24;
  const neckW = neckWMult * Math.max(0.8, Math.min(1.2, torsoWidth));

  // Head vertical position based on neck length
  const headYOffset = neckLength === 'short' || neckStyle === 'chibi' ? 8 : neckLength === 'long' ? -4 : 0;
  const baseHeadY = -54 + headYOffset;

  const headShapes: VectorPartShape[] = [];

  // Ears
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
  } else if (app.ears.style === 'human') {
    headShapes.push(
      { type: 'ellipse', cx: -31 * headSize, cy: earY, rx: earRx, ry: earRy, fill: skin },
      { type: 'ellipse', cx: 31 * headSize, cy: earY, rx: earRx, ry: earRy, fill: skin }
    );
  } else if (app.ears.style === 'elf') {
    headShapes.push(
      { type: 'path', d: `M ${-25 * headSize} ${earY - 7} L ${-42 * headSize} ${earY - 2} L ${-27 * headSize} ${earY + 8} Z`, fill: skin },
      { type: 'path', d: `M ${25 * headSize} ${earY - 7} L ${42 * headSize} ${earY - 2} L ${27 * headSize} ${earY + 8} Z`, fill: skin }
    );
  } else {
    headShapes.push(
      { type: 'circle', cx: -31 * headSize, cy: earY, r: 6 * (app.ears.size || 1), fill: skin },
      { type: 'circle', cx: 31 * headSize, cy: earY, r: 6 * (app.ears.size || 1), fill: skin }
    );
  }

  // Head Base
  const headRx = 30 * headSize;
  const headRy = 28 * headSize;
  const headChinY = baseHeadY + headRy;

  if (app.head.shape === 'square') {
    headShapes.push({
      type: 'rect', x: -headRx, y: baseHeadY - headRy,
      width: headRx * 2, height: headRy * 2, fill: skin,
    });
  } else if (app.head.shape === 'oval') {
    headShapes.push({
      type: 'ellipse', cx: 0, cy: baseHeadY,
      rx: headRx * 0.88, ry: headRy * 1.15, fill: skin,
    });
  } else if (app.head.shape === 'heart') {
    headShapes.push({
      type: 'path',
      d: `M 0 ${baseHeadY + headRy * 0.95} C ${-headRx * 0.12} ${baseHeadY + headRy * 0.75} ${-headRx} ${baseHeadY + headRy * 0.25} ${-headRx} ${baseHeadY - headRy * 0.15} C ${-headRx} ${baseHeadY - headRy * 0.9} ${-headRx * 0.18} ${baseHeadY - headRy} 0 ${baseHeadY - headRy * 0.55} C ${headRx * 0.18} ${baseHeadY - headRy} ${headRx} ${baseHeadY - headRy * 0.9} ${headRx} ${baseHeadY - headRy * 0.15} C ${headRx} ${baseHeadY + headRy * 0.25} ${headRx * 0.12} ${baseHeadY + headRy * 0.75} 0 ${baseHeadY + headRy * 0.95} Z`,
      fill: skin,
    });
  } else {
    headShapes.push({
      type: 'ellipse', cx: 0, cy: baseHeadY, rx: headRx, ry: headRy, fill: skin,
    });
  }

  // Snout (for bear / animal)
  if (app.species === 'bear' || app.nose.style === 'bear_snout') {
    headShapes.push({
      type: 'ellipse',
      cx: 0,
      cy: baseHeadY + 9,
      rx: 18 * headSize,
      ry: 13 * headSize,
      fill: '#fef3c7',
    });
  }

  // Hair Back/Main
  if (app.hair.style === 'bear_ears') {
    headShapes.push(
      { type: 'circle', cx: -23 * headSize, cy: baseHeadY - 24 * headSize, r: 11 * headSize, fill: hairColor },
      { type: 'circle', cx: 23 * headSize, cy: baseHeadY - 24 * headSize, r: 11 * headSize, fill: hairColor },
      { type: 'circle', cx: -23 * headSize, cy: baseHeadY - 24 * headSize, r: 5.5 * headSize, fill: '#fef3c7' },
      { type: 'circle', cx: 23 * headSize, cy: baseHeadY - 24 * headSize, r: 5.5 * headSize, fill: '#fef3c7' }
    );
  } else if (app.hair.style === 'short') {
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
    headShapes.push(
      {
        type: 'path',
        d: `M ${-34 * headSize} -20 Q ${-40 * headSize} -90 0 -92 Q ${40 * headSize} -90 ${34 * headSize} -20 Q 24 -30 20 -40 Q 30 -70 0 -70 Q -30 -70 -20 -40 Q -24 -30 ${-34 * headSize} -20 Z`,
        fill: hairColor,
      }
    );
  } else if (app.hair.style === 'ponytail') {
    headShapes.push(
      {
        type: 'path',
        d: `M ${-34 * headSize} -60 Q -36 -90 0 -92 Q 36 -90 ${34 * headSize} -60 Q 24 -70 12 -72 Q 0 -66 -10 -72 Q -24 -70 ${-34 * headSize} -60 Z`,
        fill: hairColor,
      },
      // High ponytail bundle
      {
        type: 'path',
        d: 'M 18 -88 Q 42 -105 48 -78 Q 40 -64 26 -76 Z',
        fill: hairColor,
      },
      { type: 'circle', cx: 22, cy: -82, r: 4, fill: '#ec4899' } // hair tie
    );
  }

  // Eyes
  const eyeR = 5 * eyeSize;
  const eyeY = baseHeadY;
  const leftEyeX = -12 * headSize;
  const rightEyeX = 12 * headSize;

  if (app.eyes.style === 'dot') {
    headShapes.push(
      { type: 'circle', cx: leftEyeX, cy: eyeY, r: 3.5 * eyeSize, fill: eyeColor },
      { type: 'circle', cx: rightEyeX, cy: eyeY, r: 3.5 * eyeSize, fill: eyeColor }
    );
  } else if (app.eyes.style === 'happy') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 6} ${eyeY + 2} Q ${leftEyeX} ${eyeY - 6} ${leftEyeX + 6} ${eyeY + 2}`, stroke: eyeColor, strokeWidth: 3, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 6} ${eyeY + 2} Q ${rightEyeX} ${eyeY - 6} ${rightEyeX + 6} ${eyeY + 2}`, stroke: eyeColor, strokeWidth: 3, strokeLinecap: 'round', fill: 'none' }
    );
  } else if (app.eyes.style === 'sleepy') {
    headShapes.push(
      { type: 'path', d: `M ${leftEyeX - 6} ${eyeY} Q ${leftEyeX} ${eyeY + 5} ${leftEyeX + 6} ${eyeY}`, stroke: eyeColor, strokeWidth: 3.4, strokeLinecap: 'round', fill: 'none' },
      { type: 'path', d: `M ${rightEyeX - 6} ${eyeY} Q ${rightEyeX} ${eyeY + 5} ${rightEyeX + 6} ${eyeY}`, stroke: eyeColor, strokeWidth: 3.4, strokeLinecap: 'round', fill: 'none' }
    );
  } else if (app.eyes.style === 'anime') {
    headShapes.push(
      { type: 'ellipse', cx: leftEyeX, cy: eyeY, rx: 6.2 * eyeSize, ry: 7.5 * eyeSize, fill: '#ffffff', stroke: eyeColor, strokeWidth: 1.2 },
      { type: 'ellipse', cx: leftEyeX, cy: eyeY + 1.2, rx: 3.7 * eyeSize, ry: 5.3 * eyeSize, fill: eyeColor },
      { type: 'circle', cx: leftEyeX - 1.3, cy: eyeY - 2, r: 2.1 * eyeSize, fill: '#ffffff' },
      { type: 'ellipse', cx: rightEyeX, cy: eyeY, rx: 6.2 * eyeSize, ry: 7.5 * eyeSize, fill: '#ffffff', stroke: eyeColor, strokeWidth: 1.2 },
      { type: 'ellipse', cx: rightEyeX, cy: eyeY + 1.2, rx: 3.7 * eyeSize, ry: 5.3 * eyeSize, fill: eyeColor },
      { type: 'circle', cx: rightEyeX - 1.3, cy: eyeY - 2, r: 2.1 * eyeSize, fill: '#ffffff' }
    );
  } else {
    headShapes.push(
      { type: 'circle', cx: leftEyeX, cy: eyeY, r: eyeR, fill: eyeColor },
      { type: 'circle', cx: leftEyeX - 1.5, cy: eyeY - 2, r: eyeR * 0.4, fill: '#ffffff' },
      { type: 'circle', cx: rightEyeX, cy: eyeY, r: eyeR, fill: eyeColor },
      { type: 'circle', cx: rightEyeX - 1.5, cy: eyeY - 2, r: eyeR * 0.4, fill: '#ffffff' }
    );
  }

  // Eyebrows
  const browY = baseHeadY - 10 * headSize;
  const eyebrowPath = (centerX: number) => {
    const startX = centerX - 6 * headSize;
    const endX = centerX + 6 * headSize;
    if (app.eyebrows.style === 'flat') return `M ${startX} ${browY} L ${endX} ${browY}`;
    if (app.eyebrows.style === 'arched') return `M ${startX} ${browY} Q ${centerX} ${browY - 8 * headSize} ${endX} ${browY}`;
    if (app.eyebrows.style === 'bushy') return `M ${startX} ${browY + 1} L ${centerX - 2 * headSize} ${browY - 6 * headSize} L ${endX} ${browY + 1}`;
    return `M ${startX} ${browY} Q ${centerX} ${browY - 3 * headSize} ${endX} ${browY}`;
  };
  const eyebrowWidth = app.eyebrows.style === 'bushy' ? 4.5 : app.eyebrows.style === 'flat' ? 2.2 : 2.6;
  headShapes.push(
    { type: 'path', d: eyebrowPath(leftEyeX), stroke: app.eyebrows.color || hairColor, strokeWidth: eyebrowWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' },
    { type: 'path', d: eyebrowPath(rightEyeX), stroke: app.eyebrows.color || hairColor, strokeWidth: eyebrowWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
  );

  // Nose
  const noseY = baseHeadY + 6;
  if (app.nose.style === 'bear_snout') {
    headShapes.push({
      type: 'path',
      d: `M -6 ${baseHeadY + 4} Q 0 ${baseHeadY} 6 ${baseHeadY + 4} Q 0 ${baseHeadY + 10} -6 ${baseHeadY + 4} Z`,
      fill: app.nose.color || '#1e293b',
    });
  } else if (app.nose.style === 'triangle') {
    headShapes.push({ type: 'path', d: `M -3.5 ${noseY + 2} L 0 ${noseY - 4} L 3.5 ${noseY + 2} Z`, fill: app.nose.color || '#ea580c' });
  } else if (app.nose.style === 'oval') {
    headShapes.push({ type: 'ellipse', cx: 0, cy: noseY, rx: 4.5 * (app.nose.size || 1), ry: 2.8 * (app.nose.size || 1), fill: app.nose.color || '#d97706' });
  } else {
    headShapes.push({ type: 'circle', cx: 0, cy: noseY, r: (app.nose.style === 'dot' ? 2 : 3) * (app.nose.size || 1), fill: app.nose.color || '#d97706' });
  }

  // Mouth
  const mouthY = baseHeadY + 16;
  if (app.mouth.style === 'open_grin') {
    headShapes.push({ type: 'path', d: `M -9 ${mouthY} Q 0 ${mouthY + 12} 9 ${mouthY} Q 0 ${mouthY + 9} -9 ${mouthY} Z`, fill: '#b91c1c', stroke: '#991b1b', strokeWidth: 1.5 });
  } else if (app.mouth.style === 'laugh') {
    headShapes.push(
      { type: 'path', d: `M -10 ${mouthY} Q 0 ${mouthY + 15} 10 ${mouthY} Q 0 ${mouthY + 10} -10 ${mouthY} Z`, fill: '#7f1d1d', stroke: '#991b1b', strokeWidth: 1.5 },
      { type: 'path', d: `M -5 ${mouthY + 6} Q 0 ${mouthY + 3} 5 ${mouthY + 6} Q 2 ${mouthY + 11} 0 ${mouthY + 10} Q -2 ${mouthY + 11} -5 ${mouthY + 6} Z`, fill: '#fb7185' }
    );
  } else if (app.mouth.style === 'surprised') {
    headShapes.push({ type: 'ellipse', cx: 0, cy: mouthY + 3, rx: 3.8, ry: 5.8, fill: '#b91c1c' });
  } else if (app.mouth.style === 'line') {
    headShapes.push({ type: 'path', d: `M -7 ${mouthY + 2} L 7 ${mouthY + 2}`, stroke: app.mouth.color || '#b91c1c', strokeWidth: 2.8, strokeLinecap: 'round', fill: 'none' });
  } else {
    headShapes.push({ type: 'path', d: `M -8 ${mouthY} Q 0 ${mouthY + 8} 8 ${mouthY}`, stroke: app.mouth.color || '#b91c1c', strokeWidth: 2.8, strokeLinecap: 'round', fill: 'none' });
  }

  // Optional Blush
  if (app.accessories?.blush !== false) {
    headShapes.push(
      { type: 'ellipse', cx: -22 * headSize, cy: baseHeadY + 8, rx: 6, ry: 4, fill: '#f87171', opacity: 0.45 },
      { type: 'ellipse', cx: 22 * headSize, cy: baseHeadY + 8, rx: 6, ry: 4, fill: '#f87171', opacity: 0.45 }
    );
  }

  // Optional Glasses
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

  // -------------------------------------------------------------------------
  // 2. TORSO & NECK SHAPES
  // -------------------------------------------------------------------------
  const torsoShapes: VectorPartShape[] = [];
  const torsoShapeWidth = app.torso.shape === 'slim' ? 0.82 : app.torso.shape === 'stocky' ? 1.18 : 1;
  const halfW = 28 * torsoWidth * torsoShapeWidth;
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
      d: `M ${-halfW} 0 Q 0 -8 ${halfW} 0 L ${halfW + 12} ${bottomY + 16} Q 0 ${bottomY + 22} ${-halfW - 12} ${bottomY + 16} Z`,
      fill: shirtColor,
    });
  } else if (app.torso.clothingStyle === 'vest') {
    torsoShapes.push(
      // Inner shirt
      {
        type: 'path',
        d: `M ${-halfW} 0 Q 0 -8 ${halfW} 0 L ${halfW - 2} ${bottomY} Q 0 ${bottomY + 4} ${-halfW + 2} ${bottomY} Z`,
        fill: '#f8fafc',
      },
      // Vest jacket
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
    torsoShapes.push({ type: 'path', d: `M -14 20 L 14 20 L 18 36 L -18 36 Z`, fill: collarColor, opacity: 0.9 });
  } else if (app.torso.clothingStyle === 'collared') {
    torsoShapes.push(
      { type: 'path', d: 'M -15 0 L -4 4 L -9 15 Z', fill: collarColor },
      { type: 'path', d: 'M 15 0 L 4 4 L 9 15 Z', fill: collarColor },
      { type: 'path', d: 'M -4 4 L 0 9 L 4 4 L 2 22 L -2 22 Z', fill: '#ef4444' }
    );
  } else {
    torsoShapes.push({ type: 'path', d: 'M -14 0 Q 0 8 14 0', stroke: collarColor, strokeWidth: 3.5, strokeLinecap: 'round', fill: 'none' });
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
      { type: 'path', d: `M ${-halfW + 4} 15 L ${halfW - 4} 15`, stroke: collarColor, strokeWidth: 4 },
      { type: 'path', d: `M ${-halfW + 4} 25 L ${halfW - 4} 25`, stroke: collarColor, strokeWidth: 4 }
    );
  }

  // Belt / Waistband (under shirt bottom)
  torsoShapes.push({
    type: 'rect',
    x: -halfW + 4,
    y: bottomY,
    width: halfW * 2 - 8,
    height: 10,
    fill: pantsColor,
  });

  // -------------------------------------------------------------------------
  // 3. ARMS SHAPES & PIVOTS
  // -------------------------------------------------------------------------
  const armPivotX = 28 * torsoWidth;
  const leftShoulderX = -armPivotX + (app.arms.leftShoulderOffsetX ?? 0);
  const leftShoulderY = -4 + (app.arms.leftShoulderOffsetY ?? 0);
  const rightShoulderX = armPivotX + (app.arms.rightShoulderOffsetX ?? 0);
  const rightShoulderY = -4 + (app.arms.rightShoulderOffsetY ?? 0);
  const leftArmLen = app.arms.leftLength ?? armLen;
  const rightArmLen = app.arms.rightLength ?? armLen;
  const leftArmThick = app.arms.leftThickness ?? armThick;
  const rightArmThick = app.arms.rightThickness ?? armThick;
  const leftForearmLen = app.arms.leftForearmLength ?? armLen;
  const rightForearmLen = app.arms.rightForearmLength ?? armLen;
  const leftForearmThick = app.arms.leftForearmThickness ?? leftArmThick;
  const rightForearmThick = app.arms.rightForearmThickness ?? rightArmThick;
  const leftElbowX = leftShoulderX - 6 * leftArmThick;
  const leftElbowY = leftShoulderY + 14 * leftArmLen;
  const rightElbowX = rightShoulderX + 6 * rightArmThick;
  const rightElbowY = rightShoulderY + 14 * rightArmLen;
  const leftArmShapes: VectorPartShape[] = [];
  const rightArmShapes: VectorPartShape[] = [];
  const leftForearmShapes: VectorPartShape[] = [];
  const rightForearmShapes: VectorPartShape[] = [];

  leftArmShapes.push({ type: 'path', d: `M ${leftShoulderX} ${leftShoulderY} Q ${leftShoulderX - 13 * leftArmThick} ${leftShoulderY + 4 * leftArmLen} ${leftElbowX - 3 * leftArmThick} ${leftElbowY} L ${leftElbowX + 3 * leftArmThick} ${leftElbowY} Q ${leftShoulderX + 5} ${leftShoulderY + 8} ${leftShoulderX} ${leftShoulderY} Z`, fill: armSkin });
  rightArmShapes.push({ type: 'path', d: `M ${rightShoulderX} ${rightShoulderY} Q ${rightShoulderX + 13 * rightArmThick} ${rightShoulderY + 4 * rightArmLen} ${rightElbowX + 3 * rightArmThick} ${rightElbowY} L ${rightElbowX - 3 * rightArmThick} ${rightElbowY} Q ${rightShoulderX - 5} ${rightShoulderY + 8} ${rightShoulderX} ${rightShoulderY} Z`, fill: armSkin });

  if (app.arms.sleeveStyle !== 'sleeveless') {
    const leftSleeveEndY = app.arms.sleeveStyle === 'long' ? leftElbowY : leftShoulderY + 7 * leftArmLen;
    const rightSleeveEndY = app.arms.sleeveStyle === 'long' ? rightElbowY : rightShoulderY + 7 * rightArmLen;
    leftArmShapes.push({ type: 'path', d: `M ${leftShoulderX} ${leftShoulderY} Q ${leftShoulderX - 12 * leftArmThick} ${leftShoulderY + 3 * leftArmLen} ${leftElbowX - 2 * leftArmThick} ${leftSleeveEndY} L ${leftElbowX + 2 * leftArmThick} ${leftSleeveEndY} Q ${leftShoulderX + 3} ${leftShoulderY + 6} ${leftShoulderX} ${leftShoulderY} Z`, fill: shirtColor });
    rightArmShapes.push({ type: 'path', d: `M ${rightShoulderX} ${rightShoulderY} Q ${rightShoulderX + 12 * rightArmThick} ${rightShoulderY + 3 * rightArmLen} ${rightElbowX + 2 * rightArmThick} ${rightSleeveEndY} L ${rightElbowX - 2 * rightArmThick} ${rightSleeveEndY} Q ${rightShoulderX - 3} ${rightShoulderY + 6} ${rightShoulderX} ${rightShoulderY} Z`, fill: shirtColor });
  }

  const leftForearmEndY = leftElbowY + 16 * leftForearmLen;
  const rightForearmEndY = rightElbowY + 16 * rightForearmLen;
  leftForearmShapes.push({ type: 'path', d: `M ${leftElbowX} ${leftElbowY - 2} Q ${leftElbowX - 8 * leftForearmThick} ${leftElbowY + 5 * leftForearmLen} ${leftElbowX - 5 * leftForearmThick} ${leftForearmEndY} L ${leftElbowX + 3 * leftForearmThick} ${leftForearmEndY} Q ${leftElbowX + 6 * leftForearmThick} ${leftElbowY + 7 * leftForearmLen} ${leftElbowX + 4} ${leftElbowY + 2} Z`, fill: armSkin });
  rightForearmShapes.push({ type: 'path', d: `M ${rightElbowX} ${rightElbowY - 2} Q ${rightElbowX + 8 * rightForearmThick} ${rightElbowY + 5 * rightForearmLen} ${rightElbowX + 5 * rightForearmThick} ${rightForearmEndY} L ${rightElbowX - 3 * rightForearmThick} ${rightForearmEndY} Q ${rightElbowX - 6 * rightForearmThick} ${rightElbowY + 7 * rightForearmLen} ${rightElbowX - 4} ${rightElbowY + 2} Z`, fill: armSkin });

  if (app.arms.handShape === 'mitten') {
    leftForearmShapes.push({ type: 'ellipse', cx: leftElbowX - 1, cy: leftForearmEndY, rx: 6 * leftForearmThick, ry: 5 * leftForearmThick, fill: armSkin });
    rightForearmShapes.push({ type: 'ellipse', cx: rightElbowX + 1, cy: rightForearmEndY, rx: 6 * rightForearmThick, ry: 5 * rightForearmThick, fill: armSkin });
  } else if (app.arms.handShape === 'paw') {
    leftForearmShapes.push(
      { type: 'ellipse', cx: leftElbowX - 2, cy: leftForearmEndY, rx: 7 * leftForearmThick, ry: 5 * leftForearmThick, fill: armSkin },
      { type: 'circle', cx: leftElbowX - 6, cy: leftForearmEndY - 4, r: 2.1 * leftForearmThick, fill: '#fef3c7' },
      { type: 'circle', cx: leftElbowX - 1, cy: leftForearmEndY - 5, r: 2.1 * leftForearmThick, fill: '#fef3c7' },
      { type: 'circle', cx: leftElbowX + 4, cy: leftForearmEndY - 3, r: 2.1 * leftForearmThick, fill: '#fef3c7' }
    );
    rightForearmShapes.push(
      { type: 'ellipse', cx: rightElbowX + 2, cy: rightForearmEndY, rx: 7 * rightForearmThick, ry: 5 * rightForearmThick, fill: armSkin },
      { type: 'circle', cx: rightElbowX - 4, cy: rightForearmEndY - 3, r: 2.1 * rightForearmThick, fill: '#fef3c7' },
      { type: 'circle', cx: rightElbowX + 1, cy: rightForearmEndY - 5, r: 2.1 * rightForearmThick, fill: '#fef3c7' },
      { type: 'circle', cx: rightElbowX + 6, cy: rightForearmEndY - 4, r: 2.1 * rightForearmThick, fill: '#fef3c7' }
    );
  }

  // -------------------------------------------------------------------------
  // 4. LEGS SHAPES & PIVOTS
  // -------------------------------------------------------------------------
  const hipBaseX = 16 * (0.8 + 0.2 * torsoWidth);
  const hipY = bottomY + 10;
  const leftHipX = -hipBaseX + (app.legs.leftHipOffsetX ?? 0);
  const rightHipX = hipBaseX + (app.legs.rightHipOffsetX ?? 0);
  const leftHipY = hipY + (app.legs.leftHipOffsetY ?? 0);
  const rightHipY = hipY + (app.legs.rightHipOffsetY ?? 0);
  const leftUpperH = 15 * (app.legs.leftUpperLength ?? legLen);
  const rightUpperH = 15 * (app.legs.rightUpperLength ?? legLen);
  const leftLowerH = 15 * (app.legs.leftLowerLength ?? legLen);
  const rightLowerH = 15 * (app.legs.rightLowerLength ?? legLen);
  const leftLegThick = app.legs.leftThickness ?? legThick;
  const rightLegThick = app.legs.rightThickness ?? legThick;
  const leftKneeY = leftHipY + leftUpperH;
  const rightKneeY = rightHipY + rightUpperH;
  const leftFootY = leftKneeY + leftLowerH;
  const rightFootY = rightKneeY + rightLowerH;
  const leftLegShapes: VectorPartShape[] = [];
  const rightLegShapes: VectorPartShape[] = [];
  const leftLowerLegShapes: VectorPartShape[] = [];
  const rightLowerLegShapes: VectorPartShape[] = [];

  if (app.legs.pantsStyle === 'skirt') {
    leftLegShapes.push({ type: 'path', d: `M ${leftHipX - 12 * leftLegThick} ${leftHipY} L ${leftHipX + 12 * leftLegThick} ${leftHipY} L ${leftHipX + 9 * leftLegThick} ${leftKneeY - 3} L ${leftHipX - 9 * leftLegThick} ${leftKneeY - 3} Z`, fill: pantsColor });
    rightLegShapes.push({ type: 'path', d: `M ${rightHipX - 12 * rightLegThick} ${rightHipY} L ${rightHipX + 12 * rightLegThick} ${rightHipY} L ${rightHipX + 9 * rightLegThick} ${rightKneeY - 3} L ${rightHipX - 9 * rightLegThick} ${rightKneeY - 3} Z`, fill: pantsColor });
  } else {
    const leftUpperEnd = app.legs.pantsStyle === 'shorts' ? leftKneeY - 4 : leftKneeY;
    const rightUpperEnd = app.legs.pantsStyle === 'shorts' ? rightKneeY - 4 : rightKneeY;
    leftLegShapes.push({ type: 'path', d: `M ${leftHipX - 8 * leftLegThick} ${leftHipY} L ${leftHipX - 4 * leftLegThick} ${leftUpperEnd} L ${leftHipX + 8 * leftLegThick} ${leftUpperEnd} L ${leftHipX + 8 * leftLegThick} ${leftHipY} Z`, fill: pantsColor });
    rightLegShapes.push({ type: 'path', d: `M ${rightHipX - 8 * rightLegThick} ${rightHipY} L ${rightHipX - 4 * rightLegThick} ${rightUpperEnd} L ${rightHipX + 8 * rightLegThick} ${rightUpperEnd} L ${rightHipX + 8 * rightLegThick} ${rightHipY} Z`, fill: pantsColor });
  }

  const leftLowerColor = app.legs.pantsStyle === 'pants' ? pantsColor : armSkin;
  const rightLowerColor = app.legs.pantsStyle === 'pants' ? pantsColor : armSkin;
  leftLowerLegShapes.push({ type: 'path', d: `M ${leftHipX - 5 * leftLegThick} ${leftKneeY} L ${leftHipX - 4 * leftLegThick} ${leftFootY} L ${leftHipX + 5 * leftLegThick} ${leftFootY} L ${leftHipX + 5 * leftLegThick} ${leftKneeY} Z`, fill: leftLowerColor });
  rightLowerLegShapes.push({ type: 'path', d: `M ${rightHipX - 5 * rightLegThick} ${rightKneeY} L ${rightHipX - 4 * rightLegThick} ${rightFootY} L ${rightHipX + 5 * rightLegThick} ${rightFootY} L ${rightHipX + 5 * rightLegThick} ${rightKneeY} Z`, fill: rightLowerColor });

  const appendFoot = (shapes: VectorPartShape[], x: number, footY: number, thick: number) => {
    if (app.legs.shoeStyle === 'boots') {
      shapes.push({ type: 'path', d: `M ${x - 7 * thick} ${footY - 9} L ${x + 6 * thick} ${footY - 9} L ${x + 9 * thick} ${footY + 8} Q ${x} ${footY + 12} ${x - 11 * thick} ${footY + 8} Z`, fill: shoeColor });
      shapes.push({ type: 'path', d: `M ${x - 7 * thick} ${footY - 5} L ${x + 6 * thick} ${footY - 5}`, stroke: '#cbd5e1', strokeWidth: 1.5 });
    } else {
      shapes.push({ type: 'path', d: `M ${x - 10 * thick} ${footY} Q ${x - 14 * thick} ${footY + 10} ${x + 2 * thick} ${footY + 10} Q ${x + 12 * thick} ${footY + 10} ${x + 10 * thick} ${footY} Z`, fill: shoeColor });
      if (app.legs.shoeStyle === 'sneakers') shapes.push({ type: 'path', d: `M ${x - 10 * thick} ${footY + 6} Q ${x} ${footY + 12} ${x + 10 * thick} ${footY + 6}`, stroke: '#f8fafc', strokeWidth: 2, strokeLinecap: 'round', fill: 'none' });
    }
  };
  appendFoot(leftLowerLegShapes, leftHipX, leftFootY, leftLegThick);
  appendFoot(rightLowerLegShapes, rightHipX, rightFootY, rightLegThick);

  // -------------------------------------------------------------------------
  // 5. ASSEMBLE RIG
  // -------------------------------------------------------------------------
  return {
    id: `custom-rig-${id}`,
    name,
    species: app.species || 'Human',
    viewBox: '-100 -160 200 240',
    baseWidth: 150 * torsoWidth,
    baseHeight: 220,
    parts: {
      torso: {
        id: 'torso',
        label: 'Torso',
        pivot: { x: 0, y: 15 },
        zIndex: 2,
        shapes: torsoShapes,
      },
      head: {
        id: 'head',
        label: 'Head',
        pivot: { x: 0, y: headChinY },
        zIndex: 4,
        shapes: headShapes,
      },
      leftArm: {
        id: 'leftArm', label: 'Left Upper Arm', pivot: { x: leftShoulderX, y: leftShoulderY }, zIndex: 1, shapes: leftArmShapes,
      },
      leftForearm: {
        id: 'leftForearm', label: 'Left Forearm / Elbow Joint', pivot: { x: leftElbowX, y: leftElbowY }, zIndex: 2, shapes: leftForearmShapes,
      },
      rightArm: {
        id: 'rightArm', label: 'Right Upper Arm', pivot: { x: rightShoulderX, y: rightShoulderY }, zIndex: 3, shapes: rightArmShapes,
      },
      rightForearm: {
        id: 'rightForearm', label: 'Right Forearm / Elbow Joint', pivot: { x: rightElbowX, y: rightElbowY }, zIndex: 4, shapes: rightForearmShapes,
      },
      leftLeg: {
        id: 'leftLeg', label: 'Left Upper Leg', pivot: { x: leftHipX, y: leftHipY }, zIndex: 1, shapes: leftLegShapes,
      },
      leftLowerLeg: {
        id: 'leftLowerLeg', label: 'Left Lower Leg / Knee Joint', pivot: { x: leftHipX, y: leftKneeY }, zIndex: 1, shapes: leftLowerLegShapes,
      },
      rightLeg: {
        id: 'rightLeg', label: 'Right Upper Leg', pivot: { x: rightHipX, y: rightHipY }, zIndex: 1, shapes: rightLegShapes,
      },
      rightLowerLeg: {
        id: 'rightLowerLeg', label: 'Right Lower Leg / Knee Joint', pivot: { x: rightHipX, y: rightKneeY }, zIndex: 1, shapes: rightLowerLegShapes,
      },
    },
  };
}

