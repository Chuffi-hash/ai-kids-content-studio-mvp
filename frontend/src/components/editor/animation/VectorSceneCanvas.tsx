import React, { useRef } from "react";
import {
  VectorSceneData,
  CharacterInstance,
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

  // Non-destructive format variant mapping
  const instances = rawInstances.map((inst) => {
    const override = characterOverrides?.[inst.instanceId];
    if (override) {
      return {
        ...inst,
        x: override.x !== undefined ? override.x : inst.x,
        y: override.y !== undefined ? override.y : inst.y,
        scale: override.scale !== undefined ? override.scale : inst.scale,
      };
    }
    if (effectiveFormat === "9:16") {
      const xOffset = inst.x - 640;
      const newX = canvasWidth / 2 + xOffset * (canvasWidth / 1280);
      const yRatio = inst.y / 720;
      const newY = yRatio * canvasHeight;
      const newScale =
        (inst.scale || 1.0) <= 1.0
          ? (inst.scale || 1.0) * 1.15
          : inst.scale || 1.0;
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(newY),
        scale: Number(newScale.toFixed(2)),
      };
    }
    if (effectiveFormat === "1:1") {
      const xOffset = inst.x - 640;
      const newX = canvasWidth / 2 + xOffset * (canvasWidth / 1280);
      const yRatio = inst.y / 720;
      const newY = yRatio * canvasHeight;
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(newY),
        scale: Number((inst.scale || 1.0).toFixed(2)),
      };
    }
    if (effectiveFormat === "4:5") {
      const xOffset = inst.x - 640;
      const newX = canvasWidth / 2 + xOffset * (canvasWidth / 1280);
      const yRatio = inst.y / 720;
      const newY = yRatio * canvasHeight;
      const newScale = (inst.scale || 1.0) * 1.08;
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(newY),
        scale: Number(newScale.toFixed(2)),
      };
    }
    return inst;
  });

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

  // Find if selected instance has an active motion path clip
  let selectedMotionPath: MotionPath | null = null;
  if (selectedInstance) {
    const activeClip = clips.find(
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
    const updatedClips = clips.map((c) => {
      if (c.instanceId === selectedInstance.instanceId && c.action === "walk") {
        return {
          ...c,
          motionMode: "motion_path" as const,
          motionPath: newPath,
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
    if (effectiveFormat === "9:16") {
      const currentVariants = animationData.formatVariants || {};
      const current9x16 = currentVariants["9:16"] || {
        aspectRatio: "9:16",
        width: 720,
        height: 1280,
        characterOverrides: {},
      };
      const currentOverrides = current9x16.characterOverrides || {};
      const updatedOverrides = {
        ...currentOverrides,
        [instanceId]: {
          ...(currentOverrides[instanceId] || {}),
          ...(updates.x !== undefined ? { x: updates.x } : {}),
          ...(updates.y !== undefined ? { y: updates.y } : {}),
          ...(updates.scale !== undefined ? { scale: updates.scale } : {}),
        },
      };
      if (onUpdateAnimationData) {
        onUpdateAnimationData({
          ...animationData,
          formatVariants: {
            ...currentVariants,
            "9:16": {
              ...current9x16,
              characterOverrides: updatedOverrides,
            },
          },
        });
      }
    } else {
      onUpdateInstance(instanceId, updates);
    }
  };

  const durationMs = sceneDurationMs || (animationData as any).durationMs || 5000;
  const effectiveSec = Math.max(1.5, durationMs / 1000);
  const t = Math.max(0, Math.min(1, (sceneRelativeMs / 1000) / effectiveSec));
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  const moveStr = (animationData.cameraMovement || '').toLowerCase().trim();
  const rotStr = (animationData.cameraRotation || '').toLowerCase().trim();
  const rotDegrees = typeof animationData.cameraRotationDegrees === 'number' && Number.isFinite(animationData.cameraRotationDegrees)
    ? Math.max(0, Math.min(45, animationData.cameraRotationDegrees))
    : 10;

  let scale = 1.0;
  let dx = 0;
  let dy = 0;
  let rotationDeg = 0;

  if (moveStr.includes('zoom in') || moveStr === 'slow zoom in') {
    scale = 1.0 + 0.15 * t;
  } else if (moveStr.includes('zoom out') || moveStr === 'slow zoom out') {
    scale = 1.15 - 0.15 * t;
  } else if (moveStr.includes('pan left')) {
    scale = 1.12;
    dx = (t - 0.5) * (canvasWidth * 0.08);
  } else if (moveStr.includes('pan right')) {
    scale = 1.12;
    dx = (0.5 - t) * (canvasWidth * 0.08);
  } else if (moveStr.includes('tilt up')) {
    scale = 1.12;
    dy = (t - 0.5) * (canvasHeight * 0.08);
  } else if (moveStr.includes('tilt down')) {
    scale = 1.12;
    dy = (0.5 - t) * (canvasHeight * 0.08);
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
          clips,
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
      {selectedInstance && (
        <TransformGizmo
          instance={selectedInstance}
          rig={(() => {
            const hasHeadTags =
              selectedInstance.customRig?.parts?.head?.shapes?.some(
                (s) => s.tag === "eyes" || s.tag === "mouth",
              );
            return selectedInstance.customRig && hasHeadTags
              ? selectedInstance.customRig
              : selectedInstance.appearance
                ? buildRigFromAppearance(
                    selectedInstance.characterId,
                    selectedInstance.name || "Character",
                    selectedInstance.appearance,
                  )
                : selectedInstance.customRig ||
                  getVectorRig(selectedInstance.characterId);
          })()}
          motionPath={selectedMotionPath}
          onUpdateInstance={(updates) =>
            handleInstanceTransformUpdate(selectedInstance.instanceId, updates)
          }
          onUpdateMotionPath={handleUpdateMotionPath}
        />
      )}

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
