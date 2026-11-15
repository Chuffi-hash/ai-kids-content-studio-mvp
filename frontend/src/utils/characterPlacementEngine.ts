import {
  CharacterInstance,
  AspectRatioType,
  VectorRigDefinition,
  VectorSceneData,
} from '../types/animation';

export interface ResolvedPlacedInstance extends CharacterInstance {
  isOverridden: boolean;
  isAutoPlaced: boolean;
}

/**
 * Returns standard editing canvas dimensions for each aspect ratio.
 */
export function getCanvasDimensions(format: AspectRatioType = '16:9'): { width: number; height: number } {
  switch (format) {
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 720, height: 720 };
    case '4:5':
      return { width: 720, height: 900 };
    case '16:9':
    default:
      return { width: 1280, height: 720 };
  }
}

/**
 * Calculates responsive character placement across aspect ratios (16:9, 9:16, 1:1, 4:5).
 *
 * Replaces hardcoded multipliers and fixed thresholds with a responsive system based on:
 * - Composition dimensions (width & height per aspect ratio)
 * - Ground anchor alignment (feet naturally rest on the ground plane, preventing floating or cropping)
 * - Character count (1, 2, 3+ characters with collision avoidance)
 * - Proportional horizontal safe margins
 * - Strict preservation of manually configured format overrides
 */
export function calculateResponsiveCharacterPlacement(options: {
  instances: CharacterInstance[];
  format: AspectRatioType;
  canvasWidth?: number;
  canvasHeight?: number;
  formatVariants?: VectorSceneData['formatVariants'];
  rigsMap?: Record<string, VectorRigDefinition>;
}): ResolvedPlacedInstance[] {
  const { instances, format, formatVariants, rigsMap = {} } = options;
  const dims = getCanvasDimensions(format);
  const canvasWidth = options.canvasWidth || dims.width;
  const canvasHeight = options.canvasHeight || dims.height;

  if (!instances || instances.length === 0) return [];

  const formatVariant = formatVariants?.[format];
  const overrides = formatVariant?.characterOverrides || {};

  const refW = formatVariant?.width || dims.width;
  const refH = formatVariant?.height || dims.height;
  const scaleRatioX = canvasWidth / refW;
  const scaleRatioY = canvasHeight / refH;

  // For 16:9 base composition, base instances are canonical
  if (format === '16:9') {
    const s = canvasWidth / 1280;
    return instances.map((inst) => ({
      ...inst,
      x: Math.round(inst.x * s),
      y: Math.round(inst.y * s),
      scale: Number(((inst.scale ?? 1.0) * (s !== 1 ? s : 1)).toFixed(2)),
      isOverridden: false,
      isAutoPlaced: false,
    }));
  }

  // 1. Separate overridden instances from auto-placement candidates
  const placedResults: Array<ResolvedPlacedInstance | null> = new Array(instances.length).fill(null);
  const autoIndices: number[] = [];

  instances.forEach((inst, idx) => {
    const override = overrides[inst.instanceId];
    if (override && (override.x !== undefined || override.y !== undefined || override.scale !== undefined || override.facingDirection !== undefined)) {
      placedResults[idx] = {
        ...inst,
        x: override.x !== undefined ? Math.round(override.x * scaleRatioX) : Math.round(inst.x * scaleRatioX),
        y: override.y !== undefined ? Math.round(override.y * scaleRatioY) : Math.round(inst.y * scaleRatioY),
        scale: override.scale !== undefined ? Number((override.scale * scaleRatioX).toFixed(2)) : inst.scale,
        rotation: override.rotation !== undefined ? override.rotation : (inst.rotation ?? 0),
        flipX: override.flipX !== undefined ? override.flipX : Boolean(inst.flipX),
        facingDirection: override.facingDirection || inst.facingDirection || 'front',
        isOverridden: true,
        isAutoPlaced: false,
      };
    } else {
      autoIndices.push(idx);
    }
  });

  // If all instances have manual overrides, return directly
  if (autoIndices.length === 0) {
    return placedResults as ResolvedPlacedInstance[];
  }

  // 2. Responsive ground anchor calculation
  // In standard storybook composition, ground contact line is at ~78% of canvas height
  const groundY = Math.round(canvasHeight * 0.78);
  const base169GroundY = Math.round(720 * 0.78); // 562

  // 3. Proportional horizontal safe area
  const safeMarginX = Math.round(canvasWidth * 0.12);
  const safeWidth = canvasWidth - 2 * safeMarginX;

  // Sort auto indices by their original 16:9 X positions to preserve left-to-right order
  autoIndices.sort((a, b) => instances[a].x - instances[b].x);

  const autoCount = autoIndices.length;

  autoIndices.forEach((origIdx, orderRank) => {
    const inst = instances[origIdx];
    const rig = rigsMap[inst.characterId] || inst.customRig;
    const baseHeight = rig?.baseHeight || 220;
    const baseWidth = rig?.baseWidth || 160;

    // Responsive scale factor based on resolution vs standard reference
    const resFactor = canvasHeight / dims.height;
    let scale = (inst.scale ?? 1.0) * resFactor;
    if (format === '9:16') {
      if (autoCount === 1) {
        // Single character: occupies ~36% of vertical canvas height
        const targetH = canvasHeight * 0.36;
        scale = Number(Math.max(0.9 * resFactor, Math.min(1.5 * resFactor, targetH / baseHeight)).toFixed(2));
      } else {
        // Multiple characters: fit side-by-side without overflowing safe area
        const maxFitScale = (safeWidth / Math.max(2, autoCount)) / (baseWidth * 0.9);
        scale = Number(Math.max(0.7 * resFactor, Math.min((inst.scale ?? 1.0) * 1.15 * resFactor, maxFitScale)).toFixed(2));
      }
    } else if (format === '1:1') {
      const targetH = canvasHeight * 0.44;
      scale = Number(Math.max(0.85 * resFactor, Math.min(1.25 * resFactor, (targetH / baseHeight) * (inst.scale ?? 1.0))).toFixed(2));
    } else if (format === '4:5') {
      const targetH = canvasHeight * 0.40;
      scale = Number(Math.max(0.85 * resFactor, Math.min(1.3 * resFactor, (targetH / baseHeight) * (inst.scale ?? 1.0))).toFixed(2));
    }

    // Responsive Y position: feet anchored to ground contact line
    const charHeightPx = baseHeight * scale;
    const groundCenterY = groundY - charHeightPx / 2;

    // Preserve intentional vertical offsets from 16:9 ground (e.g. jumping, flying, elevated)
    const baseCharHeightPx = baseHeight * (inst.scale ?? 1.0);
    const baseCenterExpected = base169GroundY - baseCharHeightPx / 2;
    const baseOffsetFromGround = inst.y - baseCenterExpected;
    const responsiveY = Math.round(groundCenterY + baseOffsetFromGround * (canvasHeight / 720));

    // Responsive X position
    let responsiveX: number;
    if (autoCount === 1) {
      // Single character centered, with proportional offset from 16:9 center (640)
      const xNorm = (inst.x - 640) / 640;
      responsiveX = Math.round(canvasWidth / 2 + xNorm * (safeWidth / 2));
    } else if (autoCount === 2) {
      // Two characters: dynamic balanced placement based on rig width & safe margins
      const charWidth = baseWidth * scale;
      const spacing = Math.max(40, (safeWidth - charWidth * 2) / 3);
      responsiveX = orderRank === 0
        ? Math.round(safeMarginX + charWidth / 2 + spacing)
        : Math.round(canvasWidth - safeMarginX - charWidth / 2 - spacing);
    } else {
      // 3+ characters: evenly distributed across safe area in left-to-right order
      const step = safeWidth / Math.max(1, autoCount - 1);
      responsiveX = Math.round(safeMarginX + orderRank * step);
    }

    // Facing direction and flip:
    // If two conversational characters, right character faces left towards left character if unspecified
    let flipX = Boolean(inst.flipX);
    if (autoCount === 2 && inst.flipX === undefined && orderRank === 1) {
      flipX = true;
    }

    placedResults[origIdx] = {
      ...inst,
      x: responsiveX,
      y: responsiveY,
      scale,
      rotation: inst.rotation ?? 0,
      flipX,
      facingDirection: inst.facingDirection || 'front',
      isOverridden: false,
      isAutoPlaced: true,
    };
  });

  return placedResults as ResolvedPlacedInstance[];
}

