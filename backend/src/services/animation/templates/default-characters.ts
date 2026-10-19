export interface VectorPartShape {
  d?: string;
  type?: 'path' | 'circle' | 'ellipse' | 'rect';
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'round' | 'butt' | 'square';
  strokeLinejoin?: 'round' | 'miter' | 'bevel';
  opacity?: number;
  transform?: string;
  tag?: 'face_base' | 'eyebrows' | 'eyes' | 'mouth' | 'nose' | 'hair' | 'ears' | 'accessories' | string;
}

export interface VectorRigPart {
  id: string;
  label: string;
  pivot: { x: number; y: number };
  zIndex: number;
  shapes: VectorPartShape[];
}

export interface VectorRigDefinition {
  id: string;
  name: string;
  species: string;
  viewBox: string;
  baseWidth: number;
  baseHeight: number;
  parts: {
    torso: VectorRigPart;
    head: VectorRigPart;
    leftArm: VectorRigPart;
    rightArm: VectorRigPart;
    leftForearm?: VectorRigPart;
    rightForearm?: VectorRigPart;
    leftLeg: VectorRigPart;
    rightLeg: VectorRigPart;
  };
}

export const PIP_THE_BEAR: VectorRigDefinition = {
  id: 'char-rig-pip-bear',
  name: 'Pip the Bear',
  species: 'Bear',
  viewBox: '-100 -160 200 240',
  baseWidth: 160,
  baseHeight: 220,
  parts: {
    torso: {
      id: 'torso',
      label: 'Torso',
      pivot: { x: 0, y: 15 },
      zIndex: 2,
      shapes: [
        { type: 'ellipse', cx: 0, cy: 16, rx: 34, ry: 42, fill: '#b45309' },
        { type: 'path', d: 'M -32 5 Q 0 -6 32 5 L 34 38 Q 0 45 -34 38 Z', fill: '#2563eb' },
        { type: 'path', d: 'M -18 3 Q 0 12 18 3', stroke: '#93c5fd', strokeWidth: 4, strokeLinecap: 'round', fill: 'none' },
        { type: 'ellipse', cx: 0, cy: 46, rx: 18, ry: 12, fill: '#fef3c7' },
      ],
    },
    head: {
      id: 'head',
      label: 'Head',
      pivot: { x: 0, y: -26 },
      zIndex: 4,
      shapes: [
        { type: 'circle', cx: -32, cy: -75, r: 15, fill: '#b45309', tag: 'face_base' },
        { type: 'circle', cx: -32, cy: -75, r: 8, fill: '#fde68a', tag: 'face_base' },
        { type: 'circle', cx: 32, cy: -75, r: 15, fill: '#b45309', tag: 'face_base' },
        { type: 'circle', cx: 32, cy: -75, r: 8, fill: '#fde68a', tag: 'face_base' },
        { type: 'ellipse', cx: 0, cy: -52, rx: 38, ry: 32, fill: '#d97706', tag: 'face_base' },
        { type: 'ellipse', cx: 0, cy: -44, rx: 20, ry: 15, fill: '#fef3c7', tag: 'face_base' },
        { type: 'path', d: 'M -6 -50 Q 0 -54 6 -50 Q 0 -44 -6 -50 Z', fill: '#1e293b', tag: 'nose' },
        { type: 'path', d: 'M -8 -40 Q 0 -34 8 -40', stroke: '#1e293b', strokeWidth: 2.5, strokeLinecap: 'round', fill: 'none', tag: 'mouth' },
        { type: 'circle', cx: -14, cy: -58, r: 4.5, fill: '#0f172a', tag: 'eyes' },
        { type: 'circle', cx: -15.5, cy: -60, r: 1.8, fill: '#ffffff', tag: 'eyes' },
        { type: 'circle', cx: 14, cy: -58, r: 4.5, fill: '#0f172a', tag: 'eyes' },
        { type: 'circle', cx: 12.5, cy: -60, r: 1.8, fill: '#ffffff', tag: 'eyes' },
        { type: 'ellipse', cx: -25, cy: -46, rx: 6, ry: 4, fill: '#f87171', opacity: 0.5, tag: 'face_base' },
        { type: 'ellipse', cx: 25, cy: -46, rx: 6, ry: 4, fill: '#f87171', opacity: 0.5, tag: 'face_base' },
      ],
    },
    leftArm: {
      id: 'leftArm',
      label: 'Left Arm',
      pivot: { x: -30, y: -4 },
      zIndex: 1,
      shapes: [
        { type: 'path', d: 'M -30 -4 Q -48 15 -38 34 Q -28 42 -22 32 Q -22 10 -30 -4 Z', fill: '#b45309' },
        { type: 'circle', cx: -30, cy: 32, r: 4, fill: '#fef3c7' },
      ],
    },
    rightArm: {
      id: 'rightArm',
      label: 'Right Upper Arm',
      pivot: { x: 30, y: -4 },
      zIndex: 3,
      shapes: [
        { type: 'path', d: 'M 30 -4 Q 43 0 43 14 L 36 20 Q 29 11 30 -4 Z', fill: '#b45309' },
      ],
    },
    rightForearm: {
      id: 'rightForearm',
      label: 'Right Forearm & Paw',
      pivot: { x: 39, y: 17 },
      zIndex: 4,
      shapes: [
        { type: 'path', d: 'M 39 14 Q 47 24 38 34 Q 29 40 23 31 L 33 18 Z', fill: '#b45309' },
        { type: 'circle', cx: 30, cy: 32, r: 4, fill: '#fef3c7' },
      ],
    },
    leftLeg: {
      id: 'leftLeg',
      label: 'Left Leg',
      pivot: { x: -18, y: 50 },
      zIndex: 1,
      shapes: [
        { type: 'path', d: 'M -26 50 L -24 82 Q -18 90 -8 88 Q -4 80 -10 50 Z', fill: '#92400e' },
        { type: 'path', d: 'M -27 82 Q -32 94 -16 94 Q -2 94 -4 84 Z', fill: '#1e293b' },
      ],
    },
    rightLeg: {
      id: 'rightLeg',
      label: 'Right Leg',
      pivot: { x: 18, y: 50 },
      zIndex: 1,
      shapes: [
        { type: 'path', d: 'M 10 50 L 12 82 Q 18 90 28 88 Q 32 80 26 50 Z', fill: '#92400e' },
        { type: 'path', d: 'M 4 84 Q 2 94 16 94 Q 32 94 27 82 Z', fill: '#1e293b' },
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
        { type: 'path', d: 'M -28 0 Q 0 -8 28 0 L 26 42 Q 0 46 -26 42 Z', fill: '#f59e0b' },
        { type: 'circle', cx: 0, cy: 18, r: 8, fill: '#ef4444' },
        { type: 'rect', x: -24, y: 42, width: 48, height: 12, fill: '#1d4ed8' },
      ],
    },
    head: {
      id: 'head',
      label: 'Head',
      pivot: { x: 0, y: -26 },
      zIndex: 4,
      shapes: [
        { type: 'ellipse', cx: 0, cy: -54, rx: 30, ry: 28, fill: '#fed7aa', tag: 'face_base' },
        { type: 'path', d: 'M -34 -60 Q -36 -90 0 -92 Q 36 -90 34 -60 Q 24 -70 12 -72 Q 0 -66 -10 -72 Q -24 -70 -34 -60 Z', fill: '#78350f', tag: 'hair' },
        { type: 'path', d: 'M -22 -68 Q -10 -58 0 -68 Q 12 -58 24 -68', stroke: '#78350f', strokeWidth: 4, strokeLinecap: 'round', fill: 'none', tag: 'hair' },
        { type: 'circle', cx: -12, cy: -54, r: 5, fill: '#0f172a', tag: 'eyes' },
        { type: 'circle', cx: -13.5, cy: -56, r: 2, fill: '#ffffff', tag: 'eyes' },
        { type: 'circle', cx: 12, cy: -54, r: 5, fill: '#0f172a', tag: 'eyes' },
        { type: 'circle', cx: 10.5, cy: -56, r: 2, fill: '#ffffff', tag: 'eyes' },
        { type: 'path', d: 'M -8 -38 Q 0 -30 8 -38', stroke: '#b91c1c', strokeWidth: 3, strokeLinecap: 'round', fill: 'none', tag: 'mouth' },
      ],
    },
    leftArm: {
      id: 'leftArm',
      label: 'Left Arm',
      pivot: { x: -28, y: -4 },
      zIndex: 1,
      shapes: [
        { type: 'path', d: 'M -26 -4 Q -42 12 -34 32 Q -24 38 -18 30 Q -18 8 -26 -4 Z', fill: '#fed7aa' },
        { type: 'path', d: 'M -28 -4 Q -40 6 -32 14 L -20 8 Z', fill: '#f59e0b' },
      ],
    },
    rightArm: {
      id: 'rightArm',
      label: 'Right Upper Arm',
      pivot: { x: 28, y: -4 },
      zIndex: 3,
      shapes: [
        { type: 'path', d: 'M 26 -4 Q 39 0 38 14 L 31 19 Q 24 9 26 -4 Z', fill: '#fed7aa' },
        { type: 'path', d: 'M 28 -4 Q 40 6 34 14 L 25 8 Z', fill: '#f59e0b' },
      ],
    },
    rightForearm: {
      id: 'rightForearm',
      label: 'Right Forearm',
      pivot: { x: 34, y: 14 },
      zIndex: 4,
      shapes: [
        { type: 'path', d: 'M 34 12 Q 43 21 34 31 Q 27 36 21 29 L 28 16 Z', fill: '#fed7aa' },
      ],
    },
    leftLeg: {
      id: 'leftLeg',
      label: 'Left Leg',
      pivot: { x: -16, y: 54 },
      zIndex: 1,
      shapes: [
        { type: 'path', d: 'M -24 54 L -20 84 L -8 84 L -8 54 Z', fill: '#1d4ed8' },
        { type: 'path', d: 'M -26 84 Q -30 94 -14 94 Q -4 94 -6 84 Z', fill: '#dc2626' },
        { type: 'rect', x: -26, y: 91, width: 22, height: 3, fill: '#ffffff' },
      ],
    },
    rightLeg: {
      id: 'rightLeg',
      label: 'Right Leg',
      pivot: { x: 16, y: 54 },
      zIndex: 1,
      shapes: [
        { type: 'path', d: 'M 8 54 L 8 84 L 20 84 L 24 54 Z', fill: '#1d4ed8' },
        { type: 'path', d: 'M 6 84 Q 4 94 14 94 Q 30 94 26 84 Z', fill: '#dc2626' },
        { type: 'rect', x: 4, y: 91, width: 22, height: 3, fill: '#ffffff' },
      ],
    },
  },
};

