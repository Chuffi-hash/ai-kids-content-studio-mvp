import React from 'react';
import { VectorRigDefinition, VectorPartShape } from '../manifest';
import { EvaluatedCharacterPose } from './animation-evaluator';
import { getHeadShapesForPose } from './face-renderer';

interface VectorCharacterProps {
  rig: VectorRigDefinition;
  pose: EvaluatedCharacterPose;
}

function renderShape(shape: VectorPartShape, key: string | number): React.ReactElement {
  const opacity = shape.opacity !== undefined ? shape.opacity : (shape.transform?.includes('opacity') ? 0.5 : undefined);

  switch (shape.type) {
    case 'circle':
      return (
        <circle
          key={key}
          cx={shape.cx ?? 0}
          cy={shape.cy ?? 0}
          r={shape.r ?? 0}
          fill={shape.fill || 'none'}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          opacity={opacity}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          key={key}
          cx={shape.cx ?? 0}
          cy={shape.cy ?? 0}
          rx={shape.rx ?? 0}
          ry={shape.ry ?? 0}
          fill={shape.fill || 'none'}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          opacity={opacity}
        />
      );
    case 'rect':
      return (
        <rect
          key={key}
          x={shape.x ?? 0}
          y={shape.y ?? 0}
          width={shape.width ?? 0}
          height={shape.height ?? 0}
          fill={shape.fill || 'none'}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          opacity={opacity}
        />
      );
    case 'path':
    default:
      return (
        <path
          key={key}
          d={shape.d || ''}
          fill={shape.fill || 'none'}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          strokeLinecap={shape.strokeLinecap}
          strokeLinejoin={shape.strokeLinejoin}
          opacity={opacity}
        />
      );
  }
}

export const VectorCharacter: React.FC<VectorCharacterProps> = ({ rig, pose }) => {
  const { parts } = rig;

  // Root transform: placement (x, y), scale (with flipX), rotation
  const rootTransform = `translate(${pose.x}, ${pose.y}) scale(${pose.scale * (pose.flipX ? -1 : 1)}, ${pose.scale}) rotate(${pose.rotation})`;

  // Limb and body transforms
  const leftLegTransform = `rotate(${pose.leftLegAngle}, ${parts.leftLeg.pivot.x}, ${parts.leftLeg.pivot.y})`;
  const rightLegTransform = `rotate(${pose.rightLegAngle}, ${parts.rightLeg.pivot.x}, ${parts.rightLeg.pivot.y})`;
  const torsoTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.torsoAngle}, ${parts.torso.pivot.x}, ${parts.torso.pivot.y}) scale(1, ${pose.chestScaleY})`;
  const leftArmTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.leftArmAngle}, ${parts.leftArm.pivot.x}, ${parts.leftArm.pivot.y})`;
  const rightArmTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.rightArmAngle}, ${parts.rightArm.pivot.x}, ${parts.rightArm.pivot.y})`;
  const headTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.headAngle}, ${parts.head.pivot.x}, ${parts.head.pivot.y})`;

  // Dynamic head shapes for current expression and viseme mouth shape
  const headShapes = getHeadShapesForPose(rig, pose);

  // Soft contact drop shadow beneath character
  const shadowY = pose.y + (rig.baseHeight / 2) * pose.scale - 8;
  const shadowRx = 40 * pose.scale;
  const shadowRy = 12 * pose.scale;

  return (
    <>
      {/* Contact shadow */}
      <ellipse
        cx={pose.x}
        cy={shadowY}
        rx={shadowRx}
        ry={shadowRy}
        fill="rgba(0, 0, 0, 0.3)"
      />

      {/* Speaker highlight aura */}
      {(pose.speaking || pose.isSpeaker) && (
        <g>
          <ellipse
            cx={pose.x}
            cy={pose.y - 10 * pose.scale}
            rx={Math.round((rig.baseWidth * 0.58) * pose.scale)}
            ry={Math.round((rig.baseHeight * 0.52) * pose.scale)}
            fill="none"
            stroke={pose.speaking ? 'rgba(56, 189, 248, 0.45)' : 'rgba(250, 204, 21, 0.35)'}
            strokeWidth={Math.max(2, Math.round(2.5 * pose.scale))}
            strokeDasharray={pose.speaking ? '6 4' : undefined}
            opacity={0.85}
          />
          {pose.speaking && (
            <g transform={`translate(${pose.x + (pose.flipX ? -40 : 40) * pose.scale}, ${pose.y - (rig.baseHeight * 0.45) * pose.scale})`}>
              <path
                d="M 0 -8 A 12 12 0 0 1 0 8"
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0.9}
              />
              <path
                d="M 6 -14 A 18 18 0 0 1 6 14"
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0.65}
              />
            </g>
          )}
        </g>
      )}

      {/* Articulated vector rig */}
      <g transform={rootTransform}>
        {/* Left Leg */}
        <g id={parts.leftLeg.id} transform={leftLegTransform}>
          {parts.leftLeg.shapes.map((s, idx) => renderShape(s, `lleg-${idx}`))}
        </g>

        {/* Right Leg */}
        <g id={parts.rightLeg.id} transform={rightLegTransform}>
          {parts.rightLeg.shapes.map((s, idx) => renderShape(s, `rleg-${idx}`))}
        </g>

        {/* Left Arm & Forearm */}
        <g id={parts.leftArm.id} transform={leftArmTransform}>
          {parts.leftArm.shapes.map((s, idx) => renderShape(s, `larm-${idx}`))}
          {parts.leftForearm && (
            <g
              id={parts.leftForearm.id}
              transform={`rotate(${pose.leftForearmAngle}, ${parts.leftForearm.pivot.x}, ${parts.leftForearm.pivot.y})`}
            >
              {parts.leftForearm.shapes.map((s, idx) => renderShape(s, `lforearm-${idx}`))}
            </g>
          )}
        </g>

        {/* Torso */}
        <g id={parts.torso.id} transform={torsoTransform}>
          {parts.torso.shapes.map((s, idx) => renderShape(s, `torso-${idx}`))}
        </g>

        {/* Right Arm & Forearm */}
        <g id={parts.rightArm.id} transform={rightArmTransform}>
          {parts.rightArm.shapes.map((s, idx) => renderShape(s, `rarm-${idx}`))}
          {parts.rightForearm && (
            <g
              id={parts.rightForearm.id}
              transform={`rotate(${pose.rightForearmAngle}, ${parts.rightForearm.pivot.x}, ${parts.rightForearm.pivot.y})`}
            >
              {parts.rightForearm.shapes.map((s, idx) => renderShape(s, `rforearm-${idx}`))}
            </g>
          )}
        </g>

        {/* Head with dynamic eyes, brows and mouth */}
        <g id={parts.head.id} transform={headTransform}>
          {headShapes.map((s, idx) => renderShape(s, `head-${idx}`))}
        </g>
      </g>
    </>
  );
};

