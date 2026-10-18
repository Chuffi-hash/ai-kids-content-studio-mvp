import React, { useRef } from 'react';
import { VectorSceneData, CharacterInstance, MotionPath } from '../../../types/animation';
import { getVectorRig } from '../../../assets/characters/defaultCharacters';
import { buildRigFromAppearance } from '../../../utils/customCharacterRig';
import { evaluateCharacterPose } from '../../../utils/animationEngine';
import { VectorCharacterRenderer } from './VectorCharacterRenderer';
import { TransformGizmo } from './TransformGizmo';
import { resolveAssetUrl } from '../../../utils/urlHelper';

interface VectorSceneCanvasProps {
  animationData: VectorSceneData;
  currentTimeMs: number;
  sceneStartMs: number;
  selectedInstanceId: string | null;
  onSelectInstance: (instanceId: string | null) => void;
  onUpdateInstance: (instanceId: string, updates: Partial<CharacterInstance>) => void;
  onUpdateAnimationData?: (newData: VectorSceneData) => void;
}

export const VectorSceneCanvas: React.FC<VectorSceneCanvasProps> = ({
  animationData,
  currentTimeMs,
  sceneStartMs,
  selectedInstanceId,
  onSelectInstance,
  onUpdateInstance,
  onUpdateAnimationData,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const sceneRelativeMs = Math.max(0, currentTimeMs - sceneStartMs);
  const instances = animationData.characterInstances || [];
  const clips = animationData.animationClips || [];

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
    if (e.target === svgRef.current || (e.target as Element).id === 'scene-background-rect') {
      onSelectInstance(null);
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

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1280 720"
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
          <rect id="scene-background-backdrop" width={1280} height={720} fill="#090d16" />
          <image
            id="scene-background-image"
            href={resolveAssetUrl(animationData.background.imageUrl)}
            x={0}
            y={0}
            width={1280}
            height={720}
            preserveAspectRatio={animationData.background.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}
          />
        </g>
      ) : (
        <g id="default-stylized-background">
          <rect id="scene-background-rect" width={1280} height={720} fill="#101726" />
          {/* Subtle grid floor / horizon */}
          <line x1={0} y1={540} x2={1280} y2={540} stroke="#1e293b" strokeWidth={2} />
          <rect x={0} y={540} width={1280} height={180} fill="#0d131f" opacity={0.6} />
        </g>
      )}

      {/* 2. Character Instances Layer */}
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
              }}
            />
          </g>
        );
      })}

      {/* 3. Interactive Transform Gizmo Overlay */}
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
          onUpdateInstance={(updates) => onUpdateInstance(selectedInstance.instanceId, updates)}
          onUpdateMotionPath={handleUpdateMotionPath}
        />
      )}
    </svg>
  );
};

