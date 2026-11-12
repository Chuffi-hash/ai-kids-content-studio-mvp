import React, { useRef, useMemo } from "react";
import {
  VectorSceneData,
  CharacterInstance,
  AnimationClip,
  MotionPath,
  EducationalOverlay,
  AspectRatioType,
} from "../../../types/animation";
import { getVectorRig } from "../../../assets/characters/defaultCharacters";
import { buildRigFromAppearance } from "../../../utils/customCharacterRig";
import { evaluateCharacterPose } from "../../../utils/animationEngine";
import { VectorCharacterRenderer } from "./VectorCharacterRenderer";
import { TransformGizmo } from "./TransformGizmo";
import { OverlayGizmo } from "./OverlayGizmo";
import { renderEducationalOverlayXml } from "../../../utils/educationalOverlayRenderer";
import { resolveAssetUrl } from "../../../utils/urlHelper";

interface VectorSceneCanvasProps {
  animationData: VectorSceneData;
  currentTimeMs: number;
  sceneStartMs: number;
  sceneDurationMs?: number;
  activeFormat?: AspectRatioType;
  selectedInstanceId: string | null;
  onSelectInstance: (instanceId: string | null) => void;
  onUpdateInstance: (
    instanceId: string,
    updates: Partial<CharacterInstance>,
  ) => void;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  onUpdateOverlay?: (
    overlayId: string,
    updates: Partial<EducationalOverlay>,
  ) => void;
  onUpdateAnimationData?: (newData: VectorSceneData) => void;
}

