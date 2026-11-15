import React, { useRef, useState } from 'react';
import { CharacterInstance, MotionPath, VectorRigDefinition } from '../../../types/animation';

interface TransformGizmoProps {
  instance: CharacterInstance;
  baseInstance?: CharacterInstance;
  rig: VectorRigDefinition;
  motionPath?: MotionPath | null;
  onUpdateInstance: (updates: Partial<CharacterInstance>) => void;
  onUpdateMotionPath?: (path: MotionPath) => void;
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * Converts screen pointer event coordinates into composition SVG space using the SVG matrix.
 * Provides zoom-independent, viewport-independent 1:1 precision.
 */
function getSvgPoint(
  e: React.PointerEvent,
  svg: SVGSVGElement | null,
  vw: number,
  vh: number
): { x: number; y: number } {
  if (svg) {
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const res = pt.matrixTransform(ctm.inverse());
      return { x: res.x, y: res.y };
    }
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: ((e.clientX - rect.left) / rect.width) * vw,
        y: ((e.clientY - rect.top) / rect.height) * vh,
      };
    }
  }
  return { x: e.clientX, y: e.clientY };
}

export const TransformGizmo: React.FC<TransformGizmoProps> = ({
  instance,
  baseInstance,
  rig,
  motionPath,
  onUpdateInstance,
  onUpdateMotionPath,
  viewportWidth = 1280,
  viewportHeight = 720,
}) => {
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const dragStartRef = useRef<{
    pointerSvgX: number;
    pointerSvgY: number;
    startInstX: number;
    startInstY: number;
    startScale: number;
    startRotation: number;
    startDistFromCenter: number;
    startAngleFromCenter: number;
    corner?: string;
    pathStartX?: number;
    pathStartY?: number;
    pathEndX?: number;
    pathEndY?: number;
  } | null>(null);

  const scale = instance.scale || 1.0;
  const isRaster = (instance as any).characterType === 'raster' || Boolean((instance as any).imageUrl) || Boolean((instance as any).directionalViews);

  // Determine accurate rig bounds
  // Vector characters: waist at y=0, head extends up to -160, feet down to +80
  // Raster characters: center at y=0, extends -180 to +180
  const halfW = isRaster ? 140 * scale + 10 : (rig.baseWidth * scale) / 2 + 10;
  const topY = isRaster ? -180 * scale - 10 : -160 * scale - 10;
  const bottomY = isRaster ? 180 * scale + 10 : 80 * scale + 10;
  const boxHeight = bottomY - topY;
  const visualCenterY = instance.y + (topY + bottomY) / 2;

  // Start dragging translation (move character)
  const handlePointerDownMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag('move');

    const svgEl = (e.target as Element).closest('svg');
    const pt = getSvgPoint(e, svgEl, viewportWidth, viewportHeight);

    dragStartRef.current = {
      pointerSvgX: pt.x,
      pointerSvgY: pt.y,
      startInstX: instance.x,
      startInstY: instance.y,
      startScale: scale,
      startRotation: instance.rotation || 0,
      startDistFromCenter: 0,
      startAngleFromCenter: 0,
    };
  };

  // Start dragging motion path start pin
  const handlePointerDownPathStart = (e: React.PointerEvent) => {
    if (!motionPath) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag('path-start');

    const svgEl = (e.target as Element).closest('svg');
    const pt = getSvgPoint(e, svgEl, viewportWidth, viewportHeight);

    dragStartRef.current = {
      pointerSvgX: pt.x,
      pointerSvgY: pt.y,
      startInstX: instance.x,
      startInstY: instance.y,
      startScale: scale,
      startRotation: 0,
      startDistFromCenter: 0,
      startAngleFromCenter: 0,
      pathStartX: motionPath.startX,
      pathStartY: motionPath.startY,
    };
  };

  // Start dragging motion path end pin
  const handlePointerDownPathEnd = (e: React.PointerEvent) => {
    if (!motionPath) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag('path-end');

    const svgEl = (e.target as Element).closest('svg');
    const pt = getSvgPoint(e, svgEl, viewportWidth, viewportHeight);

    dragStartRef.current = {
      pointerSvgX: pt.x,
      pointerSvgY: pt.y,
      startInstX: instance.x,
      startInstY: instance.y,
      startScale: scale,
      startRotation: 0,
      startDistFromCenter: 0,
      startAngleFromCenter: 0,
      pathEndX: motionPath.endX,
      pathEndY: motionPath.endY,
    };
  };

  // Start scaling from corner handle (respects dragged corner)
  const handlePointerDownScale = (e: React.PointerEvent, corner: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag(`scale-${corner}`);

    const svgEl = (e.target as Element).closest('svg');
    const pt = getSvgPoint(e, svgEl, viewportWidth, viewportHeight);
    const dist = Math.hypot(pt.x - instance.x, pt.y - visualCenterY);

    dragStartRef.current = {
      pointerSvgX: pt.x,
      pointerSvgY: pt.y,
      startInstX: instance.x,
      startInstY: instance.y,
      startScale: scale,
      startRotation: instance.rotation || 0,
      startDistFromCenter: Math.max(20, dist),
      startAngleFromCenter: 0,
      corner,
    };
  };

  // Start rotating from rotation handle (using pointer angle around visual center)
  const handlePointerDownRotate = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag('rotate');

    const svgEl = (e.target as Element).closest('svg');
    const pt = getSvgPoint(e, svgEl, viewportWidth, viewportHeight);
    const angle = Math.atan2(pt.y - visualCenterY, pt.x - instance.x) * (180 / Math.PI);

    dragStartRef.current = {
      pointerSvgX: pt.x,
      pointerSvgY: pt.y,
      startInstX: instance.x,
      startInstY: instance.y,
      startScale: scale,
      startRotation: instance.rotation || 0,
      startDistFromCenter: 0,
      startAngleFromCenter: angle,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag || !dragStartRef.current) return;
    const svgEl = (e.target as Element).closest('svg');
    const curSvg = getSvgPoint(e, svgEl, viewportWidth, viewportHeight);

    const dx = curSvg.x - dragStartRef.current.pointerSvgX;
    const dy = curSvg.y - dragStartRef.current.pointerSvgY;

    if (activeDrag === 'move') {
      const maxX = viewportWidth || 1280;
      const maxY = viewportHeight || 720;
      const nextX = Math.max(20, Math.min(maxX - 20, Math.round(dragStartRef.current.startInstX + dx)));
      const nextY = Math.max(30, Math.min(maxY - 20, Math.round(dragStartRef.current.startInstY + dy)));
      onUpdateInstance({
        x: nextX,
        y: nextY,
      });
    } else if (activeDrag === 'path-start' && onUpdateMotionPath && motionPath) {
      const startX = dragStartRef.current.pathStartX ?? motionPath.startX;
      const startY = dragStartRef.current.pathStartY ?? motionPath.startY;
      onUpdateMotionPath({
        ...motionPath,
        startX: Math.round(startX + dx),
        startY: Math.round(startY + dy),
      });
    } else if (activeDrag === 'path-end' && onUpdateMotionPath && motionPath) {
      const endX = dragStartRef.current.pathEndX ?? motionPath.endX;
      const endY = dragStartRef.current.pathEndY ?? motionPath.endY;
      onUpdateMotionPath({
        ...motionPath,
        endX: Math.round(endX + dx),
        endY: Math.round(endY + dy),
      });
    } else if (activeDrag.startsWith('scale')) {
      const corner = dragStartRef.current.corner || 'se';
      // Unit corner direction vector in unrotated character space
      let dirX = 1;
      let dirY = 1;
      if (corner === 'nw') { dirX = -1; dirY = -1; }
      else if (corner === 'ne') { dirX = 1; dirY = -1; }
      else if (corner === 'sw') { dirX = -1; dirY = 1; }

      // Rotate direction vector by character rotation angle
      const rotRad = ((instance.rotation || 0) * Math.PI) / 180;
      const worldDirX = (dirX * Math.cos(rotRad) - dirY * Math.sin(rotRad)) / Math.SQRT2;
      const worldDirY = (dirX * Math.sin(rotRad) + dirY * Math.cos(rotRad)) / Math.SQRT2;

      // Project pointer displacement onto corner axis
      const projDelta = dx * worldDirX + dy * worldDirY;
      const ratio = 1 + projDelta / dragStartRef.current.startDistFromCenter;
      const newScale = Math.max(0.2, Math.min(3.5, dragStartRef.current.startScale * ratio));

      onUpdateInstance({ scale: Math.round(newScale * 100) / 100 });
    } else if (activeDrag === 'rotate') {
      const curAngle = Math.atan2(curSvg.y - visualCenterY, curSvg.x - instance.x) * (180 / Math.PI);
      const deltaAngle = curAngle - dragStartRef.current.startAngleFromCenter;
      let newRot = Math.round(dragStartRef.current.startRotation + deltaAngle);
      while (newRot > 180) newRot -= 360;
      while (newRot < -180) newRot += 360;
      onUpdateInstance({ rotation: newRot });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDrag) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch (_) {}
      setActiveDrag(null);
      dragStartRef.current = null;
    }
  };

  return (
    <g
      className="transform-gizmo-layer"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* 1. Motion Path Trajectory Line & Endpoints */}
      {motionPath && (
        <g className="motion-path-overlay">
          <line
            x1={motionPath.startX}
            y1={motionPath.startY}
            x2={motionPath.endX}
            y2={motionPath.endY}
            stroke="#f59e0b"
            strokeWidth={3}
            strokeDasharray="6 6"
          />
          {/* Start Pin */}
          <circle
            cx={motionPath.startX}
            cy={motionPath.startY}
            r={10}
            fill="#10b981"
            stroke="#ffffff"
            strokeWidth={2}
            style={{ cursor: activeDrag === 'path-start' ? 'grabbing' : 'grab' }}
            onPointerDown={handlePointerDownPathStart}
          />
          <text
            x={motionPath.startX}
            y={motionPath.startY - 14}
            fill="#10b981"
            fontSize={11}
            fontWeight="bold"
            textAnchor="middle"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            Start
          </text>
          {/* End Pin */}
          <circle
            cx={motionPath.endX}
            cy={motionPath.endY}
            r={10}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={2}
            style={{ cursor: activeDrag === 'path-end' ? 'grabbing' : 'grab' }}
            onPointerDown={handlePointerDownPathEnd}
          />
          <text
            x={motionPath.endX}
            y={motionPath.endY - 14}
            fill="#ef4444"
            fontSize={11}
            fontWeight="bold"
            textAnchor="middle"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            End
          </text>
        </g>
      )}

      {/* 2. Character Bounding Box & 4-Corner Handles */}
      <g
        transform={`translate(${instance.x}, ${instance.y}) rotate(${instance.rotation || 0})`}
      >
        {/* Transparent drag body to move - accurately covers from ears to feet */}
        <rect
          x={-halfW}
          y={topY}
          width={halfW * 2}
          height={boxHeight}
          fill="rgba(139, 92, 246, 0.1)"
          stroke="#8b5cf6"
          strokeWidth={1.5}
          rx={6}
          style={{ cursor: activeDrag === 'move' ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDownMove}
        />

        {/* Top rotation stem and handle - positioned above the head */}
        <line x1={0} y1={topY} x2={0} y2={topY - 24} stroke="#8b5cf6" strokeWidth={1.5} />
        <circle
          cx={0}
          cy={topY - 24}
          r={7}
          fill="#8b5cf6"
          stroke="#ffffff"
          strokeWidth={2}
          style={{ cursor: 'crosshair' }}
          onPointerDown={handlePointerDownRotate}
        />

        {/* 4 Corner Scale Handles */}
        {/* Top-Left */}
        <rect
          x={-halfW - 5}
          y={topY - 5}
          width={10}
          height={10}
          fill="#ffffff"
          stroke="#8b5cf6"
          strokeWidth={2}
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(e) => handlePointerDownScale(e, 'nw')}
        />
        {/* Top-Right */}
        <rect
          x={halfW - 5}
          y={topY - 5}
          width={10}
          height={10}
          fill="#ffffff"
          stroke="#8b5cf6"
          strokeWidth={2}
          style={{ cursor: 'nesw-resize' }}
          onPointerDown={(e) => handlePointerDownScale(e, 'ne')}
        />
        {/* Bottom-Left */}
        <rect
          x={-halfW - 5}
          y={bottomY - 5}
          width={10}
          height={10}
          fill="#ffffff"
          stroke="#8b5cf6"
          strokeWidth={2}
          style={{ cursor: 'nesw-resize' }}
          onPointerDown={(e) => handlePointerDownScale(e, 'sw')}
        />
        {/* Bottom-Right */}
        <rect
          x={halfW - 5}
          y={bottomY - 5}
          width={10}
          height={10}
          fill="#ffffff"
          stroke="#8b5cf6"
          strokeWidth={2}
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(e) => handlePointerDownScale(e, 'se')}
        />
      </g>
    </g>
  );
};
