import {
  CharacterInstance,
  AspectRatio,
  VectorRigDefinition,
  FormatVariantConfig,
} from '../manifest';

export type AspectRatioType = AspectRatio;
export type FormatVariant = FormatVariantConfig;

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
 * Used inside Remotion and manifest adapters to guarantee exact preview-to-render parity.
 */
export function calculateResponsiveCharacterPlacement(options: {
  instances: CharacterInstance[];
  format: AspectRatioType;
  canvasWidth?: number;
  canvasHeight?: number;
  formatVariants?: Partial<Record<AspectRatioType, FormatVariant>>;
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

  const placedResults: Array<ResolvedPlacedInstance | null> = new Array(instances.length).fill(null);
  const autoIndices: number[] = [];

  instances.forEach((inst, idx) => {
    const override = overrides[inst.instanceId];
    if (
      override &&
      (override.x !== undefined ||
        override.y !== undefined ||
        override.scale !== undefined ||
        override.rotation !== undefined ||
        override.flipX !== undefined ||
        override.facingDirection !== undefined ||
        override.zIndex !== undefined)
    ) {
      placedResults[idx] = {
        ...inst,
        x: override.x !== undefined ? Math.round(override.x * scaleRatioX) : Math.round(inst.x * scaleRatioX),
        y: override.y !== undefined ? Math.round(override.y * scaleRatioY) : Math.round(inst.y * scaleRatioY),
        scale: override.scale !== undefined ? Number((override.scale * scaleRatioX).toFixed(2)) : inst.scale,
        rotation: override.rotation !== undefined ? override.rotation : (inst.rotation ?? 0),
        flipX: override.flipX !== undefined ? override.flipX : Boolean(inst.flipX),
        facingDirection: override.facingDirection || inst.facingDirection || 'front',
        zIndex: override.zIndex !== undefined ? override.zIndex : (inst.zIndex ?? idx),
        isOverridden: true,
        isAutoPlaced: false,
      };
    } else {
      autoIndices.push(idx);
    }
  });

  if (autoIndices.length === 0) {
    return placedResults as ResolvedPlacedInstance[];
  }

  const groundY = Math.round(canvasHeight * 0.78);
  const base169GroundY = Math.round(720 * 0.78); // 562

  const safeMarginX = Math.round(canvasWidth * 0.12);
  const safeWidth = canvasWidth - 2 * safeMarginX;

  autoIndices.sort((a, b) => instances[a].x - instances[b].x);
  const autoCount = autoIndices.length;

  autoIndices.forEach((origIdx, orderRank) => {
    const inst = instances[origIdx];
    const rig = rigsMap[inst.characterId] || inst.customRig;
    const baseHeight = rig?.baseHeight || 220;
    const baseWidth = rig?.baseWidth || 160;

    const resFactor = canvasHeight / dims.height;
    let scale = (inst.scale ?? 1.0) * resFactor;
    if (format === '9:16') {
      if (autoCount === 1) {
        const targetH = canvasHeight * 0.36;
        scale = Number(Math.max(0.9 * resFactor, Math.min(1.5 * resFactor, targetH / baseHeight)).toFixed(2));
      } else {
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

    const charHeightPx = baseHeight * scale;
    const groundCenterY = groundY - charHeightPx / 2;

    const baseCharHeightPx = baseHeight * (inst.scale ?? 1.0);
    const baseCenterExpected = base169GroundY - baseCharHeightPx / 2;
    const baseOffsetFromGround = inst.y - baseCenterExpected;
    const responsiveY = Math.round(groundCenterY + baseOffsetFromGround * (canvasHeight / 720));

    let responsiveX: number;
    if (autoCount === 1) {
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
      const step = safeWidth / Math.max(1, autoCount - 1);
      responsiveX = Math.round(safeMarginX + orderRank * step);
    }

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
