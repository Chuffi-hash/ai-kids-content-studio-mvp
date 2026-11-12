import React from 'react';
import { CharacterInstance, CharacterFacingDirection } from '../manifest';
import { EvaluatedCharacterPose } from './animation-evaluator';

interface RasterCharacterProps {
  instance: CharacterInstance;
  pose: EvaluatedCharacterPose;
}

export const RasterCharacter: React.FC<RasterCharacterProps> = ({ instance, pose }) => {
  const facing: CharacterFacingDirection = (pose.facingDirection as CharacterFacingDirection) || 'front';
  const views: Partial<Record<CharacterFacingDirection, string>> = instance.directionalViews || {};

  // Best directional view resolution:
  // 1. Exact match (front, front-left, front-right, left, right, back-left, back-right, back)
  // 2. Approximate quadrant match
  // 3. Front view fallback
  // 4. Default instance imageUrl
  let activeSrc: string | undefined = views[facing];
  const isDirectMatch = Boolean(activeSrc);
  if (!activeSrc) {
    if (facing.includes('left') && views['left']) {
      activeSrc = views['left'];
    } else if (facing.includes('right') && views['right']) {
      activeSrc = views['right'];
    } else if (facing.includes('back') && views['back']) {
      activeSrc = views['back'];
    } else {
      activeSrc = views['front'] || instance.imageUrl;
    }
  }

  if (!activeSrc) {
    return null;
  }

  const isFallback = !isDirectMatch && facing !== 'front';

  // Base character bounding box (default ~280x360 px at scale 1.0)
  const charWidth = 280;
  const charHeight = 360;

  const flipX = pose.flipX;
  const scale = pose.scale ?? 1.0;
  const rotation = pose.rotation ?? 0;
  const opacity = (instance as any).opacity ?? 1.0;

  const transform = `translate(${pose.x}, ${pose.y}) rotate(${rotation}) scale(${scale}) scale(${flipX ? -1 : 1}, 1)`;

  return (
    <g transform={transform} opacity={opacity}>
      {/* 1. Ground Contact Shadow */}
      <ellipse
        cx={0}
        cy={charHeight / 2 - 10}
        rx={charWidth * 0.35}
        ry={14}
        fill="rgba(0, 0, 0, 0.22)"
      />

      {/* 2. Active Speaker Aura / Glow */}
      {pose.isSpeaker && (
        <ellipse
          cx={0}
          cy={0}
          rx={charWidth * 0.48}
          ry={charHeight * 0.48}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={4}
          strokeDasharray="6 4"
          opacity={0.8}
        />
      )}

      {/* 3. High-Quality AI Raster Character Image */}
      <image
        href={activeSrc}
        x={-charWidth / 2}
        y={-charHeight / 2}
        width={charWidth}
        height={charHeight}
        preserveAspectRatio="xMidYMid meet"
      />

      {/* 4. Missing-view Fallback Status Indicator Badge */}
      {isFallback && (
        <g
          transform={`scale(${flipX ? -1 : 1}, 1) translate(0, ${charHeight / 2 + 18})`}
          pointerEvents="none"
        >
          <rect
            x={-90}
            y={-12}
            width={180}
            height={22}
            rx={11}
            fill="rgba(15, 23, 42, 0.9)"
            stroke="#f59e0b"
            strokeWidth={1.5}
          />
          <text
            x={0}
            y={3}
            textAnchor="middle"
            fill="#fcd34d"
            fontSize={10.5}
            fontWeight={600}
            fontFamily="sans-serif"
          >
            ⚠️ {facing} (front fallback)
          </text>
        </g>
      )}
    </g>
  );
};