/**
 * Resolves the effective character instance for the given aspect ratio,
 * taking format overrides into account.
 */
export function resolveEffectiveCharacterInstance(
  baseInst: CharacterInstance,
  animationData: VectorSceneData,
  format: AspectRatioType = '16:9',
  rigsMap?: Record<string, VectorRigDefinition>
): ResolvedPlacedInstance {
  const allPlaced = calculateResponsiveCharacterPlacement({
    instances: animationData.characterInstances || [],
    format,
    formatVariants: animationData.formatVariants,
    rigsMap,
  });

  const found = allPlaced.find((i) => i.instanceId === baseInst.instanceId);
  if (found) return found;

  return {
    ...baseInst,
    isOverridden: false,
    isAutoPlaced: false,
  };
}

export interface CharacterTransformUpdates {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  facingDirection?: any;
  flipX?: boolean;
  zIndex?: number;
}

/**
 * Centralized character transform mutator.
 * Guarantees unified transform behavior across inspector and canvas gizmo:
 * - 16:9 updates canonical scene characterInstance (and adjusts any motion paths proportionally)
 * - 9:16, 1:1, 4:5 updates format-specific characterOverrides
 * Never overwrites another format's manual placement.
 */
export function applyCharacterTransform(options: {
  animationData: VectorSceneData;
  instanceId: string;
  updates: CharacterTransformUpdates;
  format: AspectRatioType;
  canvasWidth?: number;
  canvasHeight?: number;
}): VectorSceneData {
  const { animationData, instanceId, updates, format } = options;
  const dims = getCanvasDimensions(format);
  const canvasWidth = options.canvasWidth || dims.width;
  const canvasHeight = options.canvasHeight || dims.height;

  if (format === '16:9') {
    const rawInstances = animationData.characterInstances || [];
    const baseInst = rawInstances.find((i) => i.instanceId === instanceId);

    let updatedClips = animationData.animationClips || [];
    if (baseInst && (updates.x !== undefined || updates.y !== undefined)) {
      const dx = (updates.x !== undefined ? updates.x : baseInst.x) - baseInst.x;
      const dy = (updates.y !== undefined ? updates.y : baseInst.y) - baseInst.y;
      if (dx !== 0 || dy !== 0) {
        updatedClips = updatedClips.map((c) => {
          if (c.instanceId === instanceId && c.motionPath) {
            return {
              ...c,
              motionPath: {
                ...c.motionPath,
                startX: Math.round(c.motionPath.startX + dx),
                startY: Math.round(c.motionPath.startY + dy),
                endX: Math.round(c.motionPath.endX + dx),
                endY: Math.round(c.motionPath.endY + dy),
              },
            };
          }
          return c;
        });
      }
    }

    const updatedInstances = rawInstances.map((inst) =>
      inst.instanceId === instanceId
        ? {
            ...inst,
            ...(updates.x !== undefined ? { x: updates.x } : {}),
            ...(updates.y !== undefined ? { y: updates.y } : {}),
            ...(updates.scale !== undefined ? { scale: updates.scale } : {}),
            ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
            ...(updates.facingDirection !== undefined ? { facingDirection: updates.facingDirection } : {}),
            ...(updates.flipX !== undefined ? { flipX: updates.flipX } : {}),
            ...(updates.zIndex !== undefined ? { zIndex: updates.zIndex } : {}),
          }
        : inst
    );

    return {
      ...animationData,
      characterInstances: updatedInstances,
      animationClips: updatedClips,
    };
  } else {
    // Non-16:9 format override
    const currentVariants = animationData.formatVariants || {};
    const currentVariant = currentVariants[format] || {
      aspectRatio: format,
      width: canvasWidth,
      height: canvasHeight,
      characterOverrides: {},
    };
    const currentOverrides = currentVariant.characterOverrides || {};
    const existingOverride = currentOverrides[instanceId] || {};

    const updatedOverrides = {
      ...currentOverrides,
      [instanceId]: {
        ...existingOverride,
        ...(updates.x !== undefined ? { x: updates.x } : {}),
        ...(updates.y !== undefined ? { y: updates.y } : {}),
        ...(updates.scale !== undefined ? { scale: updates.scale } : {}),
        ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
        ...(updates.facingDirection !== undefined ? { facingDirection: updates.facingDirection } : {}),
        ...(updates.flipX !== undefined ? { flipX: updates.flipX } : {}),
        ...(updates.zIndex !== undefined ? { zIndex: updates.zIndex } : {}),
      },
    };

    return {
      ...animationData,
      formatVariants: {
        ...currentVariants,
        [format]: {
          ...currentVariant,
          aspectRatio: format,
          width: canvasWidth,
          height: canvasHeight,
          characterOverrides: updatedOverrides,
        },
      },
    };
  }
}

