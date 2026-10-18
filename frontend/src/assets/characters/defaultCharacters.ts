import { VectorRigDefinition } from '../../types/animation';

export const PIP_THE_BEAR: VectorRigDefinition = {
  id: 'char-rig-pip-bear',
  name: 'Pip the Bear',
  species: 'Bear',
  viewBox: '-100 -160 200 240',
  baseWidth: 160,
  baseHeight: 220,
  parts: {
    // Torso: Center anchor, contains body, belly, and colorful shirt
    torso: {
      id: 'torso',
      label: 'Torso',
      pivot: { x: 0, y: 15 },
      zIndex: 2,
      shapes: [
        // Main bear body
        {
          type: 'ellipse',
          cx: 0,
          cy: 16,
          rx: 34,
          ry: 42,
          fill: '#b45309', // Warm bear brown
        },
        // Cute blue t-shirt
        {
          type: 'path',
          d: 'M -32 5 Q 0 -6 32 5 L 34 38 Q 0 45 -34 38 Z',
          fill: '#2563eb', // Royal blue shirt
        },
        // Shirt collar stripe
        {
          type: 'path',
          d: 'M -18 3 Q 0 12 18 3',
          stroke: '#93c5fd',
          strokeWidth: 4,
          strokeLinecap: 'round',
          fill: 'none',
        },
        // Light belly patch under shirt
        {
          type: 'ellipse',
          cx: 0,
          cy: 46,
          rx: 18,
          ry: 12,
          fill: '#fef3c7', // Cream belly
        },
      ],
    },

    // Head: Connected at neck pivot (0, -26)
    head: {
      id: 'head',
      label: 'Head',
      pivot: { x: 0, y: -26 },
      zIndex: 4,
      shapes: [
        // Left Ear
        {
          type: 'circle',
          cx: -32,
          cy: -75,
          r: 15,
          fill: '#b45309',
          tag: 'face_base',
        },
        {
          type: 'circle',
          cx: -32,
          cy: -75,
          r: 8,
          fill: '#fde68a', // Inner ear
          tag: 'face_base',
        },
        // Right Ear
        {
          type: 'circle',
          cx: 32,
          cy: -75,
          r: 15,
          fill: '#b45309',
          tag: 'face_base',
        },
        {
          type: 'circle',
          cx: 32,
          cy: -75,
          r: 8,
          fill: '#fde68a', // Inner ear
          tag: 'face_base',
        },
        // Head Base
        {
          type: 'ellipse',
          cx: 0,
          cy: -52,
          rx: 38,
          ry: 32,
          fill: '#d97706', // Slightly lighter brown face
          tag: 'face_base',
        },
        // Muzzle / Snout
        {
          type: 'ellipse',
          cx: 0,
          cy: -44,
          rx: 20,
          ry: 15,
          fill: '#fef3c7', // Cream snout
          tag: 'face_base',
        },
        // Nose
        {
          type: 'path',
          d: 'M -6 -50 Q 0 -54 6 -50 Q 0 -44 -6 -50 Z',
          fill: '#1e293b',
          tag: 'nose',
        },
        // Mouth Smile
        {
          type: 'path',
          d: 'M -8 -40 Q 0 -34 8 -40',
          stroke: '#1e293b',
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        },
        // Left Eye
        {
          type: 'circle',
          cx: -14,
          cy: -58,
          r: 4.5,
          fill: '#0f172a',
          tag: 'eyes',
        },
        {
          type: 'circle',
          cx: -15.5,
          cy: -60,
          r: 1.8,
          fill: '#ffffff', // Eye glint
          tag: 'eyes',
        },
        // Right Eye
        {
          type: 'circle',
          cx: 14,
          cy: -58,
          r: 4.5,
          fill: '#0f172a',
          tag: 'eyes',
        },
        {
          type: 'circle',
          cx: 12.5,
          cy: -60,
          r: 1.8,
          fill: '#ffffff', // Eye glint
          tag: 'eyes',
        },
        // Blush cheeks
        {
          type: 'ellipse',
          cx: -25,
          cy: -46,
          rx: 6,
          ry: 4,
          fill: '#f87171',
          opacity: 0.5,
          tag: 'face_base',
        },
        {
          type: 'ellipse',
          cx: 25,
          cy: -46,
          rx: 6,
          ry: 4,
          fill: '#f87171',
          opacity: 0.5,
          tag: 'face_base',
        },
      ],
    },

    // Left Arm (Character's left, viewer's right when facing forward, or background arm)
    leftArm: {
      id: 'leftArm',
      label: 'Left Arm',
      pivot: { x: -30, y: -4 },
      zIndex: 1, // Behind torso
      shapes: [
        // Upper arm and paw
        {
          type: 'path',
          d: 'M -30 -4 Q -48 15 -38 34 Q -28 42 -22 32 Q -22 10 -30 -4 Z',
          fill: '#b45309',
        },
        // Paw pads
        {
          type: 'circle',
          cx: -30,
          cy: 32,
          r: 4,
          fill: '#fef3c7',
        },
      ],
    },

    // Right Arm (Character's right, viewer's front arm for waving)
    rightArm: {
      id: 'rightArm',
      label: 'Right Upper Arm',
      pivot: { x: 30, y: -4 },
      zIndex: 3, // In front of torso
      shapes: [
        {
          type: 'path',
          d: 'M 30 -4 Q 43 0 43 14 L 36 20 Q 29 11 30 -4 Z',
          fill: '#b45309',
        },
      ],
    },
    rightForearm: {
      id: 'rightForearm',
      label: 'Right Forearm & Paw',
      pivot: { x: 39, y: 17 },
      zIndex: 4,
      shapes: [
        {
          type: 'path',
          d: 'M 39 14 Q 47 24 38 34 Q 29 40 23 31 L 33 18 Z',
          fill: '#b45309',
        },
        { type: 'circle', cx: 30, cy: 32, r: 4, fill: '#fef3c7' },
      ],
    },

    // Left Leg
    leftLeg: {
      id: 'leftLeg',
      label: 'Left Leg',
      pivot: { x: -18, y: 50 },
      zIndex: 1,
      shapes: [
        // Leg
        {
          type: 'path',
          d: 'M -26 50 L -24 82 Q -18 90 -8 88 Q -4 80 -10 50 Z',
          fill: '#92400e',
        },
        // Shoe / Foot
        {
          type: 'path',
          d: 'M -27 82 Q -32 94 -16 94 Q -2 94 -4 84 Z',
          fill: '#1e293b',
        },
      ],
    },

    // Right Leg
    rightLeg: {
      id: 'rightLeg',
      label: 'Right Leg',
      pivot: { x: 18, y: 50 },
      zIndex: 1,
      shapes: [
        // Leg
        {
          type: 'path',
          d: 'M 10 50 L 12 82 Q 18 90 28 88 Q 32 80 26 50 Z',
          fill: '#92400e',
        },
        // Shoe / Foot
        {
          type: 'path',
          d: 'M 4 84 Q 2 94 16 94 Q 32 94 27 82 Z',
          fill: '#1e293b',
        },
      ],
    },
  },
};

