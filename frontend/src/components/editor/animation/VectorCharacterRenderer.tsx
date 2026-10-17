import React from 'react';
import { VectorRigDefinition, EvaluatedCharacterPose, VectorPartShape } from '../../../types/animation';

interface VectorCharacterRendererProps {
  rig: VectorRigDefinition;
  pose: EvaluatedCharacterPose;
  isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export const VectorCharacterRenderer: React.FC<VectorCharacterRendererProps> = ({
  rig,
  pose,
  isSelected = false,
  onClick,
  onPointerDown,
}) => {
  const { parts } = rig;

  // Render individual SVG shape
  const renderShape = (shape: VectorPartShape, idx: number) => {
    switch (shape.type) {
      case 'circle':
        return (
          <circle
            key={idx}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={shape.fill || 'none'}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            opacity={shape.opacity}
          />
        );
      case 'ellipse':
        return (
          <ellipse
            key={idx}
            cx={shape.cx}
            cy={shape.cy}
            rx={shape.rx}
            ry={shape.ry}
            fill={shape.fill || 'none'}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            opacity={shape.opacity ?? (shape.transform?.includes('opacity') ? 0.5 : undefined)}
          />
        );
      case 'rect':
        return (
          <rect
            key={idx}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill={shape.fill || 'none'}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            opacity={shape.opacity}
          />
        );
      case 'path':
      default:
        return (
          <path
            key={idx}
            d={shape.d}
            fill={shape.fill || 'none'}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            strokeLinecap={shape.strokeLinecap}
            strokeLinejoin={shape.strokeLinejoin}
            opacity={shape.opacity}
          />
        );
    }
  };

  // Base transform: placement (x, y), scale, flip, rotation
  const rootTransform = `translate(${pose.x}, ${pose.y}) scale(${pose.scale * (pose.flipX ? -1 : 1)}, ${pose.scale}) rotate(${pose.rotation})`;

  // Limb transforms relative to respective pivots
  const leftLegTransform = `rotate(${pose.leftLegAngle}, ${parts.leftLeg.pivot.x}, ${parts.leftLeg.pivot.y})`;
  const rightLegTransform = `rotate(${pose.rightLegAngle}, ${parts.rightLeg.pivot.x}, ${parts.rightLeg.pivot.y})`;
  const torsoTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.torsoAngle}, ${parts.torso.pivot.x}, ${parts.torso.pivot.y}) scale(1, ${pose.chestScaleY})`;
  const leftArmTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.leftArmAngle}, ${parts.leftArm.pivot.x}, ${parts.leftArm.pivot.y})`;
  const rightArmTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.rightArmAngle}, ${parts.rightArm.pivot.x}, ${parts.rightArm.pivot.y})`;
  const headTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.headAngle}, ${parts.head.pivot.x}, ${parts.head.pivot.y})`;

  return (
    <g
      className={`vector-character-group ${isSelected ? 'selected' : ''}`}
      transform={rootTransform}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {/* 1. Behind Torso: Left Arm, Left Leg, Right Leg */}
      <g id="leftLeg" transform={leftLegTransform}>
        {parts.leftLeg.shapes.map(renderShape)}
      </g>

      <g id="rightLeg" transform={rightLegTransform}>
        {parts.rightLeg.shapes.map(renderShape)}
      </g>

      <g id="leftArm" transform={leftArmTransform}>
        {parts.leftArm.shapes.map(renderShape)}
        {parts.leftForearm && (
          <g
            id="leftForearm"
            transform={`rotate(${pose.leftForearmAngle}, ${parts.leftForearm.pivot.x}, ${parts.leftForearm.pivot.y})`}
          >
            {parts.leftForearm.shapes.map(renderShape)}
          </g>
        )}
      </g>

      {/* 2. Torso with chest breathing scale and bob */}
      <g id="torso" transform={torsoTransform}>
        {parts.torso.shapes.map(renderShape)}
      </g>

      {/* 3. Front Arm. Forearm motion is nested under the shoulder transform. */}
      <g id="rightArm" transform={rightArmTransform}>
        {parts.rightArm.shapes.map(renderShape)}
        {parts.rightForearm && (
          <g
            id="rightForearm"
            transform={`rotate(${pose.rightForearmAngle}, ${parts.rightForearm.pivot.x}, ${parts.rightForearm.pivot.y})`}
          >
            {parts.rightForearm.shapes.map(renderShape)}
          </g>
        )}
      </g>

      {/* 4. Head Group */}
      <g id="head" transform={headTransform}>
        {parts.head.shapes.map(renderShape)}
      </g>

      {/* Selection bounding box indicator when selected */}
      {isSelected && (
        <rect
          x={-rig.baseWidth / 2 - 10}
          y={-rig.baseHeight / 2 - 30}
          width={rig.baseWidth + 20}
          height={rig.baseHeight + 35}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="4 4"
          rx={8}
          pointerEvents="none"
        />
      )}
    </g>
  );
};

