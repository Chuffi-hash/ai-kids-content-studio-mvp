import {
  VectorRigDefinition,
  VectorPartShape,
  CharacterFacingDirection,
} from '../manifest';
import { EvaluatedCharacterPose } from './animation-evaluator';
import { extractFaceAnchors, getHeadShapesForPose } from './face-renderer';

export interface ResolvedDirectionalRig {
  headShapes: VectorPartShape[];
  torsoShapes: VectorPartShape[];
  leftArmShapes: VectorPartShape[];
  rightArmShapes: VectorPartShape[];
  leftForearmShapes?: VectorPartShape[];
  rightForearmShapes?: VectorPartShape[];
  leftLegShapes: VectorPartShape[];
  rightLegShapes: VectorPartShape[];
  tailShapes?: VectorPartShape[];
  leftArmVisible: boolean;
  rightArmVisible: boolean;
  leftArmOpacity?: number;
  rightArmOpacity?: number;
  leftLegOpacity?: number;
  rightLegOpacity?: number;
}

/**
 * Resolves direction-aware vector character rig shapes for all 8 orientations:
 * 'front', 'front-left', 'front-right', 'left', 'right', 'back-left', 'back-right', 'back'.
 *
 * Parity with frontend editor directional rig resolver:
 * - Front: Full front face, both eyes, centered snout, front torso & belly patch.
 * - Front-Left / Front-Right: 3/4 perspective with shifted snout, foreshortened far eye, shifted belly patch.
 * - Left / Right: True profile with protruding side snout, single profile eye, profile ear, side belly & tail.
 * - Back-Left / Back-Right: Rear 3/4 perspective (no facial features, solid rear head, rear ears, rear torso with tail).
 * - Back: Full rear view (clean rear head with ears, NO facial features, solid back torso with cute round tail).
 */
