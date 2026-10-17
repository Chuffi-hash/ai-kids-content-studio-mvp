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
    // Outer ears
    headShapes.push(
      { type: 'circle', cx: -28 * headSize, cy: earY, r: earRx, fill: skin },
      { type: 'circle', cx: 28 * headSize, cy: earY, r: earRx, fill: skin },
      { type: 'circle', cx: -28 * headSize, cy: earY, r: earRx * 0.55, fill: '#fef3c7' },
      { type: 'circle', cx: 28 * headSize, cy: earY, r: earRx * 0.55, fill: '#fef3c7' }
    );
  } else if (app.ears.style !== 'round') {
    // Human/elf ears on sides
    headShapes.push(
      { type: 'ellipse', cx: -31 * headSize, cy: earY, rx: earRx, ry: earRy, fill: skin },
      { type: 'ellipse', cx: 31 * headSize, cy: earY, rx: earRx, ry: earRy, fill: skin }
    );
  }

  // Head Base
  const headRx = 30 * headSize;
  const headRy = 28 * headSize;
  const headChinY = baseHeadY + headRy;

  if (app.head.shape === 'square') {
    headShapes.push({
      type: 'rect',
      x: -headRx,
      y: baseHeadY - headRy,
      width: headRx * 2,
      height: headRy * 2,
      fill: skin,
    });
  } else if (app.head.shape === 'oval') {
    headShapes.push({
      type: 'ellipse',
      cx: 0,
      cy: baseHeadY,
      rx: headRx * 0.88,
      ry: headRy * 1.15,
      fill: skin,
    });
  } else {
    // Round / Heart
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
  } else {
    // Round / Anime / Normal cartoon
    headShapes.push(
      { type: 'circle', cx: leftEyeX, cy: eyeY, r: eyeR, fill: eyeColor },
      { type: 'circle', cx: leftEyeX - 1.5, cy: eyeY - 2, r: eyeR * 0.4, fill: '#ffffff' },
      { type: 'circle', cx: rightEyeX, cy: eyeY, r: eyeR, fill: eyeColor },
      { type: 'circle', cx: rightEyeX - 1.5, cy: eyeY - 2, r: eyeR * 0.4, fill: '#ffffff' }
    );
  }

  // Eyebrows
  const browY = baseHeadY - 10 * headSize;
  headShapes.push(
    {
      type: 'path',
      d: `M ${leftEyeX - 6} ${browY} Q ${leftEyeX} ${browY - 3} ${leftEyeX + 6} ${browY}`,
      stroke: app.eyebrows.color || hairColor,
      strokeWidth: app.eyebrows.style === 'bushy' ? 3.5 : 2,
      strokeLinecap: 'round',
      fill: 'none',
    },
    {
      type: 'path',
      d: `M ${rightEyeX - 6} ${browY} Q ${rightEyeX} ${browY - 3} ${rightEyeX + 6} ${browY}`,
      stroke: app.eyebrows.color || hairColor,
      strokeWidth: app.eyebrows.style === 'bushy' ? 3.5 : 2,
      strokeLinecap: 'round',
      fill: 'none',
    }
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
    headShapes.push({
      type: 'path',
      d: `M -3.5 ${noseY + 2} L 0 ${noseY - 4} L 3.5 ${noseY + 2} Z`,
      fill: app.nose.color || '#ea580c',
    });
  } else {
    // Button / Dot
    headShapes.push({
      type: 'circle',
      cx: 0,
      cy: noseY,
      r: (app.nose.style === 'dot' ? 2 : 3) * (app.nose.size || 1.0),
      fill: app.nose.color || '#d97706',
    });
  }

  // Mouth
  const mouthY = baseHeadY + 16;
  if (app.mouth.style === 'open_grin' || app.mouth.style === 'laugh') {
    headShapes.push({
      type: 'path',
      d: `M -9 ${mouthY} Q 0 ${mouthY + 12} 9 ${mouthY} Z`,
      fill: '#b91c1c',
      stroke: '#991b1b',
      strokeWidth: 1.5,
    });
  } else if (app.mouth.style === 'surprised') {
    headShapes.push({
      type: 'circle',
      cx: 0,
      cy: mouthY + 2,
      r: 4.5,
      fill: '#b91c1c',
    });
  } else {
    // Smile curve
    headShapes.push({
      type: 'path',
      d: `M -8 ${mouthY} Q 0 ${mouthY + 8} 8 ${mouthY}`,
      stroke: app.mouth.color || '#b91c1c',
      strokeWidth: 2.8,
      strokeLinecap: 'round',
      fill: 'none',
    });
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
    // Kangaroo pocket
    torsoShapes.push({
      type: 'path',
      d: `M -14 20 L 14 20 L 18 36 L -18 36 Z`,
      fill: collarColor,
      opacity: 0.9,
    });
  } else {
    // Collar accent
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
  const leftArmShapes: VectorPartShape[] = [];
  const rightArmShapes: VectorPartShape[] = [];
  const rightForearmShapes: VectorPartShape[] = [];

  // Left Arm (background arm)
  leftArmShapes.push(
    // Arm flesh
    {
      type: 'path',
      d: `M ${-armPivotX} -4 Q ${-armPivotX - 16 * armThick} ${12 * armLen} ${-armPivotX - 6 * armThick} ${32 * armLen} Q -24 38 -18 30 Q -18 8 ${-armPivotX} -4 Z`,
      fill: armSkin,
    }
  );
  if (app.arms.sleeveStyle !== 'sleeveless') {
    leftArmShapes.push({
      type: 'path',
      d: `M ${-armPivotX} -4 Q ${-armPivotX - 14 * armThick} 6 ${-armPivotX - 6 * armThick} 14 L ${-armPivotX + 6} 8 Z`,
      fill: shirtColor,
    });
  }

  // Right Upper Arm
  rightArmShapes.push(
    {
      type: 'path',
      d: `M ${armPivotX - 2} -4 Q ${armPivotX + 13 * armThick} 0 ${armPivotX + 10 * armThick} ${14 * armLen} L ${armPivotX + 3} 19 Q ${armPivotX - 4} 9 ${armPivotX - 2} -4 Z`,
      fill: armSkin,
    }
  );
  if (app.arms.sleeveStyle !== 'sleeveless') {
    rightArmShapes.push({
      type: 'path',
      d: `M ${armPivotX} -4 Q ${armPivotX + 12 * armThick} 6 ${armPivotX + 6 * armThick} 14 L ${armPivotX - 3} 8 Z`,
      fill: shirtColor,
    });
  }

  // Right Forearm & Hand
  const forearmPivotX = armPivotX + 6;
  const forearmPivotY = 14 * armLen;

  rightForearmShapes.push({
    type: 'path',
    d: `M ${forearmPivotX} ${forearmPivotY - 2} Q ${forearmPivotX + 9 * armThick} ${forearmPivotY + 9 * armLen} ${forearmPivotX} ${forearmPivotY + 19 * armLen} Q ${forearmPivotX - 7} ${forearmPivotY + 24 * armLen} ${forearmPivotX - 13} ${forearmPivotY + 17 * armLen} L ${forearmPivotX - 6} ${forearmPivotY + 2} Z`,
    fill: armSkin,
  });

  // -------------------------------------------------------------------------
  // 4. LEGS SHAPES & PIVOTS
  // -------------------------------------------------------------------------
  const hipX = 16 * (0.8 + 0.2 * torsoWidth);
  const hipY = bottomY + 10;
  const legH = 30 * legLen;

  const leftLegShapes: VectorPartShape[] = [];
  const rightLegShapes: VectorPartShape[] = [];

  // Left Leg (pants + shoe)
  leftLegShapes.push(
    // Pants
    {
      type: 'path',
      d: `M ${-hipX - 8 * legThick} ${hipY} L ${-hipX - 4 * legThick} ${hipY + legH} L ${-hipX + 8 * legThick} ${hipY + legH} L ${-hipX + 8 * legThick} ${hipY} Z`,
      fill: pantsColor,
    },
    // Shoe / Foot
    {
      type: 'path',
      d: `M ${-hipX - 10 * legThick} ${hipY + legH} Q ${-hipX - 14 * legThick} ${hipY + legH + 10} ${-hipX + 2 * legThick} ${hipY + legH + 10} Q ${-hipX + 12 * legThick} ${hipY + legH + 10} ${-hipX + 10 * legThick} ${hipY + legH} Z`,
      fill: shoeColor,
    }
  );

  // Right Leg (pants + shoe)
  rightLegShapes.push(
    // Pants
    {
      type: 'path',
      d: `M ${hipX - 8 * legThick} ${hipY} L ${hipX - 4 * legThick} ${hipY + legH} L ${hipX + 8 * legThick} ${hipY + legH} L ${hipX + 8 * legThick} ${hipY} Z`,
      fill: pantsColor,
    },
    // Shoe / Foot
    {
      type: 'path',
      d: `M ${hipX - 10 * legThick} ${hipY + legH} Q ${hipX - 6 * legThick} ${hipY + legH + 10} ${hipX + 10 * legThick} ${hipY + legH + 10} Q ${hipX + 18 * legThick} ${hipY + legH + 10} ${hipX + 12 * legThick} ${hipY + legH} Z`,
      fill: shoeColor,
    }
  );

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
        id: 'leftArm',
        label: 'Left Arm',
        pivot: { x: -armPivotX, y: -4 },
        zIndex: 1,
        shapes: leftArmShapes,
      },
      rightArm: {
        id: 'rightArm',
        label: 'Right Upper Arm',
        pivot: { x: armPivotX, y: -4 },
        zIndex: 3,
        shapes: rightArmShapes,
      },
      rightForearm: {
        id: 'rightForearm',
        label: 'Right Forearm',
        pivot: { x: forearmPivotX, y: forearmPivotY },
        zIndex: 4,
        shapes: rightForearmShapes,
      },
      leftLeg: {
        id: 'leftLeg',
        label: 'Left Leg',
        pivot: { x: -hipX, y: hipY },
        zIndex: 1,
        shapes: leftLegShapes,
      },
      rightLeg: {
        id: 'rightLeg',
        label: 'Right Leg',
        pivot: { x: hipX, y: hipY },
        zIndex: 1,
        shapes: rightLegShapes,
      },
    },
  };
}