/**
 * Resets a character's placement to automatic ground-anchored layout.
 * For non-16:9: removes the format override for the instance.
 * For 16:9: recalculates natural ground contact position.
 */
export function resetCharacterToAutoLayout(options: {
  animationData: VectorSceneData;
  instanceId: string;
  format: AspectRatioType;
  rigsMap?: Record<string, VectorRigDefinition>;
}): VectorSceneData {
  const { animationData, instanceId, format } = options;

  if (format !== '16:9') {
    const currentVariants = animationData.formatVariants || {};
    const currentVariant = currentVariants[format];
    if (!currentVariant || !currentVariant.characterOverrides?.[instanceId]) {
      return animationData;
    }

    const { [instanceId]: _, ...remainingOverrides } = currentVariant.characterOverrides;

    return {
      ...animationData,
      formatVariants: {
        ...currentVariants,
        [format]: {
          ...currentVariant,
          characterOverrides: remainingOverrides,
        },
      },
    };
  } else {
    // In 16:9: reset position to default ground line (y = ~480, x spaced evenly)
    const rawInstances = animationData.characterInstances || [];
    const idx = rawInstances.findIndex((i) => i.instanceId === instanceId);
    if (idx < 0) return animationData;

    const total = rawInstances.length;
    const defaultX = total === 1 ? 640 : Math.round(320 + (idx / Math.max(1, total - 1)) * 640);
    const defaultY = 480;

    const updatedInstances = rawInstances.map((inst, i) =>
      i === idx ? { ...inst, x: defaultX, y: defaultY, scale: 1.0, rotation: 0 } : inst
    );

    return {
      ...animationData,
      characterInstances: updatedInstances,
    };
  }
}