export function resolveDirectionalRig(
  rig: VectorRigDefinition,
  pose: EvaluatedCharacterPose
): ResolvedDirectionalRig {
  const facing: CharacterFacingDirection = pose.facingDirection || 'front';
  const { parts } = rig;
  const isBear =
    rig.species?.toLowerCase() === 'bear' ||
    rig.id?.includes('pip') ||
    rig.id?.includes('bear');

  const headShapesRaw = parts.head.shapes || [];
  const torsoShapesRaw = parts.torso.shapes || [];

  const mainHeadShape = headShapesRaw.find(
    (s) => s.tag === 'face_base' || s.type === 'circle' || s.type === 'ellipse'
  );
  const headFurColor =
    mainHeadShape?.fill && mainHeadShape.fill !== 'none'
      ? mainHeadShape.fill
      : isBear
      ? '#b45309'
      : '#fed7aa';

  const mainTorsoShape = torsoShapesRaw.find(
    (s) => s.type === 'ellipse' || s.type === 'path' || s.type === 'rect'
  );
  const bodyFurColor =
    mainTorsoShape?.fill && mainTorsoShape.fill !== 'none'
      ? mainTorsoShape.fill
      : headFurColor;

  const anchors = extractFaceAnchors(rig);
  const eyeY = anchors.eyeY || -30;
  const snoutY = eyeY + 12;

  // ---------------------------------------------------------------------------
  // 1. HEAD RESOLUTION (All 8 Directions)
  // ---------------------------------------------------------------------------
  let headShapes: VectorPartShape[];

  if (facing === 'back') {
    // REAR VIEW: No eyes, eyebrows, nose, mouth, snout, cheeks, or visemes.
    // Ears show their solid back (no lighter inner ear patch).
    headShapes = headShapesRaw
      .filter((s) => {
        if (
          s.tag === 'eyes' ||
          s.tag === 'eyebrows' ||
          s.tag === 'nose' ||
          s.tag === 'mouth' ||
          s.tag === 'cheeks' ||
          s.tag === 'viseme'
        ) {
          return false;
        }
        if (
          s.type === 'circle' &&
          s.r !== undefined &&
          s.r <= 10 &&
          s.fill &&
          (s.fill === '#fde68a' || s.fill === '#fef3c7' || s.fill === '#ffffff')
        ) {
          return false;
        }
        if (
          s.type === 'ellipse' &&
          s.cy !== undefined &&
          Math.abs(s.cy - snoutY) <= 16 &&
          s.fill &&
          (s.fill === '#fef3c7' || s.fill === '#fde68a')
        ) {
          return false;
        }
        return true;
      })
      .map((s) => {
        if (s.tag === 'ears' && s.type === 'circle') {
          return { ...s, fill: headFurColor };
        }
        return s;
      });
  } else if (facing === 'back-left') {
    // REAR THREE-QUARTER LEFT:
    headShapes = headShapesRaw
      .filter((s) => {
        if (
          s.tag === 'eyes' ||
          s.tag === 'eyebrows' ||
          s.tag === 'nose' ||
          s.tag === 'mouth' ||
          s.tag === 'cheeks' ||
          s.tag === 'viseme'
        ) {
          return false;
        }
        if (
          s.type === 'circle' &&
          s.r !== undefined &&
          s.r <= 10 &&
          s.fill &&
          (s.fill === '#fde68a' || s.fill === '#fef3c7' || s.fill === '#ffffff')
        ) {
          return false;
        }
        if (
          s.type === 'ellipse' &&
          s.cy !== undefined &&
          Math.abs(s.cy - snoutY) <= 16 &&
          s.fill &&
          (s.fill === '#fef3c7' || s.fill === '#fde68a')
        ) {
          return false;
        }
        return true;
      })
      .map((s) => {
        if (s.tag === 'ears' && s.type === 'circle' && s.cx !== undefined) {
          const newCx = s.cx < 0 ? Math.round(s.cx - 4) : Math.round(s.cx - 8);
          const newR = s.cx > 0 && s.r ? Math.round(s.r * 0.8) : s.r;
          return { ...s, cx: newCx, r: newR, fill: headFurColor };
        }
        return s;
      });
  } else if (facing === 'back-right') {
    // REAR THREE-QUARTER RIGHT:
    headShapes = headShapesRaw
      .filter((s) => {
        if (
          s.tag === 'eyes' ||
          s.tag === 'eyebrows' ||
          s.tag === 'nose' ||
          s.tag === 'mouth' ||
          s.tag === 'cheeks' ||
          s.tag === 'viseme'
        ) {
          return false;
        }
        if (
          s.type === 'circle' &&
          s.r !== undefined &&
          s.r <= 10 &&
          s.fill &&
          (s.fill === '#fde68a' || s.fill === '#fef3c7' || s.fill === '#ffffff')
        ) {
          return false;
        }
        if (
          s.type === 'ellipse' &&
          s.cy !== undefined &&
          Math.abs(s.cy - snoutY) <= 16 &&
          s.fill &&
          (s.fill === '#fef3c7' || s.fill === '#fde68a')
        ) {
          return false;
        }
        return true;
      })
      .map((s) => {
        if (s.tag === 'ears' && s.type === 'circle' && s.cx !== undefined) {
          const newCx = s.cx > 0 ? Math.round(s.cx + 4) : Math.round(s.cx + 8);
          const newR = s.cx < 0 && s.r ? Math.round(s.r * 0.8) : s.r;
          return { ...s, cx: newCx, r: newR, fill: headFurColor };
        }
        return s;
      });
  } else if (facing === 'left') {
    // FULL SIDE PROFILE LEFT:
    const nonFace = headShapesRaw.filter((s) => {
      if (
        s.tag === 'eyes' ||
        s.tag === 'eyebrows' ||
        s.tag === 'nose' ||
        s.tag === 'mouth' ||
        s.tag === 'cheeks' ||
        s.tag === 'viseme'
      ) {
        return false;
      }
      if (s.tag === 'ears' && s.cx !== undefined && s.cx > 0) {
        return false;
      }
      if (
        s.type === 'ellipse' &&
        s.cy !== undefined &&
        Math.abs(s.cy - snoutY) <= 16 &&
        s.fill &&
        (s.fill === '#fef3c7' || s.fill === '#fde68a')
      ) {
        return false;
      }
      return true;
    }).map((s) => {
      if (s.tag === 'ears' && s.cx !== undefined && s.cx < 0) {
        return { ...s, cx: -8 };
      }
      return s;
    });

    const profileFeatures: VectorPartShape[] = [];

    if (isBear) {
      profileFeatures.push(
        {
          type: 'path',
          d: `M -22 ${eyeY - 2} C -38 ${eyeY} -48 ${eyeY + 8} -46 ${eyeY + 18} C -44 ${eyeY + 24} -32 ${eyeY + 26} -20 ${eyeY + 22} Z`,
          fill: '#fef3c7',
          stroke: '#d97706',
          strokeWidth: 1.4,
          strokeLinejoin: 'round',
          tag: 'snout',
        },
        {
          type: 'circle',
          cx: -44,
          cy: eyeY + 9,
          r: 3.8,
          fill: '#1e293b',
          tag: 'nose',
        },
        {
          type: 'circle',
          cx: -45,
          cy: eyeY + 8,
          r: 1.2,
          fill: '#ffffff',
          opacity: 0.7,
          tag: 'nose',
        },
        {
          type: 'path',
          d: `M -42 ${eyeY + 18} Q -32 ${eyeY + 21} -24 ${eyeY + 19}`,
          stroke: '#1e293b',
          strokeWidth: 2.2,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        }
      );
    } else {
      profileFeatures.push({
        type: 'path',
        d: `M -26 ${eyeY + 4} L -36 ${eyeY + 12} L -26 ${eyeY + 14}`,
        stroke: '#d97706',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        fill: 'none',
        tag: 'nose',
      });
    }

    profileFeatures.push(
      {
        type: 'ellipse',
        cx: -18,
        cy: eyeY - 2,
        rx: 4.8,
        ry: 5.6,
        fill: '#0f172a',
        tag: 'eyes',
      },
      {
        type: 'circle',
        cx: -19.5,
        cy: eyeY - 4,
        r: 1.8,
        fill: '#ffffff',
        tag: 'eyes',
      },
      {
        type: 'path',
        d: `M -24 ${eyeY - 11} Q -18 ${eyeY - 15} -12 ${eyeY - 11}`,
        stroke: anchors.browColor || '#78350f',
        strokeWidth: 2.4,
        strokeLinecap: 'round',
        fill: 'none',
        tag: 'eyebrows',
      },
      {
        type: 'ellipse',
        cx: -15,
        cy: eyeY + 12,
        rx: 6.5,
        ry: 4.0,
        fill: '#f87171',
        opacity: 0.45,
        tag: 'cheeks',
      }
    );

    headShapes = [...nonFace, ...profileFeatures];
  } else if (facing === 'right') {
    // FULL SIDE PROFILE RIGHT:
    const nonFace = headShapesRaw.filter((s) => {
      if (
        s.tag === 'eyes' ||
        s.tag === 'eyebrows' ||
        s.tag === 'nose' ||
        s.tag === 'mouth' ||
        s.tag === 'cheeks' ||
        s.tag === 'viseme'
      ) {
        return false;
      }
      if (s.tag === 'ears' && s.cx !== undefined && s.cx > 0) {
        return false;
      }
      if (
        s.type === 'ellipse' &&
        s.cy !== undefined &&
        Math.abs(s.cy - snoutY) <= 16 &&
        s.fill &&
        (s.fill === '#fef3c7' || s.fill === '#fde68a')
      ) {
        return false;
      }
      return true;
    }).map((s) => {
      if (s.tag === 'ears' && s.cx !== undefined && s.cx < 0) {
        return { ...s, cx: 8 };
      }
      return s;
    });

    const profileFeatures: VectorPartShape[] = [];

    if (isBear) {
      profileFeatures.push(
        {
          type: 'path',
          d: `M 22 ${eyeY - 2} C 38 ${eyeY} 48 ${eyeY + 8} 46 ${eyeY + 18} C 44 ${eyeY + 24} 32 ${eyeY + 26} 20 ${eyeY + 22} Z`,
          fill: '#fef3c7',
          stroke: '#d97706',
          strokeWidth: 1.4,
          strokeLinejoin: 'round',
          tag: 'snout',
        },
        {
          type: 'circle',
          cx: 44,
          cy: eyeY + 9,
          r: 3.8,
          fill: '#1e293b',
          tag: 'nose',
        },
        {
          type: 'circle',
          cx: 45,
          cy: eyeY + 8,
          r: 1.2,
          fill: '#ffffff',
          opacity: 0.7,
          tag: 'nose',
        },
        {
          type: 'path',
          d: `M 42 ${eyeY + 18} Q 32 ${eyeY + 21} 24 ${eyeY + 19}`,
          stroke: '#1e293b',
          strokeWidth: 2.2,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        }
      );
    } else {
      profileFeatures.push({
        type: 'path',
        d: `M 26 ${eyeY + 4} L 36 ${eyeY + 12} L 26 ${eyeY + 14}`,
        stroke: '#d97706',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        fill: 'none',
        tag: 'nose',
      });
    }

    profileFeatures.push(
      {
        type: 'ellipse',
        cx: 18,
        cy: eyeY - 2,
        rx: 4.8,
        ry: 5.6,
        fill: '#0f172a',
        tag: 'eyes',
      },
      {
        type: 'circle',
        cx: 19.5,
        cy: eyeY - 4,
        r: 1.8,
        fill: '#ffffff',
        tag: 'eyes',
      },
      {
        type: 'path',
        d: `M 24 ${eyeY - 11} Q 18 ${eyeY - 15} 12 ${eyeY - 11}`,
        stroke: anchors.browColor || '#78350f',
        strokeWidth: 2.4,
        strokeLinecap: 'round',
        fill: 'none',
        tag: 'eyebrows',
      },
      {
        type: 'ellipse',
        cx: 15,
        cy: eyeY + 12,
        rx: 6.5,
        ry: 4.0,
        fill: '#f87171',
        opacity: 0.45,
        tag: 'cheeks',
      }
    );

    headShapes = [...nonFace, ...profileFeatures];
  } else if (facing === 'front-left') {
    // 3/4 FRONT-LEFT:
    headShapes = getHeadShapesForPose(rig, pose).map((s) => {
      if (
        s.type === 'ellipse' &&
        s.cy !== undefined &&
        Math.abs(s.cy - snoutY) <= 16 &&
        s.fill &&
        (s.fill === '#fef3c7' || s.fill === '#fde68a')
      ) {
        return { ...s, cx: -10 };
      }
      if (s.tag === 'ears' && s.cx !== undefined) {
        return {
          ...s,
          cx: s.cx < 0 ? Math.round(s.cx - 3) : Math.round(s.cx - 6),
          r: s.cx > 0 && s.r ? Math.round(s.r * 0.85) : s.r,
        };
      }
      return s;
    });
  } else if (facing === 'front-right') {
    // 3/4 FRONT-RIGHT:
    headShapes = getHeadShapesForPose(rig, pose).map((s) => {
      if (
        s.type === 'ellipse' &&
        s.cy !== undefined &&
        Math.abs(s.cy - snoutY) <= 16 &&
        s.fill &&
        (s.fill === '#fef3c7' || s.fill === '#fde68a')
      ) {
        return { ...s, cx: 10 };
      }
      if (s.tag === 'ears' && s.cx !== undefined) {
        return {
          ...s,
          cx: s.cx > 0 ? Math.round(s.cx + 3) : Math.round(s.cx + 6),
          r: s.cx < 0 && s.r ? Math.round(s.r * 0.85) : s.r,
        };
      }
      return s;
    });
  } else {
    // FRONT: Canonical front view
    headShapes = getHeadShapesForPose(rig, pose);
  }

  // ---------------------------------------------------------------------------
  // 2. TORSO RESOLUTION
  // ---------------------------------------------------------------------------
  let torsoShapes: VectorPartShape[];
  const tailShapes: VectorPartShape[] = [];
  const isBackView = facing === 'back' || facing === 'back-left' || facing === 'back-right';

  if (isBackView) {
    torsoShapes = torsoShapesRaw.filter((s) => {
      if (s.tag === 'belly_patch' || s.tag === 'buttons' || s.tag === 'collar') {
        return false;
      }
      if (
        s.type === 'ellipse' &&
        s.cy !== undefined &&
        s.cy >= 20 &&
        s.fill &&
        (s.fill === '#fef3c7' || s.fill === '#fde68a')
      ) {
        return false;
      }
      if (
        s.type === 'circle' &&
        s.r !== undefined &&
        s.r <= 3.5 &&
        s.cy !== undefined &&
        s.cy >= 10 &&
        s.cy <= 35
      ) {
        return false;
      }
      return true;
    });

    const tailX = facing === 'back-left' ? -10 : facing === 'back-right' ? 10 : 0;
    tailShapes.push(
      {
        type: 'circle',
        cx: tailX,
        cy: 36,
        r: 9.0,
        fill: bodyFurColor,
        stroke: '#78350f',
        strokeWidth: 1.8,
        tag: 'tail',
      },
      {
        type: 'ellipse',
        cx: tailX,
        cy: 33.5,
        rx: 5.2,
        ry: 2.8,
        fill: '#ffffff',
        opacity: 0.22,
        tag: 'tail',
      }
    );
  } else if (facing === 'left') {
    torsoShapes = torsoShapesRaw.map((s) => {
      if (
        s.tag === 'belly_patch' ||
        (s.type === 'ellipse' &&
          s.cy !== undefined &&
          s.cy >= 20 &&
          s.fill &&
          (s.fill === '#fef3c7' || s.fill === '#fde68a'))
      ) {
        return {
          ...s,
          cx: -12,
          rx: s.rx ? Math.round(s.rx * 0.65) : 10,
        };
      }
      return s;
    });

    tailShapes.push({
      type: 'circle',
      cx: 28,
      cy: 32,
      r: 8.5,
      fill: bodyFurColor,
      stroke: '#78350f',
      strokeWidth: 1.6,
      tag: 'tail',
    });
  } else if (facing === 'right') {
    torsoShapes = torsoShapesRaw.map((s) => {
      if (
        s.tag === 'belly_patch' ||
        (s.type === 'ellipse' &&
          s.cy !== undefined &&
          s.cy >= 20 &&
          s.fill &&
          (s.fill === '#fef3c7' || s.fill === '#fde68a'))
      ) {
        return {
          ...s,
          cx: 12,
          rx: s.rx ? Math.round(s.rx * 0.65) : 10,
        };
      }
      return s;
    });

    tailShapes.push({
      type: 'circle',
      cx: -28,
      cy: 32,
      r: 8.5,
      fill: bodyFurColor,
      stroke: '#78350f',
      strokeWidth: 1.6,
      tag: 'tail',
    });
  } else if (facing === 'front-left') {
    torsoShapes = torsoShapesRaw.map((s) => {
      if (
        s.tag === 'belly_patch' ||
        (s.type === 'ellipse' &&
          s.cy !== undefined &&
          s.cy >= 20 &&
          s.fill &&
          (s.fill === '#fef3c7' || s.fill === '#fde68a'))
      ) {
        return { ...s, cx: -7 };
      }
      return s;
    });
  } else if (facing === 'front-right') {
    torsoShapes = torsoShapesRaw.map((s) => {
      if (
        s.tag === 'belly_patch' ||
        (s.type === 'ellipse' &&
          s.cy !== undefined &&
          s.cy >= 20 &&
          s.fill &&
          (s.fill === '#fef3c7' || s.fill === '#fde68a'))
      ) {
        return { ...s, cx: 7 };
      }
      return s;
    });
  } else {
    torsoShapes = torsoShapesRaw;
  }

  if (tailShapes.length > 0) {
    if (facing === 'back' || facing === 'back-left' || facing === 'back-right') {
      torsoShapes = [...torsoShapes, ...tailShapes];
    } else {
      torsoShapes = [...tailShapes, ...torsoShapes];
    }
  }

  // ---------------------------------------------------------------------------
  // 3. LIMBS VISIBILITY & OCCLUSION
  // ---------------------------------------------------------------------------
  let leftArmOpacity = 1.0;
  let rightArmOpacity = 1.0;
  let leftLegOpacity = 1.0;
  let rightLegOpacity = 1.0;

  if (facing === 'left') {
    rightArmOpacity = 0.25;
    rightLegOpacity = 0.7;
  } else if (facing === 'right') {
    leftArmOpacity = 0.25;
    leftLegOpacity = 0.7;
  }

  return {
    headShapes,
    torsoShapes,
    leftArmShapes: parts.leftArm.shapes || [],
    rightArmShapes: parts.rightArm.shapes || [],
    leftForearmShapes: parts.leftForearm?.shapes,
    rightForearmShapes: parts.rightForearm?.shapes,
    leftLegShapes: parts.leftLeg.shapes || [],
    rightLegShapes: parts.rightLeg.shapes || [],
    tailShapes,
    leftArmVisible: true,
    rightArmVisible: true,
    leftArmOpacity,
    rightArmOpacity,
    leftLegOpacity,
    rightLegOpacity,
  };
}