export const EARTH_THE_PLANET: VectorRigDefinition = {
  id: 'char-rig-earth-planet',
  name: 'Terra the Earth',
  species: 'Planet',
  viewBox: '-100 -160 200 240',
  baseWidth: 160,
  baseHeight: 200,
  parts: {
    torso: {
      id: 'torso',
      label: 'Torso',
      pivot: { x: 0, y: 0 },
      zIndex: 2,
      shapes: [],
    },
    head: {
      id: 'head',
      label: 'Globe',
      pivot: { x: 0, y: -40 },
      zIndex: 4,
      shapes: [
        // Atmosphere soft glow
        { type: 'circle', cx: 0, cy: -40, r: 52, fill: '#38bdf8', opacity: 0.22, tag: 'face_base' },
        { type: 'circle', cx: 0, cy: -40, r: 49, fill: '#60a5fa', opacity: 0.28, tag: 'face_base' },
        // Deep vibrant ocean globe
        { type: 'circle', cx: 0, cy: -40, r: 46, fill: '#1d4ed8', tag: 'face_base' },
        // Continents / Green Landmasses
        // North-West continent (North America stylized)
        {
          type: 'path',
          d: 'M -32 -60 Q -18 -74 -4 -64 Q -8 -48 -22 -44 Q -32 -48 -32 -60 Z',
          fill: '#10b981',
          tag: 'face_base',
        },
        // South-West continent (South America stylized)
        {
          type: 'path',
          d: 'M -26 -34 Q -14 -32 -10 -16 Q -20 -4 -28 -14 Q -30 -26 -26 -34 Z',
          fill: '#059669',
          tag: 'face_base',
        },
        // North-East continent (Eurasia stylized)
        {
          type: 'path',
          d: 'M 6 -68 Q 30 -72 38 -54 Q 30 -40 16 -46 Q 4 -52 6 -68 Z',
          fill: '#10b981',
          tag: 'face_base',
        },
        // South-East continent (Africa / Australia stylized)
        {
          type: 'path',
          d: 'M 10 -38 Q 28 -34 32 -18 Q 22 -6 12 -16 Q 8 -26 10 -38 Z',
          fill: '#059669',
          tag: 'face_base',
        },
        // Swirling white clouds
        {
          type: 'path',
          d: 'M -28 -68 Q 0 -60 26 -70',
          stroke: '#ffffff',
          strokeWidth: 3,
          strokeLinecap: 'round',
          opacity: 0.45,
          fill: 'none',
          tag: 'face_base',
        },
        {
          type: 'path',
          d: 'M -18 -8 Q 10 -14 28 -8',
          stroke: '#ffffff',
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          opacity: 0.4,
          fill: 'none',
          tag: 'face_base',
        },
        // Cute blush cheeks on globe
        { type: 'ellipse', cx: -26, cy: -34, rx: 7, ry: 4.5, fill: '#f43f5e', opacity: 0.45, tag: 'face_base' },
        { type: 'ellipse', cx: 26, cy: -34, rx: 7, ry: 4.5, fill: '#f43f5e', opacity: 0.45, tag: 'face_base' },
        // Eyebrows
        {
          type: 'path',
          d: 'M -21 -55 Q -14 -60 -7 -55',
          stroke: '#0f172a',
          strokeWidth: 2.8,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        {
          type: 'path',
          d: 'M 7 -55 Q 14 -60 21 -55',
          stroke: '#0f172a',
          strokeWidth: 2.8,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'eyebrows',
        },
        // Eyes: Big friendly cartoon eyes
        { type: 'ellipse', cx: -14, cy: -44, rx: 6, ry: 7, fill: '#ffffff', tag: 'eyes' },
        { type: 'circle', cx: -14, cy: -44, r: 4.5, fill: '#0f172a', tag: 'eyes' },
        { type: 'circle', cx: -15.5, cy: -46.5, r: 1.8, fill: '#ffffff', tag: 'eyes' },
        { type: 'circle', cx: -12.5, cy: -42, r: 1.0, fill: '#ffffff', tag: 'eyes' },
        { type: 'ellipse', cx: 14, cy: -44, rx: 6, ry: 7, fill: '#ffffff', tag: 'eyes' },
        { type: 'circle', cx: 14, cy: -44, r: 4.5, fill: '#0f172a', tag: 'eyes' },
        { type: 'circle', cx: 12.5, cy: -46.5, r: 1.8, fill: '#ffffff', tag: 'eyes' },
        { type: 'circle', cx: 15.5, cy: -42, r: 1.0, fill: '#ffffff', tag: 'eyes' },
        // Nose: cute stylized button nose
        { type: 'circle', cx: 0, cy: -36, r: 2.8, fill: '#38bdf8', tag: 'nose' },
        {
          type: 'path',
          d: 'M -2 -34.5 Q 0 -33 2 -34.5',
          stroke: '#0284c7',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
          fill: 'none',
          tag: 'nose',
        },
        // Mouth: Friendly open smile
        {
          type: 'path',
          d: 'M -10 -26 Q 0 -17 10 -26 Q 0 -22 -10 -26 Z',
          fill: '#be123c',
          stroke: '#9f1239',
          strokeWidth: 1.5,
          tag: 'mouth',
        },
        {
          type: 'path',
          d: 'M -5 -21 Q 0 -18 5 -21 Q 0 -24 -5 -21 Z',
          fill: '#fda4af',
          tag: 'mouth',
        },
      ],
    },
    leftArm: {
      id: 'leftArm',
      label: 'Left Arm & Glove',
      pivot: { x: -50, y: -35 },
      zIndex: 1,
      shapes: [
        { type: 'circle', cx: -54, cy: -32, r: 9, fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1.5 },
        { type: 'ellipse', cx: -60, cy: -36, rx: 4, ry: 3, fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1.2 },
      ],
    },
    rightArm: {
      id: 'rightArm',
      label: 'Right Upper Arm',
      pivot: { x: 50, y: -35 },
      zIndex: 3,
      shapes: [
        { type: 'circle', cx: 54, cy: -32, r: 9, fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1.5 },
        { type: 'ellipse', cx: 60, cy: -36, rx: 4, ry: 3, fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1.2 },
      ],
    },
    leftLeg: {
      id: 'leftLeg',
      label: 'Left Leg',
      pivot: { x: 0, y: 0 },
      zIndex: 1,
      shapes: [],
    },
    rightLeg: {
      id: 'rightLeg',
      label: 'Right Leg',
      pivot: { x: 0, y: 0 },
      zIndex: 1,
      shapes: [],
    },
  },
};

export const DEFAULT_VECTOR_RIGS: Record<string, VectorRigDefinition> = {
  [PIP_THE_BEAR.id]: PIP_THE_BEAR,
  [SAMMY_THE_KID.id]: SAMMY_THE_KID,
  [EARTH_THE_PLANET.id]: EARTH_THE_PLANET,
  pip_the_bear: PIP_THE_BEAR,
  sammy_the_kid: SAMMY_THE_KID,
  earth_the_planet: EARTH_THE_PLANET,
  pip: PIP_THE_BEAR,
  sammy: SAMMY_THE_KID,
  earth: EARTH_THE_PLANET,
  terra: EARTH_THE_PLANET,
  planet: EARTH_THE_PLANET,
};

export function getVectorRig(rigId?: string): VectorRigDefinition {
  if (rigId && DEFAULT_VECTOR_RIGS[rigId]) {
    return DEFAULT_VECTOR_RIGS[rigId];
  }
  return PIP_THE_BEAR;
}

