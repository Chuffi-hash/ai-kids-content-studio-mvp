import React, { useRef } from 'react';
import { VectorSceneData, CharacterInstance, MotionPath, EducationalOverlay, AspectRatioType } from '../../../types/animation';
import { getVectorRig } from '../../../assets/characters/defaultCharacters';
import { buildRigFromAppearance } from '../../../utils/customCharacterRig';
import { evaluateCharacterPose } from '../../../utils/animationEngine';
import { VectorCharacterRenderer } from './VectorCharacterRenderer';
import { TransformGizmo } from './TransformGizmo';
import { OverlayGizmo } from './OverlayGizmo';
import { renderEducationalOverlayXml } from '../../../utils/educationalOverlayRenderer';
import { resolveAssetUrl } from '../../../utils/urlHelper';

interface VectorSceneCanvasProps {
  animationData: VectorSceneData;
  currentTimeMs: number;
  sceneStartMs: number;
  activeFormat?: AspectRatioType;
  selectedInstanceId: string | null;
  onSelectInstance: (instanceId: string | null) => void;
  onUpdateInstance: (instanceId: string, updates: Partial<CharacterInstance>) => void;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  onUpdateOverlay?: (overlayId: string, updates: Partial<EducationalOverlay>) => void;
  onUpdateAnimationData?: (newData: VectorSceneData) => void;
}