export const VectorSceneCanvas: React.FC<VectorSceneCanvasProps> = ({
  animationData,
  currentTimeMs,
  sceneStartMs,
  sceneDurationMs,
  activeFormat,
  selectedInstanceId,
  onSelectInstance,
  onUpdateInstance,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlay,
  onUpdateAnimationData,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const effectiveFormat: AspectRatioType = activeFormat || "16:9";
  const canvasWidth =
    effectiveFormat === "9:16"
      ? 720
      : effectiveFormat === "1:1"
        ? 720
        : effectiveFormat === "4:5"
          ? 720
          : 1280;
  const canvasHeight =
    effectiveFormat === "9:16"
      ? 1280
      : effectiveFormat === "1:1"
        ? 720
        : effectiveFormat === "4:5"
          ? 900
          : 720;

  const sceneRelativeMs = Math.max(0, currentTimeMs - sceneStartMs);
  const rawInstances = animationData.characterInstances || [];
  const clips = animationData.animationClips || [];
  const rawOverlays = animationData.overlays || [];

  const formatVariant = animationData.formatVariants?.[effectiveFormat];
  const characterOverrides = formatVariant?.characterOverrides;

  const mapBaseXToFormat = (x: number, format: AspectRatioType, w: number): number => {
    if (format === '16:9') return x;
    const xOffset = x - 640;
    return Math.round(w / 2 + xOffset * (w / 1280));
  };

  const mapBaseYToFormat = (y: number, format: AspectRatioType, h: number): number => {
    if (format === '16:9') return y;
    return Math.round(y * (h / 720));
  };

  const mapFormatXToBase = (x: number, format: AspectRatioType, w: number): number => {
    if (format === '16:9') return x;
    const norm = (x - w / 2) / (w / 1280);
    return Math.round(640 + norm);
  };

  const mapFormatYToBase = (y: number, format: AspectRatioType, h: number): number => {
    if (format === '16:9') return y;
    return Math.round(y / (h / 720));
  };

  // Non-destructive format variant mapping
  const instances = rawInstances.map((inst, instIdx, arr) => {
    const override = characterOverrides?.[inst.instanceId];
    if (override) {
      let ox = override.x !== undefined ? override.x : inst.x;
      let oy = override.y !== undefined ? override.y : inst.y;
      // Auto-recovery across all aspect ratios: ensure characters never float in the sky
      if (effectiveFormat === "9:16" && (oy < 680 || oy > 1150)) {
        oy = Math.round(canvasHeight * 0.65);
      } else if (effectiveFormat === "1:1" && (oy < 350 || oy > 650)) {
        oy = Math.round(canvasHeight * 0.68);
      } else if (effectiveFormat === "4:5" && (oy < 450 || oy > 850)) {
        oy = Math.round(canvasHeight * 0.68);
      }
      return {
        ...inst,
        x: ox,
        y: oy,
        scale: override.scale !== undefined ? override.scale : inst.scale,
        rotation: override.rotation !== undefined ? override.rotation : inst.rotation,
        flipX: override.flipX !== undefined ? override.flipX : inst.flipX,
        facingDirection: override.facingDirection || inst.facingDirection || 'front',
      };
    }

    const rawScale = inst.scale || 1.0;
    const isSingleChar = arr.length === 1;

    if (effectiveFormat === "9:16") {
      const scaleMult = isSingleChar ? 1.55 : 1.35;
      const boostedScale = Number((rawScale * scaleMult).toFixed(2));
      let newX = mapBaseXToFormat(inst.x, effectiveFormat, canvasWidth);
      let newY = Math.round(inst.y * (canvasHeight / 720));
      // Ground anchor across 9:16
      if (newY < 680 || newY > 1150) {
        newY = Math.round(canvasHeight * 0.65);
      }
      if (arr.length === 2) {
        newX = instIdx === 0 ? Math.round(canvasWidth * 0.35) : Math.round(canvasWidth * 0.65);
      }

      return {
        ...inst,
        x: Math.round(newX),
        y: newY,
        scale: boostedScale,
      };
    }
    if (effectiveFormat === "1:1") {
      let newX = mapBaseXToFormat(inst.x, effectiveFormat, canvasWidth);
      let newY = mapBaseYToFormat(inst.y, effectiveFormat, canvasHeight);
      if (newY < 350 || newY > 650) {
        newY = Math.round(canvasHeight * 0.68);
      }
      if (arr.length === 2) {
        newX = instIdx === 0 ? Math.round(canvasWidth * 0.36) : Math.round(canvasWidth * 0.64);
      }
      const scaleMult = isSingleChar ? 1.25 : 1.15;
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(newY),
        scale: Number((rawScale * scaleMult).toFixed(2)),
      };
    }
    if (effectiveFormat === "4:5") {
      let newX = mapBaseXToFormat(inst.x, effectiveFormat, canvasWidth);
      let newY = mapBaseYToFormat(inst.y, effectiveFormat, canvasHeight);
      if (newY < 450 || newY > 850) {
        newY = Math.round(canvasHeight * 0.68);
      }
      if (arr.length === 2) {
        newX = instIdx === 0 ? Math.round(canvasWidth * 0.35) : Math.round(canvasWidth * 0.65);
      }
      const scaleMult = isSingleChar ? 1.35 : 1.22;
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(newY),
        scale: Number((rawScale * scaleMult).toFixed(2)),
      };
    }
    return inst;
  });

  // Dynamically map motion paths of animation clips to current format dimensions and anchored instance coordinates
  const scaledClips: AnimationClip[] = useMemo(() => {
    if (effectiveFormat === '16:9') return clips;
    return clips.map((clip) => {
      if (clip.motionPath) {
        const baseInst = rawInstances.find((i) => i.instanceId === clip.instanceId);
        const curInst = instances.find((i) => i.instanceId === clip.instanceId);
        if (baseInst && curInst) {
          const deltaStartX = (clip.motionPath.startX - baseInst.x) * (canvasWidth / 1280);
          const deltaEndX = (clip.motionPath.endX - baseInst.x) * (canvasWidth / 1280);
          const deltaStartY = (clip.motionPath.startY - baseInst.y) * (canvasHeight / 720);
          const deltaEndY = (clip.motionPath.endY - baseInst.y) * (canvasHeight / 720);
          return {
            ...clip,
            motionPath: {
              ...clip.motionPath,
              startX: Math.round(curInst.x + deltaStartX),
              startY: Math.round(curInst.y + deltaStartY),
              endX: Math.round(curInst.x + deltaEndX),
              endY: Math.round(curInst.y + deltaEndY),
            },
          };
        }
        return {
          ...clip,
          motionPath: {
            ...clip.motionPath,
            startX: mapBaseXToFormat(clip.motionPath.startX, effectiveFormat, canvasWidth),
            startY: mapBaseYToFormat(clip.motionPath.startY, effectiveFormat, canvasHeight),
            endX: mapBaseXToFormat(clip.motionPath.endX, effectiveFormat, canvasWidth),
            endY: mapBaseYToFormat(clip.motionPath.endY, effectiveFormat, canvasHeight),
          },
        };
      }
      return clip;
    });
  }, [clips, instances, rawInstances, effectiveFormat, canvasWidth, canvasHeight]);

  const overlays = rawOverlays.map((o) => {
    const override = formatVariant?.overlayOverrides?.[o.id];
    if (override) {
      return {
        ...o,
        x: override.x !== undefined ? override.x : o.x,
        y: override.y !== undefined ? override.y : o.y,
      };
    }
    if (effectiveFormat === "9:16") {
      if (o.type === "title_card") {
        return { ...o, x: canvasWidth / 2, y: o.y > 450 ? Math.round(canvasHeight * 0.78) : o.y };
      }
      if (o.type === "spotlight" || o.type === "glow" || o.type === "sparkles") {
        const xOffset = o.x - 640;
        const newX = canvasWidth / 2 + xOffset * (canvasWidth / 1280);
        const yRatio = o.y / 720;
        return { ...o, x: Math.round(newX), y: Math.round(yRatio * canvasHeight) };
      }
    }
    if (effectiveFormat === "1:1" || effectiveFormat === "4:5") {
      if (o.type === "title_card") {
        return { ...o, x: canvasWidth / 2, y: Math.round((o.y / 720) * canvasHeight) };
      }
      if (o.type === "spotlight" || o.type === "glow" || o.type === "sparkles") {
        const xOffset = o.x - 640;
        const newX = canvasWidth / 2 + xOffset * (canvasWidth / 1280);
        const yRatio = o.y / 720;
        return { ...o, x: Math.round(newX), y: Math.round(yRatio * canvasHeight) };
      }
    }
    return o;
  });

  const belowCharacterOverlays = overlays.filter(
    (o) =>
      o.layerPosition === "below_characters" ||
      (o.zIndex !== undefined && o.zIndex < 0),
  );
  const aboveCharacterOverlays = overlays.filter(
    (o) =>
      o.layerPosition !== "below_characters" &&
      (o.zIndex === undefined || o.zIndex >= 0),
  );
  const selectedOverlay =
    overlays.find((o) => o.id === selectedOverlayId) || null;

  // Sort instances by zIndex ascending
  const sortedInstances = [...instances].sort(
    (a, b) => (a.zIndex || 0) - (b.zIndex || 0),
  );

  // Find currently selected instance
  const selectedInstance =
    instances.find((i) => i.instanceId === selectedInstanceId) || null;

  // Find if selected instance has an active motion path clip (using format-scaled coordinates)
  let selectedMotionPath: MotionPath | null = null;
  if (selectedInstance) {
    const activeClip = scaledClips.find(
      (c) =>
        c.instanceId === selectedInstance.instanceId &&
        c.action === "walk" &&
        c.motionMode === "motion_path",
    );
    if (activeClip && activeClip.motionPath) {
      selectedMotionPath = activeClip.motionPath;
    }
  }

  // Handle clicking on background to deselect
  const handleSvgClick = (e: React.MouseEvent) => {
    const targetEl = e.target as Element;
    if (
      targetEl === svgRef.current ||
      targetEl.id === "scene-background-rect" ||
      targetEl.id === "scene-background-image" ||
      targetEl.id === "scene-background-backdrop"
    ) {
      onSelectInstance(null);
      onSelectOverlay?.(null);
    }
  };

  const handleUpdateMotionPath = (newPath: MotionPath) => {
    if (!selectedInstance || !onUpdateAnimationData) return;
    const baseInst = rawInstances.find((i) => i.instanceId === selectedInstance.instanceId);
    let basePath: MotionPath;
    if (baseInst && effectiveFormat !== '16:9') {
      const deltaStartX = (newPath.startX - selectedInstance.x) / (canvasWidth / 1280);
      const deltaEndX = (newPath.endX - selectedInstance.x) / (canvasWidth / 1280);
      const deltaStartY = (newPath.startY - selectedInstance.y) / (canvasHeight / 720);
      const deltaEndY = (newPath.endY - selectedInstance.y) / (canvasHeight / 720);
      basePath = {
        ...newPath,
        startX: Math.round(baseInst.x + deltaStartX),
        startY: Math.round(baseInst.y + deltaStartY),
        endX: Math.round(baseInst.x + deltaEndX),
        endY: Math.round(baseInst.y + deltaEndY),
      };
    } else {
      basePath = newPath;
    }
    const updatedClips = clips.map((c) => {
      if (c.instanceId === selectedInstance.instanceId && c.action === "walk") {
        return {
          ...c,
          motionMode: "motion_path" as const,
          motionPath: basePath,
        };
      }
      return c;
    });
    onUpdateAnimationData({
      ...animationData,
      animationClips: updatedClips,
    });
  };

  const handleInstanceTransformUpdate = (
    instanceId: string,
    updates: Partial<CharacterInstance>,
  ) => {
    if (effectiveFormat !== "16:9") {
      const currentVariants = animationData.formatVariants || {};
      const currentVariant = currentVariants[effectiveFormat] || {
        aspectRatio: effectiveFormat,
        width: canvasWidth,
        height: canvasHeight,
        characterOverrides: {},
      };
      const currentOverrides = currentVariant.characterOverrides || {};
      const updatedOverrides = {
        ...currentOverrides,
        [instanceId]: {
          ...(currentOverrides[instanceId] || {}),
          ...(updates.x !== undefined ? { x: updates.x } : {}),
          ...(updates.y !== undefined ? { y: updates.y } : {}),
          ...(updates.scale !== undefined ? { scale: updates.scale } : {}),
          ...(updates.flipX !== undefined ? { flipX: updates.flipX } : {}),
          ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
          ...(updates.facingDirection !== undefined ? { facingDirection: updates.facingDirection } : {}),
        },
      };
      if (onUpdateAnimationData) {
        onUpdateAnimationData({
          ...animationData,
          formatVariants: {
            ...currentVariants,
            [effectiveFormat]: {
              ...currentVariant,
              aspectRatio: effectiveFormat,
              width: canvasWidth,
              height: canvasHeight,
              characterOverrides: updatedOverrides,
            },
          },
        });
      }
    } else {
      // In 16:9 mode: update instance, and if character has a motion path, shift motion path by (dx, dy)
      const baseInst = rawInstances.find((i) => i.instanceId === instanceId);
      if (baseInst && onUpdateAnimationData && (updates.x !== undefined || updates.y !== undefined)) {
        const dx = (updates.x !== undefined ? updates.x : baseInst.x) - baseInst.x;
        const dy = (updates.y !== undefined ? updates.y : baseInst.y) - baseInst.y;
        if (dx !== 0 || dy !== 0) {
          const updatedClips = clips.map((c) => {
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
          const updatedInstances = rawInstances.map((i) =>
            i.instanceId === instanceId ? { ...i, ...updates } : i
          );
          onUpdateAnimationData({
            ...animationData,
            characterInstances: updatedInstances,
            animationClips: updatedClips,
          });
          return;
        }
      }
      onUpdateInstance(instanceId, updates);
    }
  };

  const durationMs = sceneDurationMs || (animationData as any).durationMs || 5000;
  const effectiveSec = Math.max(1.5, durationMs / 1000);
  const t = Math.max(0, Math.min(1, (sceneRelativeMs / 1000) / effectiveSec));
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  const normalizeCameraMovement = (raw?: string): string => {
    if (!raw) return 'static';
    const clean = raw.toLowerCase().trim().replace(/[-_]+/g, ' ');
    if (clean.includes('push in') || clean.includes('slow zoom in') || clean.includes('zoom in')) {
      return 'slow_zoom_in';
    }
    if (clean.includes('pull out') || clean.includes('slow zoom out') || clean.includes('zoom out')) {
      return 'zoom_out';
    }
    if (clean.includes('pan left')) return 'pan_left';
    if (clean.includes('pan right')) return 'pan_right';
    if (clean.includes('tilt up')) return 'tilt_up';
    if (clean.includes('tilt down')) return 'tilt_down';
    if (clean.includes('tracking') || clean.includes('truck')) return 'tracking';
    if (clean.includes('dolly')) return 'dolly';
    return 'static';
  };

  const moveStr = (animationData.cameraMovement || '').toLowerCase().trim();
  const canonicalMovement = normalizeCameraMovement(animationData.cameraMovement);
  const rotStr = (animationData.cameraRotation || '').toLowerCase().trim();
  const rotDegrees = typeof animationData.cameraRotationDegrees === 'number' && Number.isFinite(animationData.cameraRotationDegrees)
    ? Math.max(0, Math.min(45, animationData.cameraRotationDegrees))
    : 10;

  let scale = 1.0;
  let dx = 0;
  let dy = 0;
  let rotationDeg = 0;

  if (canonicalMovement === 'slow_zoom_in') {
    scale = 1.0 + 0.15 * t;
  } else if (canonicalMovement === 'zoom_out') {
    scale = 1.15 - 0.15 * t;
  } else if (canonicalMovement === 'pan_left') {
    scale = 1.12;
    dx = (t - 0.5) * (canvasWidth * 0.08);
  } else if (canonicalMovement === 'pan_right') {
    scale = 1.12;
    dx = (0.5 - t) * (canvasWidth * 0.08);
  } else if (canonicalMovement === 'tilt_up') {
    scale = 1.12;
    dy = (t - 0.5) * (canvasHeight * 0.08);
  } else if (canonicalMovement === 'tilt_down') {
    scale = 1.12;
    dy = (0.5 - t) * (canvasHeight * 0.08);
  } else if (canonicalMovement === 'tracking') {
    scale = 1.10;
    dx = (t - 0.5) * (canvasWidth * 0.10);
  } else if (canonicalMovement === 'dolly') {
    scale = 1.0 + 0.20 * t;
  }

  let isClockwise = rotStr.includes('clockwise') && !rotStr.includes('anti') && !rotStr.includes('counter');
  let isAnticlockwise = rotStr.includes('anti') || rotStr.includes('counter');
  if (!isClockwise && !isAnticlockwise) {
    if (moveStr.includes('clockwise') && !moveStr.includes('anti') && !moveStr.includes('counter')) {
      isClockwise = true;
    } else if (moveStr.includes('anticlockwise') || moveStr.includes('counterclockwise')) {
      isAnticlockwise = true;
    }
  }

  if (isClockwise) {
    rotationDeg = t * rotDegrees;
    scale = Math.max(scale, 1.12);
  } else if (isAnticlockwise) {
    rotationDeg = -t * rotDegrees;
    scale = Math.max(scale, 1.12);
  }

  scale = Number(scale.toFixed(4));
  dx = Number(dx.toFixed(2));
  dy = Number(dy.toFixed(2));
  rotationDeg = Number(rotationDeg.toFixed(2));

  const cameraTransform = `translate(${cx + dx}, ${cy + dy}) rotate(${rotationDeg}) scale(${scale}) translate(${-cx}, ${-cy})`;
  const isBgRemoved = Boolean(animationData.background?.removed);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      className="vector-scene-svg-canvas"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        backgroundColor: "#090d16",
      }}
      onClick={handleSvgClick}
    >
      <defs>
        {/* Subtle ground shadow gradient */}
        <radialGradient id="char-shadow-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>

        {/* Storybook Procedural Landscape Gradients (matches Remotion Renderer) */}
        <linearGradient id="editorSkyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="65%" stopColor="#bae6fd" />
          <stop offset="100%" stopColor="#d9f99d" />
        </linearGradient>
        <radialGradient id="editorSunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.8" />
          <stop offset="40%" stopColor="#fde047" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#fde047" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="editorHillBackGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
        <linearGradient id="editorGroundGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#166534" />
        </linearGradient>
      </defs>

      {/* Scene Camera Root (Syncs camera motion and 2D roll across all stage elements) */}
      <g id="scene-camera-root" transform={cameraTransform}>

      {/* 1. Background Layer */}
      {!isBgRemoved && animationData.background?.imageUrl ? (
        <g id="scene-background-group">
          <rect
            id="scene-background-backdrop"
            width={canvasWidth}
            height={canvasHeight}
            fill="#090d16"
          />
          <image
            id="scene-background-image"
            href={resolveAssetUrl(animationData.background.imageUrl)}
            x={0}
            y={0}
            width={canvasWidth}
            height={canvasHeight}
            preserveAspectRatio={
              animationData.background.fit === "contain"
                ? "xMidYMid meet"
                : "xMidYMid slice"
            }
          />
        </g>
      ) : !isBgRemoved ? (
        /* Storybook Procedural Backdrop (Exact Parity with Remotion Renderer) */
        <g id="default-storybook-background">
          <rect width={canvasWidth} height={canvasHeight} fill="url(#editorSkyGrad)" />
          {/* Glowing Sun */}
          <circle
            cx={Math.round(canvasWidth * 0.82)}
            cy={Math.round(canvasHeight * 0.22)}
            r={Math.round(Math.min(canvasWidth, canvasHeight) * 0.18)}
            fill="url(#editorSunGlow)"
          />
          <circle
            cx={Math.round(canvasWidth * 0.82)}
            cy={Math.round(canvasHeight * 0.22)}
            r={Math.round(Math.min(canvasWidth, canvasHeight) * 0.08)}
            fill="#fde047"
            opacity={0.95}
          />
          {/* Fluffy Storybook Clouds */}
          <g opacity={0.75} fill="#ffffff">
            <ellipse cx={Math.round(canvasWidth * 0.25)} cy={Math.round(canvasHeight * 0.20)} rx={Math.round(canvasWidth * 0.09)} ry={Math.round(canvasHeight * 0.045)} />
            <ellipse cx={Math.round(canvasWidth * 0.29)} cy={Math.round(canvasHeight * 0.17)} rx={Math.round(canvasWidth * 0.06)} ry={Math.round(canvasHeight * 0.04)} />
            <ellipse cx={Math.round(canvasWidth * 0.21)} cy={Math.round(canvasHeight * 0.19)} rx={Math.round(canvasWidth * 0.05)} ry={Math.round(canvasHeight * 0.035)} />
            <ellipse cx={Math.round(canvasWidth * 0.62)} cy={Math.round(canvasHeight * 0.28)} rx={Math.round(canvasWidth * 0.075)} ry={Math.round(canvasHeight * 0.038)} />
            <ellipse cx={Math.round(canvasWidth * 0.66)} cy={Math.round(canvasHeight * 0.26)} rx={Math.round(canvasWidth * 0.05)} ry={Math.round(canvasHeight * 0.032)} />
          </g>
          {/* Back Green Hill */}
          <path
            d={`M 0 ${Math.round(canvasHeight * 0.68)} Q ${Math.round(canvasWidth * 0.3)} ${Math.round(canvasHeight * 0.58)} ${Math.round(canvasWidth * 0.65)} ${Math.round(canvasHeight * 0.65)} T ${canvasWidth} ${Math.round(canvasHeight * 0.62)} L ${canvasWidth} ${canvasHeight} L 0 ${canvasHeight} Z`}
            fill="url(#editorHillBackGrad)"
            opacity={0.85}
          />
          {/* Front Rolling Green Ground */}
          <path
            d={`M 0 ${Math.round(canvasHeight * 0.72)} Q ${Math.round(canvasWidth * 0.45)} ${Math.round(canvasHeight * 0.68)} ${canvasWidth} ${Math.round(canvasHeight * 0.72)} L ${canvasWidth} ${canvasHeight} L 0 ${canvasHeight} Z`}
            fill="url(#editorGroundGrad)"
          />
          {/* Flowers on the grass */}
          <circle cx={Math.round(canvasWidth * 0.12)} cy={Math.round(canvasHeight * 0.72 + 12)} r={4} fill="#fde047" opacity={0.9} />
          <circle cx={Math.round(canvasWidth * 0.28)} cy={Math.round(canvasHeight * 0.72 + 18)} r={3.5} fill="#f43f5e" opacity={0.85} />
          <circle cx={Math.round(canvasWidth * 0.52)} cy={Math.round(canvasHeight * 0.72 + 14)} r={4} fill="#ffffff" opacity={0.9} />
          <circle cx={Math.round(canvasWidth * 0.74)} cy={Math.round(canvasHeight * 0.72 + 20)} r={3.5} fill="#fbbf24" opacity={0.85} />
          <circle cx={Math.round(canvasWidth * 0.88)} cy={Math.round(canvasHeight * 0.72 + 15)} r={4} fill="#ec4899" opacity={0.9} />
        </g>
      ) : (
        /* Neutral Studio Stage (When background is explicitly removed) */
        <g id="default-stylized-background">
          <rect
            id="scene-background-rect"
            width={canvasWidth}
            height={canvasHeight}
            fill="#101726"
          />
          <line
            x1={0}
            y1={Math.round(canvasHeight * 0.75)}
            x2={canvasWidth}
            y2={Math.round(canvasHeight * 0.75)}
            stroke="#1e293b"
            strokeWidth={2}
          />
          <rect
            x={0}
            y={Math.round(canvasHeight * 0.75)}
            width={canvasWidth}
            height={canvasHeight - Math.round(canvasHeight * 0.75)}
            fill="#0d131f"
            opacity={0.6}
          />
        </g>
      )}

      {/* 2. Below-Characters Overlays Layer */}
      {belowCharacterOverlays.map((overlay) => {
        const svgXml = renderEducationalOverlayXml(overlay, sceneRelativeMs);
        if (!svgXml) return null;
        return (
          <g
            key={overlay.id}
            className={`interactive-overlay-group ${selectedOverlayId === overlay.id ? "selected" : ""}`}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectOverlay?.(overlay.id);
              onSelectInstance(null);
            }}
            dangerouslySetInnerHTML={{ __html: svgXml }}
          />
        );
      })}

      {/* 3. Character Instances Layer */}
      {sortedInstances.map((instance) => {
        const isSelected = instance.instanceId === selectedInstanceId;
        const hasHeadTags = instance.customRig?.parts?.head?.shapes?.some(
          (s) => s.tag === "eyes" || s.tag === "mouth",
        );
        const rig =
          instance.customRig && hasHeadTags
            ? instance.customRig
            : instance.appearance
              ? buildRigFromAppearance(
                  instance.characterId,
                  instance.name || "Character",
                  instance.appearance,
                )
              : instance.customRig || getVectorRig(instance.characterId);
        const pose = evaluateCharacterPose(
          instance,
          scaledClips,
          sceneRelativeMs,
          animationData.expressionCues,
          animationData.dialogueLines,
        );

        return (
          <g key={instance.instanceId} className="character-instance-wrapper">
            {/* Ground contact shadow */}
            <ellipse
              cx={pose.x}
              cy={pose.y + (rig.baseHeight / 2) * pose.scale - 8}
              rx={40 * pose.scale}
              ry={12 * pose.scale}
              fill="url(#char-shadow-grad)"
              pointerEvents="none"
            />

            {/* Articulated Vector Character */}
            <VectorCharacterRenderer
              rig={rig}
              pose={pose}
              isSelected={isSelected}
              onClick={(e) => {
                e.stopPropagation();
                onSelectInstance(instance.instanceId);
                onSelectOverlay?.(null);
              }}
            />
          </g>
        );
      })}

      {/* 4. Above-Characters Overlays Layer */}
      {aboveCharacterOverlays.map((overlay) => {
        const svgXml = renderEducationalOverlayXml(overlay, sceneRelativeMs);
        if (!svgXml) return null;
        return (
          <g
            key={overlay.id}
            className={`interactive-overlay-group ${selectedOverlayId === overlay.id ? "selected" : ""}`}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectOverlay?.(overlay.id);
              onSelectInstance(null);
            }}
            dangerouslySetInnerHTML={{ __html: svgXml }}
          />
        );
      })}

      {/* 5. Interactive Transform Gizmo Overlay */}
      {selectedInstance && (() => {
        const selectedPose = evaluateCharacterPose(
          selectedInstance,
          scaledClips,
          sceneRelativeMs,
          animationData.expressionCues,
          animationData.dialogueLines,
        );
        const gizmoInstance = {
          ...selectedInstance,
          x: selectedPose.x,
          y: selectedPose.y,
          scale: selectedPose.scale,
          rotation: selectedPose.rotation,
        };
        const hasHeadTags =
          selectedInstance.customRig?.parts?.head?.shapes?.some(
            (s) => s.tag === "eyes" || s.tag === "mouth",
          );
        const rig =
          selectedInstance.customRig && hasHeadTags
            ? selectedInstance.customRig
            : selectedInstance.appearance
              ? buildRigFromAppearance(
                  selectedInstance.characterId,
                  selectedInstance.name || "Character",
                  selectedInstance.appearance,
                )
              : selectedInstance.customRig ||
                getVectorRig(selectedInstance.characterId);

        return (
          <TransformGizmo
            instance={gizmoInstance}
            baseInstance={selectedInstance}
            viewportWidth={canvasWidth}
            viewportHeight={canvasHeight}
            rig={rig}
            motionPath={selectedMotionPath}
            onUpdateInstance={(updates) =>
              handleInstanceTransformUpdate(selectedInstance.instanceId, updates)
            }
            onUpdateMotionPath={handleUpdateMotionPath}
          />
        );
      })()}

      {/* 6. Interactive Overlay Gizmo */}
      {selectedOverlay && onUpdateOverlay && (
        <OverlayGizmo
          overlay={selectedOverlay}
          onUpdateOverlay={(updates) =>
            onUpdateOverlay(selectedOverlay.id, updates)
          }
        />
      )}
      </g>
    </svg>
  );
};