export const SAMMY_THE_KID: VectorRigDefinition = {
  id: 'char-rig-sammy-kid',
  name: 'Sammy the Kid',
  species: 'Human',
  viewBox: '-100 -160 200 240',
  baseWidth: 150,
  baseHeight: 220,
  parts: {
    torso: {
      id: 'torso',
      label: 'Torso',
      pivot: { x: 0, y: 15 },
      zIndex: 2,
      shapes: [
        // Yellow hoodie/t-shirt
        {
          type: 'path',
          d: 'M -28 0 Q 0 -8 28 0 L 26 42 Q 0 46 -26 42 Z',
          fill: '#f59e0b', // Amber/Yellow
        },
        // Chest star logo
        {
          type: 'circle',
          cx: 0,
          cy: 18,
          r: 8,
          fill: '#ef4444',
        },
        // Blue jeans waistband
        {
          type: 'rect',
          x: -24,
          y: 42,
          width: 48,
          height: 12,
          fill: '#1d4ed8',
        },
      ],
    },
    head: {
      id: 'head',
      label: 'Head',
      pivot: { x: 0, y: -26 },
      zIndex: 4,
      shapes: [
        // Head skin
        {
          type: 'ellipse',
          cx: 0,
          cy: -54,
          rx: 30,
          ry: 28,
          fill: '#fed7aa', // Light peach skin
          tag: 'face_base',
        },
        // Messy cartoon hair
        {
          type: 'path',
          d: 'M -34 -60 Q -36 -90 0 -92 Q 36 -90 34 -60 Q 24 -70 12 -72 Q 0 -66 -10 -72 Q -24 -70 -34 -60 Z',
          fill: '#78350f', // Brown hair
          tag: 'hair',
        },
        // Hair bangs
        {
          type: 'path',
          d: 'M -22 -68 Q -10 -58 0 -68 Q 12 -58 24 -68',
          stroke: '#78350f',
          strokeWidth: 4,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'hair',
        },
        // Big cartoon eyes
        {
          type: 'circle',
          cx: -12,
          cy: -54,
          r: 5,
          fill: '#0f172a',
          tag: 'eyes',
        },
        {
          type: 'circle',
          cx: -13.5,
          cy: -56,
          r: 2,
          fill: '#ffffff',
          tag: 'eyes',
        },
        {
          type: 'circle',
          cx: 12,
          cy: -54,
          r: 5,
          fill: '#0f172a',
          tag: 'eyes',
        },
        {
          type: 'circle',
          cx: 10.5,
          cy: -56,
          r: 2,
          fill: '#ffffff',
          tag: 'eyes',
        },
        // Cheerful mouth
        {
          type: 'path',
          d: 'M -8 -38 Q 0 -30 8 -38',
          stroke: '#b91c1c',
          strokeWidth: 3,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'mouth',
        },
      ],
    },
    leftArm: {
      id: 'leftArm',
      label: 'Left Arm',
      pivot: { x: -28, y: -4 },
      zIndex: 1,
      shapes: [
        {
          type: 'path',
          d: 'M -26 -4 Q -42 12 -34 32 Q -24 38 -18 30 Q -18 8 -26 -4 Z',
          fill: '#fed7aa',
        },
        // Shirt sleeve
        {
          type: 'path',
          d: 'M -28 -4 Q -40 6 -32 14 L -20 8 Z',
          fill: '#f59e0b',
        },
      ],
    },
    rightArm: {
      id: 'rightArm',
      label: 'Right Upper Arm',
      pivot: { x: 28, y: -4 },
      zIndex: 3,
      shapes: [
        {
          type: 'path',
          d: 'M 26 -4 Q 39 0 38 14 L 31 19 Q 24 9 26 -4 Z',
          fill: '#fed7aa',
        },
        // Shirt sleeve
        {
          type: 'path',
          d: 'M 28 -4 Q 40 6 34 14 L 25 8 Z',
          fill: '#f59e0b',
        },
      ],
    },
    rightForearm: {
      id: 'rightForearm',
      label: 'Right Forearm',
      pivot: { x: 34, y: 14 },
      zIndex: 4,
      shapes: [
        {
          type: 'path',
          d: 'M 34 12 Q 43 21 34 31 Q 27 36 21 29 L 28 16 Z',
          fill: '#fed7aa',
        },
      ],
    },
    leftLeg: {
      id: 'leftLeg',
      label: 'Left Leg',
      pivot: { x: -16, y: 54 },
      zIndex: 1,
      shapes: [
        // Blue jeans
        {
          type: 'path',
          d: 'M -24 54 L -20 84 L -8 84 L -8 54 Z',
          fill: '#1d4ed8',
        },
        // Red sneaker
        {
          type: 'path',
          d: 'M -26 84 Q -30 94 -14 94 Q -4 94 -6 84 Z',
          fill: '#dc2626',
        },
        // Sneaker white sole
        {
          type: 'rect',
          x: -26,
          y: 91,
          width: 22,
          height: 3,
          fill: '#ffffff',
        },
      ],
    },
    rightLeg: {
      id: 'rightLeg',
      label: 'Right Leg',
      pivot: { x: 16, y: 54 },
      zIndex: 1,
      shapes: [
        // Blue jeans
        {
          type: 'path',
          d: 'M 8 54 L 8 84 L 20 84 L 24 54 Z',
          fill: '#1d4ed8',
        },
        // Red sneaker
        {
          type: 'path',
          d: 'M 6 84 Q 4 94 14 94 Q 30 94 26 84 Z',
          fill: '#dc2626',
        },
        // Sneaker white sole
        {
          type: 'rect',
          x: 4,
          y: 91,
          width: 22,
          height: 3,
          fill: '#ffffff',
        },
      ],
    },
  },
};

export const DEFAULT_VECTOR_RIGS: Record<string, VectorRigDefinition> = {
  [PIP_THE_BEAR.id]: PIP_THE_BEAR,
  [SAMMY_THE_KID.id]: SAMMY_THE_KID,
  pip_the_bear: PIP_THE_BEAR,
  sammy_the_kid: SAMMY_THE_KID,
  pip: PIP_THE_BEAR,
  sammy: SAMMY_THE_KID,
};

export function getVectorRig(rigId?: string): VectorRigDefinition {
  if (rigId && DEFAULT_VECTOR_RIGS[rigId]) {
    return DEFAULT_VECTOR_RIGS[rigId];
  }
  return PIP_THE_BEAR;
}
