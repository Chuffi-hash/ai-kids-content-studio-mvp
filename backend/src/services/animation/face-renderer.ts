import {
  VectorPartShape,
  VectorRigDefinition,
  FacialExpression,
  MouthShape,
  EvaluatedPose,
} from './vector-animation.engine.js';

export interface FaceFeatureAnchors {
  headCenterY: number;
  eyeY: number;
  leftEyeX: number;
  rightEyeX: number;
  eyeRadius: number;
  eyeColor: string;
  browY: number;
  browColor: string;
  mouthY: number;
  mouthColor: string;
}

/**
 * Extracts facial feature anchor coordinates and colors from a rig's head definition.
 */
export function extractFaceAnchors(rig: VectorRigDefinition): FaceFeatureAnchors {
  const headShapes: VectorPartShape[] = rig.parts?.head?.shapes || [];

  // Default fallbacks (canonical proportions)
  let headCenterY = -54;
  let eyeY = -54;
  let leftEyeX = -12;
  let rightEyeX = 12;
  let eyeRadius = 5;
  let eyeColor = '#0f172a';
  let browY = -64;
  let browColor = '#78350f';
  let mouthY = -38;
  let mouthColor = '#b91c1c';

  if (rig.species?.toLowerCase() === 'bear' || rig.id?.includes('pip')) {
    headCenterY = -52;
    eyeY = -58;
    leftEyeX = -14;
    rightEyeX = 14;
    eyeRadius = 4.5;
    browY = -67;
    browColor = '#78350f';
    mouthY = -40;
    mouthColor = '#1e293b';
  } else if (
    rig.species?.toLowerCase() === 'planet' ||
    rig.species?.toLowerCase() === 'earth' ||
    rig.id?.includes('earth') ||
    rig.id?.includes('terra')
  ) {
    headCenterY = -40;
    eyeY = -44;
    leftEyeX = -15;
    rightEyeX = 15;
    eyeRadius = 6;
    browY = -55;
    browColor = '#0f172a';
    mouthY = -26;
    mouthColor = '#be123c';
  }

  // Detect anchors from existing shapes if available
  const eyeShapes = headShapes.filter((s) => s.tag === 'eyes');
  if (eyeShapes.length > 0) {
    const leftEye = eyeShapes.find((s) => s.cx !== undefined && s.cx < 0);
    const rightEye = eyeShapes.find((s) => s.cx !== undefined && s.cx > 0);
    if (leftEye && leftEye.cx !== undefined) leftEyeX = leftEye.cx;
    if (rightEye && rightEye.cx !== undefined) rightEyeX = rightEye.cx;
    if (leftEye && leftEye.cy !== undefined) {
      eyeY = leftEye.cy;
      browY = eyeY - 11;
      mouthY = eyeY + 18;
    }
    if (leftEye && leftEye.r !== undefined) eyeRadius = leftEye.r;
    const filledEye = eyeShapes.find((s) => s.fill && s.fill !== '#ffffff' && s.fill !== 'none');
    if (filledEye && filledEye.fill) eyeColor = filledEye.fill;
  } else {
    // Untagged heuristic to detect eye anchors
    const candidateEyes = headShapes.filter(
      (s) =>
        (s.type === 'circle' || s.type === 'ellipse') &&
        s.cx !== undefined &&
        Math.abs(s.cx) >= 8 &&
        Math.abs(s.cx) <= 25 &&
        s.cy !== undefined &&
        s.cy <= -35 &&
        ((s.r || 0) <= 8 || (s.rx || 0) <= 8)
    );
    const leftCandidate = candidateEyes.find((s) => (s.cx || 0) < 0);
    const rightCandidate = candidateEyes.find((s) => (s.cx || 0) > 0);
    if (leftCandidate && leftCandidate.cx !== undefined) leftEyeX = leftCandidate.cx;
    if (rightCandidate && rightCandidate.cx !== undefined) rightEyeX = rightCandidate.cx;
    if (leftCandidate && leftCandidate.cy !== undefined) {
      eyeY = leftCandidate.cy;
      browY = eyeY - 10;
      mouthY = eyeY + 16;
    }
  }

  const existingBrow = headShapes.find((s) => s.tag === 'eyebrows');
  if (existingBrow) {
    if (existingBrow.stroke) browColor = existingBrow.stroke;
  }

  const existingMouth = headShapes.find((s) => s.tag === 'mouth');
  if (existingMouth) {
    if (existingMouth.stroke) mouthColor = existingMouth.stroke;
    else if (existingMouth.fill && existingMouth.fill !== 'none') mouthColor = existingMouth.fill;
  }

  return {
    headCenterY,
    eyeY,
    leftEyeX,
    rightEyeX,
    eyeRadius,
    eyeColor,
    browY,
    browColor,
    mouthY,
    mouthColor,
  };
}

