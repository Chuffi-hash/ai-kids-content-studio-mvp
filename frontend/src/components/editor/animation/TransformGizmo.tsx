import React, { useRef, useState } from 'react';
import { CharacterInstance, MotionPath, VectorRigDefinition } from '../../../types/animation';

interface TransformGizmoProps {
  instance: CharacterInstance;
  rig: VectorRigDefinition;
  motionPath?: MotionPath | null;
  onUpdateInstance: (updates: Partial<CharacterInstance>) => void;
  onUpdateMotionPath?: (path: MotionPath) => void;
  viewportWidth?: number;
  viewportHeight?: number;
}

export const TransformGizmo: React.FC<TransformGizmoProps> = ({
  instance,
  rig,
  motionPath,
  onUpdateInstance,
  onUpdateMotionPath,
}) => {
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
    startScale: number;
    startRotation: number;
  } | null>(null);

  const halfW = (rig.baseWidth * instance.scale) / 2 + 10;
  const halfH = (rig.baseHeight * instance.scale) / 2 + 20;

  // Start dragging translation (move character)
  const handlePointerDownMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag('move');
    const svgEl = (e.target as Element).closest('svg');
    const svgRect = svgEl?.getBoundingClientRect();
    const scaleFactor = svgRect && svgRect.width > 0 ? 1280 / svgRect.width : 1;
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: instance.x,
      startY: instance.y,
      startScale: scaleFactor,
      startRotation: instance.rotation,
    };
  };

  // Start dragging motion path start pin
  const handlePointerDownPathStart = (e: React.PointerEvent) => {
    if (!motionPath) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag('path-start');
    const svgEl = (e.target as Element).closest('svg');
    const svgRect = svgEl?.getBoundingClientRect();
    const scaleFactor = svgRect && svgRect.width > 0 ? 1280 / svgRect.width : 1;
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: motionPath.startX,
      startY: motionPath.startY,
      startScale: scaleFactor,
      startRotation: 0,
    };
  };

  // Start dragging motion path end pin
  const handlePointerDownPathEnd = (e: React.PointerEvent) => {
    if (!motionPath) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag('path-end');
    const svgEl = (e.target as Element).closest('svg');
    const svgRect = svgEl?.getBoundingClientRect();
    const scaleFactor = svgRect && svgRect.width > 0 ? 1280 / svgRect.width : 1;
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: motionPath.endX,
      startY: motionPath.endY,
      startScale: scaleFactor,
      startRotation: 0,
    };
  };

  // Start scaling from corner
  const handlePointerDownScale = (e: React.PointerEvent, corner: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag(`scale-${corner}`);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: instance.x,
      startY: instance.y,
      startScale: instance.scale,
      startRotation: instance.rotation,
    };
  };

  // Start rotating from rotation pin
  const handlePointerDownRotate = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag('rotate');
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: instance.x,
      startY: instance.y,
      startScale: instance.scale,
      startRotation: instance.rotation,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;
    const scaleFactor = dragStartRef.current.startScale || 1;

    if (activeDrag === 'move') {
      onUpdateInstance({
        x: Math.round(dragStartRef.current.startX + dx * scaleFactor),
        y: Math.round(dragStartRef.current.startY + dy * scaleFactor),
      });
    } else if (activeDrag === 'path-start' && onUpdateMotionPath && motionPath) {
      onUpdateMotionPath({
        ...motionPath,
        startX: Math.round(dragStartRef.current.startX + dx * scaleFactor),
        startY: Math.round(dragStartRef.current.startY + dy * scaleFactor),
      });
    } else if (activeDrag === 'path-end' && onUpdateMotionPath && motionPath) {
      onUpdateMotionPath({
        ...motionPath,
        endX: Math.round(dragStartRef.current.startX + dx * scaleFactor),
        endY: Math.round(dragStartRef.current.startY + dy * scaleFactor),
      });
    } else if (activeDrag.startsWith('scale')) {
      const distDelta = (Math.abs(dx) + Math.abs(dy)) / 2;
      const factor = dx + dy > 0 ? 1 : -1;
      const newScale = Math.max(0.2, Math.min(3.0, dragStartRef.current.startScale + factor * (distDelta / 150)));
      onUpdateInstance({ scale: Math.round(newScale * 100) / 100 });
    } else if (activeDrag === 'rotate') {
      const angleDelta = dx * 0.8;
      let newRot = Math.round(dragStartRef.current.startRotation + angleDelta);
      if (newRot > 180) newRot -= 360;
      if (newRot < -180) newRot += 360;
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
      {/* 1. Optional Motion Path Visualizer */}
      {motionPath && (
        <g className="motion-path-overlay">
          {/* Path dotted trajectory line */}
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

      {/* 2. Character Bounding Box & Handles */}
      <g
        transform={`translate(${instance.x}, ${instance.y}) rotate(${instance.rotation})`}
      >
        {/* Transparent drag body to move */}
        <rect
          x={-halfW}
          y={-halfH}
          width={halfW * 2}
          height={halfH * 2}
          fill="rgba(59, 130, 246, 0.08)"
          stroke="#3b82f6"
          strokeWidth={1.5}
          rx={6}
          style={{ cursor: activeDrag === 'move' ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDownMove}
        />

        {/* Top rotation stem and handle */}
        <line x1={0} y1={-halfH} x2={0} y2={-halfH - 24} stroke="#3b82f6" strokeWidth={1.5} />
        <circle
          cx={0}
          cy={-halfH - 24}
          r={7}
          fill="#3b82f6"
          stroke="#ffffff"
          strokeWidth={2}
          style={{ cursor: 'crosshair' }}
          onPointerDown={handlePointerDownRotate}
        />

        {/* 4 Corner Scale Handles */}
        {/* Top-Left */}
        <rect
          x={-halfW - 5}
          y={-halfH - 5}
          width={10}
          height={10}
          fill="#ffffff"
          stroke="#3b82f6"
          strokeWidth={2}
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(e) => handlePointerDownScale(e, 'nw')}
        />
        {/* Top-Right */}
        <rect
          x={halfW - 5}
          y={-halfH - 5}
          width={10}
          height={10}
          fill="#ffffff"
          stroke="#3b82f6"
          strokeWidth={2}
          style={{ cursor: 'nesw-resize' }}
          onPointerDown={(e) => handlePointerDownScale(e, 'ne')}
        />
        {/* Bottom-Left */}
        <rect
          x={-halfW - 5}
          y={halfH - 5}
          width={10}
          height={10}
          fill="#ffffff"
          stroke="#3b82f6"
          strokeWidth={2}
          style={{ cursor: 'nesw-resize' }}
          onPointerDown={(e) => handlePointerDownScale(e, 'sw')}
        />
        {/* Bottom-Right */}
        <rect
          x={halfW - 5}
          y={halfH - 5}
          width={10}
          height={10}
          fill="#ffffff"
          stroke="#3b82f6"
          strokeWidth={2}
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(e) => handlePointerDownScale(e, 'se')}
        />
      </g>
    </g>
  );
};

