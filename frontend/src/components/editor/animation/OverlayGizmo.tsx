import React, { useRef, useState } from 'react';
import { EducationalOverlay } from '../../../types/animation';

interface OverlayGizmoProps {
  overlay: EducationalOverlay;
  onUpdateOverlay: (updates: Partial<EducationalOverlay>) => void;
}

export const OverlayGizmo: React.FC<OverlayGizmoProps> = ({
  overlay,
  onUpdateOverlay,
}) => {
  const [activeDrag, setActiveDrag] = useState<'move' | 'target' | 'radius' | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
    startTargetX: number;
    startTargetY: number;
    startRadius: number;
    scaleFactor: number;
  } | null>(null);

  const handlePointerDown = (
    e: React.PointerEvent,
    mode: 'move' | 'target' | 'radius'
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setActiveDrag(mode);

    const svgEl = (e.target as Element).closest('svg');
    const svgRect = svgEl?.getBoundingClientRect();
    const scaleFactor = svgRect && svgRect.width > 0 ? 1280 / svgRect.width : 1;

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: overlay.x,
      startY: overlay.y,
      startTargetX: overlay.targetX ?? overlay.x + 150,
      startTargetY: overlay.targetY ?? overlay.y + 50,
      startRadius: overlay.radius || 40,
      scaleFactor,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag || !dragStartRef.current) return;
    const { pointerX, pointerY, startX, startY, startTargetX, startTargetY, startRadius, scaleFactor } = dragStartRef.current;
    const deltaX = (e.clientX - pointerX) * scaleFactor;
    const deltaY = (e.clientY - pointerY) * scaleFactor;

    if (activeDrag === 'move') {
      const newX = Math.round(startX + deltaX);
      const newY = Math.round(startY + deltaY);
      // Also shift target proportionally if it exists
      if (overlay.targetX !== undefined && overlay.targetY !== undefined) {
        onUpdateOverlay({
          x: newX,
          y: newY,
          targetX: Math.round(startTargetX + deltaX),
          targetY: Math.round(startTargetY + deltaY),
        });
      } else {
        onUpdateOverlay({ x: newX, y: newY });
      }
    } else if (activeDrag === 'target') {
      onUpdateOverlay({
        targetX: Math.round(startTargetX + deltaX),
        targetY: Math.round(startTargetY + deltaY),
      });
    } else if (activeDrag === 'radius') {
      const dist = Math.hypot(deltaX, deltaY);
      const newRadius = Math.max(15, Math.min(250, Math.round(startRadius + deltaX)));
      onUpdateOverlay({ radius: newRadius });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDrag) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setActiveDrag(null);
      dragStartRef.current = null;
    }
  };

  const hasTarget = overlay.type === 'route_line' || overlay.type === 'arrow_pointer' || (overlay.type === 'callout_label' && overlay.hasConnectorLine);
  const targetX = overlay.targetX ?? (overlay.x + 160);
  const targetY = overlay.targetY ?? (overlay.y + 60);

  return (
    <g
      className="overlay-gizmo"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ userSelect: 'none' }}
    >
      {/* 1. Main Position Handle at (x, y) */}
      <circle
        cx={overlay.x}
        cy={overlay.y}
        r={14}
        fill="rgba(56, 189, 248, 0.25)"
        stroke="#38bdf8"
        strokeWidth={2}
        strokeDasharray="3 3"
        style={{ cursor: 'move' }}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
      />
      <circle
        cx={overlay.x}
        cy={overlay.y}
        r={5}
        fill="#ffffff"
        stroke="#0284c7"
        strokeWidth={2}
        style={{ cursor: 'move' }}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
      />

      {/* 2. Target Handle if applicable */}
      {hasTarget && (
        <g>
          {/* Guide Line between position and target */}
          <line
            x1={overlay.x}
            y1={overlay.y}
            x2={targetX}
            y2={targetY}
            stroke="#38bdf8"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity={0.6}
            pointerEvents="none"
          />
          <circle
            cx={targetX}
            cy={targetY}
            r={13}
            fill="rgba(244, 63, 94, 0.25)"
            stroke="#f43f5e"
            strokeWidth={2}
            strokeDasharray="3 3"
            style={{ cursor: 'crosshair' }}
            onPointerDown={(e) => handlePointerDown(e, 'target')}
          />
          <circle
            cx={targetX}
            cy={targetY}
            r={5}
            fill="#ffffff"
            stroke="#e11d48"
            strokeWidth={2}
            style={{ cursor: 'crosshair' }}
            onPointerDown={(e) => handlePointerDown(e, 'target')}
          />
        </g>
      )}

      {/* 3. Radius Handle for Highlight Rings */}
      {overlay.type === 'highlight_ring' && (
        <g>
          <circle
            cx={overlay.x + (overlay.radius || 45)}
            cy={overlay.y}
            r={8}
            fill="#facc15"
            stroke="#ffffff"
            strokeWidth={1.5}
            style={{ cursor: 'ew-resize' }}
            onPointerDown={(e) => handlePointerDown(e, 'radius')}
          />
        </g>
      )}
    </g>
  );
};