export const VectorSceneCanvas: React.FC<VectorSceneCanvasProps> = ({
  animationData,
  currentTimeMs,
  sceneStartMs,
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

  const effectiveFormat: AspectRatioType = activeFormat || animationData.activeFormat || '16:9';
  const canvasWidth = effectiveFormat === '9:16' ? 720 : 1280;
  const canvasHeight = effectiveFormat === '9:16' ? 1280 : 720;

  const sceneRelativeMs = Math.max(0, currentTimeMs - sceneStartMs);
  const rawInstances = animationData.characterInstances || [];
  const clips = animationData.animationClips || [];
  const overlays = animationData.overlays || [];

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
    if (effectiveFormat === '9:16') {
      const xOffset = inst.x - 640;
      const newX = (canvasWidth / 2) + (xOffset * (canvasWidth / 1280));
      const yRatio = inst.y / 720;
      const newY = yRatio * canvasHeight;
      const newScale = (inst.scale || 1.0) <= 1.0 ? (inst.scale || 1.0) * 1.15 : (inst.scale || 1.0);
      return {
        ...inst,
        x: Math.round(newX),
        y: Math.round(newY),
        scale: Number(newScale.toFixed(2)),
      };
    }
    return inst;
  });

  const belowCharacterOverlays = overlays.filter(
    (o) => o.layerPosition === 'below_characters' || (o.zIndex !== undefined && o.zIndex < 0)
  );
  const aboveCharacterOverlays = overlays.filter(
    (o) => o.layerPosition !== 'below_characters' && (o.zIndex === undefined || o.zIndex >= 0)
  );
  const selectedOverlay = overlays.find((o) => o.id === selectedOverlayId) || null;

  // Sort instances by zIndex ascending
  const sortedInstances = [...instances].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  // Find currently selected instance
  const selectedInstance = instances.find((i) => i.instanceId === selectedInstanceId) || null;

  // Find if selected instance has an active motion path clip
  let selectedMotionPath: MotionPath | null = null;
  if (selectedInstance) {
    const activeClip = clips.find(
      (c) => c.instanceId === selectedInstance.instanceId && c.action === 'walk' && c.motionMode === 'motion_path'
    );
    if (activeClip && activeClip.motionPath) {
      selectedMotionPath = activeClip.motionPath;
    }
  }

  // Handle clicking on background to deselect
  const handleSvgClick = (e: React.MouseEvent) => {
    const targetEl = e.target as Element;
    if (targetEl === svgRef.current || targetEl.id === 'scene-background-rect' || targetEl.id === 'scene-background-image' || targetEl.id === 'scene-background-backdrop') {
      onSelectInstance(null);
      onSelectOverlay?.(null);
    }
  };

  const handleUpdateMotionPath = (newPath: MotionPath) => {
    if (!selectedInstance || !onUpdateAnimationData) return;
    const updatedClips = clips.map((c) => {
      if (c.instanceId === selectedInstance.instanceId && c.action === 'walk') {
        return {
          ...c,
          motionMode: 'motion_path' as const,
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

  const handleInstanceTransformUpdate = (instanceId: string, updates: Partial<CharacterInstance>) => {
    if (effectiveFormat === '9:16') {
      const currentVariants = animationData.formatVariants || {};
      const current9x16 = currentVariants['9:16'] || { aspectRatio: '9:16', width: 720, height: 1280, characterOverrides: {} };
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
            '9:16': {
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

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      className="vector-scene-svg-canvas"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        backgroundColor: '#090d16',
      }}
      onClick={handleSvgClick}
    >
      <defs>
        {/* Subtle ground shadow gradient */}
        <radialGradient id="char-shadow-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* 1. Background Layer */}
      {animationData.background?.imageUrl ? (
        <g id="scene-background-group">
          <rect id="scene-background-backdrop" width={canvasWidth} height={canvasHeight} fill="#090d16" />
          <image
            id="scene-background-image"
            href={resolveAssetUrl(animationData.background.imageUrl)}
            x={0}
            y={0}
            width={canvasWidth}
            height={canvasHeight}
            preserveAspectRatio={animationData.background.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}
          />
        </g>
      ) : (
        <g id="default-stylized-background">
          <rect id="scene-background-rect" width={canvasWidth} height={canvasHeight} fill="#101726" />
          <line x1={0} y1={Math.round(canvasHeight * 0.75)} x2={canvasWidth} y2={Math.round(canvasHeight * 0.75)} stroke="#1e293b" strokeWidth={2} />
          <rect x={0} y={Math.round(canvasHeight * 0.75)} width={canvasWidth} height={canvasHeight - Math.round(canvasHeight * 0.75)} fill="#0d131f" opacity={0.6} />
        </g>
      )}

      {/* 2. Below-Characters Overlays Layer */}
      {belowCharacterOverlays.map((overlay) => {
        const svgXml = renderEducationalOverlayXml(overlay, sceneRelativeMs);
        if (!svgXml) return null;
        return (
          <g
            key={overlay.id}
            className={`interactive-overlay-group ${selectedOverlayId === overlay.id ? 'selected' : ''}`}
            style={{ cursor: 'pointer' }}
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
          (s) => s.tag === 'eyes' || s.tag === 'mouth'
        );
        const rig =
          (instance.customRig && hasHeadTags)
            ? instance.customRig
            : (instance.appearance
                ? buildRigFromAppearance(instance.characterId, instance.name || 'Character', instance.appearance)
                : (instance.customRig || getVectorRig(instance.characterId)));
        const pose = evaluateCharacterPose(
          instance,
          clips,
          sceneRelativeMs,
          animationData.expressionCues,
          animationData.dialogueLines
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
            className={`interactive-overlay-group ${selectedOverlayId === overlay.id ? 'selected' : ''}`}
            style={{ cursor: 'pointer' }}
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
            const hasHeadTags = selectedInstance.customRig?.parts?.head?.shapes?.some(
              (s) => s.tag === 'eyes' || s.tag === 'mouth'
            );
            return (selectedInstance.customRig && hasHeadTags)
              ? selectedInstance.customRig
              : (selectedInstance.appearance
                  ? buildRigFromAppearance(
                      selectedInstance.characterId,
                      selectedInstance.name || 'Character',
                      selectedInstance.appearance
                    )
                  : (selectedInstance.customRig || getVectorRig(selectedInstance.characterId)));
          })()}
          motionPath={selectedMotionPath}
          onUpdateInstance={(updates) => handleInstanceTransformUpdate(selectedInstance.instanceId, updates)}
          onUpdateMotionPath={handleUpdateMotionPath}
        />
      )}

      {/* 6. Interactive Overlay Gizmo */}
      {selectedOverlay && onUpdateOverlay && (
        <OverlayGizmo
          overlay={selectedOverlay}
          onUpdateOverlay={(updates) => onUpdateOverlay(selectedOverlay.id, updates)}
        />
      )}
    </svg>
  );
};