/**
 * Generates dynamic eyebrows, eyes, and mouth shapes for a given expression and mouth state.
 */
export function generateDynamicFaceShapes(
  expression: FacialExpression,
  mouthState: MouthShape,
  speaking: boolean,
  anchors: FaceFeatureAnchors
): VectorPartShape[] {
  const {
    eyeY,
    leftEyeX,
    rightEyeX,
    eyeRadius: r,
    eyeColor,
    browY,
    browColor,
    mouthY,
    mouthColor,
  } = anchors;

  const shapes: VectorPartShape[] = [];

  // ---------------------------------------------------------------------------
  // 1. EYEBROWS
  // ---------------------------------------------------------------------------
  switch (expression) {
    case 'happy':
      // Cheerful high arched brows
      shapes.push(
        {
          type: 'path',
          d: `M ${leftEyeX - 7} ${browY - 1} Q ${leftEyeX} ${browY - 7} ${leftEyeX + 6} ${browY}`,
          stroke: browColor,
          strokeWidth: 2.6,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        {
          type: 'path',
          d: `M ${rightEyeX - 6} ${browY} Q ${rightEyeX} ${browY - 7} ${rightEyeX + 7} ${browY - 1}`,
          stroke: browColor,
          strokeWidth: 2.6,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        }
      );
      break;

    case 'sad':
      // Inward raised, downward slanted brows (empathetic/sad)
      shapes.push(
        {
          type: 'path',
          d: `M ${leftEyeX - 6} ${browY + 2} Q ${leftEyeX} ${browY - 2} ${leftEyeX + 6} ${browY - 4}`,
          stroke: browColor,
          strokeWidth: 2.4,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        {
          type: 'path',
          d: `M ${rightEyeX - 6} ${browY - 4} Q ${rightEyeX} ${browY - 2} ${rightEyeX + 6} ${browY + 2}`,
          stroke: browColor,
          strokeWidth: 2.4,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        }
      );
      break;

    case 'angry':
      // Sharply furrowed downward toward center
      shapes.push(
        {
          type: 'path',
          d: `M ${leftEyeX - 7} ${browY - 4} L ${leftEyeX + 6} ${browY + 3}`,
          stroke: browColor,
          strokeWidth: 3.0,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        {
          type: 'path',
          d: `M ${rightEyeX - 6} ${browY + 3} L ${rightEyeX + 7} ${browY - 4}`,
          stroke: browColor,
          strokeWidth: 3.0,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        }
      );
      break;

    case 'surprised':
      // High raised brows in astonishment
      shapes.push(
        {
          type: 'path',
          d: `M ${leftEyeX - 7} ${browY - 6} Q ${leftEyeX} ${browY - 12} ${leftEyeX + 7} ${browY - 6}`,
          stroke: browColor,
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        {
          type: 'path',
          d: `M ${rightEyeX - 7} ${browY - 6} Q ${rightEyeX} ${browY - 12} ${rightEyeX + 7} ${browY - 6}`,
          stroke: browColor,
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        }
      );
      break;

    case 'scared':
      // High brows with nervous wavy curve
      shapes.push(
        {
          type: 'path',
          d: `M ${leftEyeX - 6} ${browY - 2} Q ${leftEyeX} ${browY - 8} ${leftEyeX + 6} ${browY - 9}`,
          stroke: browColor,
          strokeWidth: 2.4,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        {
          type: 'path',
          d: `M ${rightEyeX - 6} ${browY - 9} Q ${rightEyeX} ${browY - 8} ${rightEyeX + 6} ${browY - 2}`,
          stroke: browColor,
          strokeWidth: 2.4,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        }
      );
      break;

    case 'confused':
      // One brow raised high, one lowered/flat
      shapes.push(
        {
          type: 'path',
          d: `M ${leftEyeX - 7} ${browY - 6} Q ${leftEyeX} ${browY - 11} ${leftEyeX + 7} ${browY - 7}`,
          stroke: browColor,
          strokeWidth: 2.6,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        {
          type: 'path',
          d: `M ${rightEyeX - 6} ${browY + 1} L ${rightEyeX + 6} ${browY + 1}`,
          stroke: browColor,
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        }
      );
      break;

    case 'curious':
      // Inquisitive raised left brow, gentle right brow
      shapes.push(
        {
          type: 'path',
          d: `M ${leftEyeX - 7} ${browY - 5} Q ${leftEyeX} ${browY - 9} ${leftEyeX + 6} ${browY - 4}`,
          stroke: browColor,
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        {
          type: 'path',
          d: `M ${rightEyeX - 6} ${browY} Q ${rightEyeX} ${browY - 3} ${rightEyeX + 6} ${browY}`,
          stroke: browColor,
          strokeWidth: 2.3,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        }
      );
      break;

    case 'neutral':
    default:
      // Canonical curved brows
      shapes.push(
        {
          type: 'path',
          d: `M ${leftEyeX - 6} ${browY} Q ${leftEyeX} ${browY - 3} ${leftEyeX + 6} ${browY}`,
          stroke: browColor,
          strokeWidth: 2.3,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        {
          type: 'path',
          d: `M ${rightEyeX - 6} ${browY} Q ${rightEyeX} ${browY - 3} ${rightEyeX + 6} ${browY}`,
          stroke: browColor,
          strokeWidth: 2.3,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        }
      );
      break;
  }

  // ---------------------------------------------------------------------------
  // 2. EYES
  // ---------------------------------------------------------------------------
  switch (expression) {
    case 'happy':
      // Cheerful smiling eye arcs
      shapes.push(
        {
          type: 'path',
          d: `M ${leftEyeX - 6} ${eyeY + 2} Q ${leftEyeX} ${eyeY - 6} ${leftEyeX + 6} ${eyeY + 2}`,
          stroke: eyeColor,
          strokeWidth: 3.2,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyes',
        },
        {
          type: 'path',
          d: `M ${rightEyeX - 6} ${eyeY + 2} Q ${rightEyeX} ${eyeY - 6} ${rightEyeX + 6} ${eyeY + 2}`,
          stroke: eyeColor,
          strokeWidth: 3.2,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyes',
        }
      );
      break;

    case 'sad':
      // Soft gentle eyes looking slightly down with drooped upper lid
      shapes.push(
        { type: 'circle', cx: leftEyeX, cy: eyeY + 1.2, r: r * 0.95, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: leftEyeX - 1.2, cy: eyeY + 0.3, r: r * 0.35, fill: '#ffffff', tag: 'eyes' },
        {
          type: 'path',
          d: `M ${leftEyeX - 7} ${eyeY - 1} Q ${leftEyeX} ${eyeY - 5} ${leftEyeX + 7} ${eyeY - 2}`,
          stroke: eyeColor,
          strokeWidth: 2.2,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyes',
        },
        { type: 'circle', cx: rightEyeX, cy: eyeY + 1.2, r: r * 0.95, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: rightEyeX - 1.2, cy: eyeY + 0.3, r: r * 0.35, fill: '#ffffff', tag: 'eyes' },
        {
          type: 'path',
          d: `M ${rightEyeX - 7} ${eyeY - 2} Q ${rightEyeX} ${eyeY - 5} ${rightEyeX + 7} ${eyeY - 1}`,
          stroke: eyeColor,
          strokeWidth: 2.2,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyes',
        }
      );
      break;

    case 'angry':
      // Focused intense pupils with sharp angled upper lid
      shapes.push(
        { type: 'circle', cx: leftEyeX + 0.5, cy: eyeY + 0.5, r: r * 0.9, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: leftEyeX - 1, cy: eyeY - 0.5, r: r * 0.3, fill: '#ffffff', tag: 'eyes' },
        {
          type: 'path',
          d: `M ${leftEyeX - 7} ${eyeY - 4} L ${leftEyeX + 7} ${eyeY + 1}`,
          stroke: eyeColor,
          strokeWidth: 2.8,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyes',
        },
        { type: 'circle', cx: rightEyeX - 0.5, cy: eyeY + 0.5, r: r * 0.9, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: rightEyeX - 1, cy: eyeY - 0.5, r: r * 0.3, fill: '#ffffff', tag: 'eyes' },
        {
          type: 'path',
          d: `M ${rightEyeX - 7} ${eyeY + 1} L ${rightEyeX + 7} ${eyeY - 4}`,
          stroke: eyeColor,
          strokeWidth: 2.8,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyes',
        }
      );
      break;

    case 'surprised':
      // Dilated wide eyes with large glint
      shapes.push(
        { type: 'circle', cx: leftEyeX, cy: eyeY, r: r * 1.25, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: leftEyeX - 2, cy: eyeY - 2, r: r * 0.45, fill: '#ffffff', tag: 'eyes' },
        { type: 'circle', cx: rightEyeX, cy: eyeY, r: r * 1.25, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: rightEyeX - 2, cy: eyeY - 2, r: r * 0.45, fill: '#ffffff', tag: 'eyes' }
      );
      break;

    case 'scared':
      // White sclera with small contracted shivering pupil
      shapes.push(
        { type: 'circle', cx: leftEyeX, cy: eyeY, r: r * 1.2, fill: '#ffffff', stroke: eyeColor, strokeWidth: 1.5, tag: 'eyes' },
        { type: 'circle', cx: leftEyeX, cy: eyeY, r: r * 0.5, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: rightEyeX, cy: eyeY, r: r * 1.2, fill: '#ffffff', stroke: eyeColor, strokeWidth: 1.5, tag: 'eyes' },
        { type: 'circle', cx: rightEyeX, cy: eyeY, r: r * 0.5, fill: eyeColor, tag: 'eyes' }
      );
      break;

    case 'confused':
      // Asymmetric: left wide, right squinting
      shapes.push(
        { type: 'circle', cx: leftEyeX, cy: eyeY - 0.8, r: r * 1.1, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: leftEyeX - 1.5, cy: eyeY - 2.5, r: r * 0.35, fill: '#ffffff', tag: 'eyes' },
        {
          type: 'path',
          d: `M ${rightEyeX - 6} ${eyeY + 1} Q ${rightEyeX} ${eyeY - 3} ${rightEyeX + 6} ${eyeY + 1}`,
          stroke: eyeColor,
          strokeWidth: 3.0,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyes',
        }
      );
      break;

    case 'curious':
      // Attentive gaze looking slightly up and right
      shapes.push(
        { type: 'circle', cx: leftEyeX + 1.4, cy: eyeY - 0.8, r, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: leftEyeX + 0.4, cy: eyeY - 2.2, r: r * 0.38, fill: '#ffffff', tag: 'eyes' },
        { type: 'circle', cx: rightEyeX + 1.4, cy: eyeY - 0.8, r, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: rightEyeX + 0.4, cy: eyeY - 2.2, r: r * 0.38, fill: '#ffffff', tag: 'eyes' }
      );
      break;

    case 'neutral':
    default:
      // Standard cartoon eyes
      shapes.push(
        { type: 'circle', cx: leftEyeX, cy: eyeY, r, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: leftEyeX - 1.5, cy: eyeY - 2, r: r * 0.38, fill: '#ffffff', tag: 'eyes' },
        { type: 'circle', cx: rightEyeX, cy: eyeY, r, fill: eyeColor, tag: 'eyes' },
        { type: 'circle', cx: rightEyeX - 1.5, cy: eyeY - 2, r: r * 0.38, fill: '#ffffff', tag: 'eyes' }
      );
      break;
  }

  // ---------------------------------------------------------------------------
  // 3. MOUTH & LIP-SYNC
  // ---------------------------------------------------------------------------
  if (speaking && mouthState !== 'rest') {
    // Active speech mouth shapes
    switch (mouthState) {
      case 'open':
        // Vertical open vowel cavity + tongue
        shapes.push(
          {
            type: 'path',
            d: `M -8 ${mouthY - 2} Q 0 ${mouthY - 5} 8 ${mouthY - 2} Q 9 ${mouthY + 8} 0 ${mouthY + 8} Q -9 ${mouthY + 8} -8 ${mouthY - 2} Z`,
            fill: '#881337',
            stroke: mouthColor,
            strokeWidth: 1.5,
            tag: 'mouth',
          },
          {
            type: 'path',
            d: `M -4 ${mouthY + 5} Q 0 ${mouthY + 2} 4 ${mouthY + 5} Q 0 ${mouthY + 8} -4 ${mouthY + 5} Z`,
            fill: '#fb7185',
            tag: 'mouth',
          }
        );
        break;

      case 'wide':
        // Horizontal stretch with white upper teeth
        shapes.push(
          {
            type: 'path',
            d: `M -11 ${mouthY - 1} Q 0 ${mouthY - 4} 11 ${mouthY - 1} Q 11 ${mouthY + 6} 0 ${mouthY + 6} Q -11 ${mouthY + 6} -11 ${mouthY - 1} Z`,
            fill: '#881337',
            stroke: mouthColor,
            strokeWidth: 1.5,
            tag: 'mouth',
          },
          {
            type: 'path',
            d: `M -8 ${mouthY - 1} Q 0 ${mouthY + 1} 8 ${mouthY - 1} L 7 ${mouthY + 2} Q 0 ${mouthY + 3} -7 ${mouthY + 2} Z`,
            fill: '#ffffff',
            tag: 'mouth',
          }
        );
        break;

      case 'round':
        // Circular 'O' shape + inner cavity
        shapes.push(
          {
            type: 'ellipse',
            cx: 0,
            cy: mouthY + 1,
            rx: 5.5,
            ry: 6.5,
            fill: '#881337',
            stroke: mouthColor,
            strokeWidth: 1.5,
            tag: 'mouth',
          },
          {
            type: 'ellipse',
            cx: 0,
            cy: mouthY + 3.5,
            rx: 3,
            ry: 2,
            fill: '#fb7185',
            tag: 'mouth',
          }
        );
        break;

      case 'closed':
        // Firmly closed straight line (M, B, P)
        shapes.push({
          type: 'path',
          d: `M -7 ${mouthY} L 7 ${mouthY}`,
          stroke: mouthColor,
          strokeWidth: 2.8,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        });
        break;

      default:
        // Default speech rest
        shapes.push({
          type: 'path',
          d: `M -6 ${mouthY} Q 0 ${mouthY + 2} 6 ${mouthY}`,
          stroke: mouthColor,
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        });
        break;
    }
  } else {
    // Non-speaking resting expression mouth
    switch (expression) {
      case 'happy':
        // Warm upturned smile
        shapes.push({
          type: 'path',
          d: `M -9 ${mouthY - 1} Q 0 ${mouthY + 8} 9 ${mouthY - 1}`,
          stroke: mouthColor,
          strokeWidth: 2.8,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        });
        break;

      case 'sad':
        // Downturned mouth curve
        shapes.push({
          type: 'path',
          d: `M -8 ${mouthY + 3} Q 0 ${mouthY - 4} 8 ${mouthY + 3}`,
          stroke: mouthColor,
          strokeWidth: 2.6,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        });
        break;

      case 'angry':
        // Stern grimace curve
        shapes.push({
          type: 'path',
          d: `M -8 ${mouthY + 1} Q 0 ${mouthY - 3} 8 ${mouthY + 2}`,
          stroke: mouthColor,
          strokeWidth: 2.8,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        });
        break;

      case 'surprised':
        // Small astonished 'o' circle
        shapes.push({
          type: 'ellipse',
          cx: 0,
          cy: mouthY + 1,
          rx: 4.8,
          ry: 5.5,
          fill: '#881337',
          stroke: mouthColor,
          strokeWidth: 1.5,
          tag: 'mouth',
        });
        break;

      case 'scared':
        // Nervous wavy mouth
        shapes.push({
          type: 'path',
          d: `M -8 ${mouthY} Q -4 ${mouthY - 3} 0 ${mouthY} Q 4 ${mouthY + 3} 8 ${mouthY}`,
          stroke: mouthColor,
          strokeWidth: 2.4,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        });
        break;

      case 'confused':
        // Asymmetric wry smirk
        shapes.push({
          type: 'path',
          d: `M -7 ${mouthY + 1} Q 0 ${mouthY - 1} 7 ${mouthY - 3}`,
          stroke: mouthColor,
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        });
        break;

      case 'curious':
        // Intrigued small smile
        shapes.push({
          type: 'path',
          d: `M -5 ${mouthY} Q 0 ${mouthY + 4} 6 ${mouthY - 1}`,
          stroke: mouthColor,
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        });
        break;

      case 'neutral':
      default:
        // Canonical resting curve
        shapes.push({
          type: 'path',
          d: `M -7 ${mouthY} Q 0 ${mouthY + 2} 7 ${mouthY}`,
          stroke: mouthColor,
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        });
        break;
    }
  }

  return shapes;
}

/**
 * Resolves the final set of shapes to render for a character's head, replacing tagged
 * facial shapes with dynamic expressive ones when an expression or lip-sync state is active.
 */
export function getHeadShapesForPose(
  rig: VectorRigDefinition,
  pose: EvaluatedPose
): VectorPartShape[] {
  const baseShapes: VectorPartShape[] = rig.parts?.head?.shapes || [];

  const expr = pose.expression || 'neutral';
  const mouth = pose.mouthState || 'rest';
  const speaking = Boolean(pose.speaking);

  // When neutral and at rest and not speaking, keep original shapes for 100% baseline parity
  if (expr === 'neutral' && mouth === 'rest' && !speaking) {
    return baseShapes;
  }

  const hasTags = baseShapes.some((s: VectorPartShape) => s.tag === 'eyes' || s.tag === 'mouth' || s.tag === 'eyebrows');
  const anchors = extractFaceAnchors(rig);

  let nonFaceShapes: VectorPartShape[];
  if (hasTags) {
    // Filter out static facial features by tag
    nonFaceShapes = baseShapes.filter(
      (s: VectorPartShape) => s.tag !== 'eyebrows' && s.tag !== 'eyes' && s.tag !== 'mouth'
    );
  } else {
    // Untagged rig fallback heuristic:
    // Remove static eyes, brows, and mouth so they do not overlap dynamic features
    nonFaceShapes = baseShapes.filter((s: VectorPartShape) => {
      // 1. Circles or ellipses in the eye zone
      if ((s.type === 'circle' || s.type === 'ellipse') && s.cy !== undefined) {
        const radius = s.type === 'circle' ? (s.r ?? 999) : Math.max(s.rx ?? 999, s.ry ?? 999);
        if (Math.abs(s.cy - anchors.eyeY) <= 10 && radius <= 10) {
          return false;
        }
      }
      // 2. Paths in brow, eye or mouth zone
      if (s.type === 'path') {
        const d = s.d || '';
        const nums: number[] = d.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
        const nearBrow = nums.some((n: number) => Math.abs(n - anchors.browY) <= 6);
        const nearMouth = nums.some((n: number) => Math.abs(n - anchors.mouthY) <= 7);
        const nearEye = nums.some((n: number) => Math.abs(n - anchors.eyeY) <= 6);
        if ((!s.fill || s.fill === 'none') && (nearBrow || nearMouth || nearEye)) {
          return false;
        }
        if (s.fill && s.fill !== 'none' && nearMouth) {
          const isSmall = !nums.some((n: number) => Math.abs(n) > 30);
          if (isSmall) return false;
        }
      }
      return true;
    });
  }

  const dynamicShapes = generateDynamicFaceShapes(
    expr,
    mouth,
    speaking,
    anchors
  );

  return [...nonFaceShapes, ...dynamicShapes];
}
