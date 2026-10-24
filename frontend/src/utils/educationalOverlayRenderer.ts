/**
 * Educational & Geographic Overlays SVG Renderer (Frontend)
 * 
 * Generates identical deterministic SVG markup for browser preview as the backend Resvg engine.
 */

import { EducationalOverlay } from '../types/animation';

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function calculateDrawProgress(elapsedMs: number, totalDurationMs: number): number {
  if (totalDurationMs <= 0) return 1.0;
  const rawT = Math.min(1.0, Math.max(0.0, elapsedMs / totalDurationMs));
  return rawT < 0.5
    ? 4 * rawT * rawT * rawT
    : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
}

export function renderEducationalOverlayXml(overlay: EducationalOverlay, sceneRelativeMs: number): string {
  const start = overlay.startMs;
  const duration = overlay.durationMs || 5000;
  const end = start + duration;

  if (sceneRelativeMs < start || sceneRelativeMs > end) {
    return '';
  }

  const elapsed = sceneRelativeMs - start;
  const entranceDuration = 350;
  const entranceT = Math.min(1.0, Math.max(0.0, elapsed / entranceDuration));
  const easeOut = 1 - Math.pow(1 - entranceT, 3);

  const remaining = end - sceneRelativeMs;
  const fadeOutOpacity = remaining < 250 ? Math.max(0.0, remaining / 250) : 1.0;

  switch (overlay.type) {
    case 'location_pin': {
      const x = overlay.x;
      const y = overlay.y;
      const size = overlay.radius || 18;
      const color = overlay.color || '#ef4444';
      const fillColor = overlay.fillColor || '#ffffff';
      const label = overlay.label || overlay.title;

      const dropOffsetY = (1 - easeOut) * -40;
      const pinOpacity = easeOut * fadeOutOpacity;

      const ripplePeriod = 1600;
      const ripplePhase = (elapsed % ripplePeriod) / ripplePeriod;
      const rippleRx = size * (0.8 + ripplePhase * 1.6);
      const rippleRy = rippleRx * 0.42;
      const rippleOpacity = (1 - ripplePhase) * 0.6 * fadeOutOpacity;

      const pinTipY = y + dropOffsetY;
      const pinCenterY = pinTipY - size * 1.5;

      const pinPathD = `
        M ${x} ${pinTipY}
        C ${x - size * 0.9} ${pinTipY - size * 0.9} ${x - size} ${pinTipY - size * 2.1} ${x} ${pinTipY - size * 2.1}
        C ${x + size} ${pinTipY - size * 2.1} ${x + size * 0.9} ${pinTipY - size * 0.9} ${x} ${pinTipY}
        Z
      `.trim();

      let labelXml = '';
      if (label) {
        const escaped = escapeXml(label);
        const textWidth = Math.max(70, escaped.length * 8.5 + 24);
        const textHeight = 26;
        const badgeY = pinTipY - size * 2.2 - textHeight - 4;
        labelXml = `
          <g transform="translate(${x}, ${badgeY})">
            <rect x="${-textWidth / 2}" y="0" width="${textWidth}" height="${textHeight}" rx="13" fill="#0f172a" fill-opacity="0.9" stroke="${color}" stroke-width="1.8"/>
            <text x="0" y="17" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" text-anchor="middle">${escaped}</text>
          </g>
        `;
      }

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay location-pin" opacity="${pinOpacity}">
          <ellipse cx="${x}" cy="${y}" rx="${rippleRx}" ry="${rippleRy}" fill="none" stroke="${color}" stroke-width="2" opacity="${rippleOpacity}"/>
          <ellipse cx="${x}" cy="${y + 1}" rx="${size * 0.65}" ry="${size * 0.25}" fill="rgba(0,0,0,0.35)"/>
          <path d="${pinPathD}" fill="${color}" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
          <circle cx="${x}" cy="${pinCenterY}" r="${size * 0.45}" fill="${fillColor}"/>
          <circle cx="${x}" cy="${pinCenterY}" r="${size * 0.22}" fill="${color}"/>
          ${labelXml}
        </g>
      `.trim();
    }

    case 'route_line': {
      const x1 = overlay.x;
      const y1 = overlay.y;
      const x2 = overlay.targetX ?? (x1 + 220);
      const y2 = overlay.targetY ?? (y1 + 80);
      const color = overlay.color || '#38bdf8';
      const strokeWidth = overlay.strokeWidth || 4.5;
      const progressDuration = overlay.progressDurationMs || 2000;

      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = mx - dy * 0.16;
      const cy = my + dx * 0.16;
      const pathD = overlay.pathD || `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
      const totalLength = Math.max(1, dist * 1.06);

      const progress = calculateDrawProgress(elapsed, progressDuration);
      const dashOffset = totalLength * (1 - progress);

      const t = progress;
      const headX = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
      const headY = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;

      const beaconPhase = (elapsed % 800) / 800;
      const beaconR = strokeWidth * (1.3 + beaconPhase * 0.6);

      let targetDotXml = '';
      if (progress >= 0.98) {
        targetDotXml = `
          <circle cx="${x2}" cy="${y2}" r="${strokeWidth * 1.6}" fill="${color}"/>
          <circle cx="${x2}" cy="${y2}" r="${strokeWidth * 0.9}" fill="#ffffff"/>
        `;
      }

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay route-line" opacity="${fadeOutOpacity}">
          <path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth * 2.8}" stroke-linecap="round" opacity="0.32" stroke-dasharray="${totalLength} ${totalLength}" stroke-dashoffset="${dashOffset}"/>
          <path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${totalLength} ${totalLength}" stroke-dashoffset="${dashOffset}"/>
          <path d="${pathD}" fill="none" stroke="#ffffff" stroke-width="${Math.max(1.5, strokeWidth * 0.35)}" stroke-linecap="round" opacity="0.75" stroke-dasharray="${totalLength} ${totalLength}" stroke-dashoffset="${dashOffset}"/>
          <circle cx="${x1}" cy="${y1}" r="${strokeWidth * 1.4}" fill="${color}"/>
          <circle cx="${x1}" cy="${y1}" r="${strokeWidth * 0.7}" fill="#ffffff"/>
          ${progress < 0.99 ? `
            <circle cx="${headX}" cy="${headY}" r="${beaconR}" fill="${color}" opacity="0.5"/>
            <circle cx="${headX}" cy="${headY}" r="${strokeWidth * 1.4}" fill="${color}"/>
            <circle cx="${headX}" cy="${headY}" r="${strokeWidth * 0.8}" fill="#ffffff"/>
          ` : targetDotXml}
        </g>
      `.trim();
    }

    case 'highlight_ring': {
      const x = overlay.x;
      const y = overlay.y;
      const baseR = overlay.radius || 45;
      const color = overlay.color || '#facc15';
      const strokeWidth = overlay.strokeWidth || 3.5;
      const pulseSpeed = overlay.pulseSpeedMs || 1500;

      const phase = ((elapsed % pulseSpeed) / pulseSpeed) * 2 * Math.PI;
      const pulseScale = 1.0 + 0.08 * Math.sin(phase);
      const currentR = baseR * pulseScale * easeOut;

      const radarPhase = (elapsed % pulseSpeed) / pulseSpeed;
      const radarR = baseR * (1.0 + radarPhase * 0.65);
      const radarOpacity = (1.0 - radarPhase) * 0.55 * fadeOutOpacity;

      const isDashed = overlay.style === 'dashed';
      const dashAttr = isDashed ? 'stroke-dasharray="8 6"' : '';

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay highlight-ring" opacity="${fadeOutOpacity}">
          <circle cx="${x}" cy="${y}" r="${currentR}" fill="${color}" fill-opacity="0.14"/>
          <circle cx="${x}" cy="${y}" r="${radarR}" fill="none" stroke="${color}" stroke-width="2" opacity="${radarOpacity}"/>
          <circle cx="${x}" cy="${y}" r="${currentR}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" ${dashAttr}/>
          <line x1="${x - currentR - 8}" y1="${y}" x2="${x - currentR + 3}" y2="${y}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
          <line x1="${x + currentR - 3}" y1="${y}" x2="${x + currentR + 8}" y2="${y}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
          <line x1="${x}" y1="${y - currentR - 8}" x2="${x}" y2="${y - currentR + 3}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
          <line x1="${x}" y1="${y + currentR - 3}" x2="${x}" y2="${y + currentR + 8}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
        </g>
      `.trim();
    }

    case 'arrow_pointer': {
      const x1 = overlay.x;
      const y1 = overlay.y;
      const x2 = overlay.targetX ?? (x1 + 120);
      const y2 = overlay.targetY ?? (y1 - 60);
      const color = overlay.color || '#f59e0b';
      const strokeWidth = overlay.strokeWidth || 4.0;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;

      const osc = Math.sin((elapsed / 600) * 2 * Math.PI) * 4.0;
      const headTipX = x2 + ux * osc;
      const headTipY = y2 + uy * osc;

      const headSize = Math.max(14, strokeWidth * 3.4);
      const headBaseX = headTipX - ux * headSize;
      const headBaseY = headTipY - uy * headSize;

      const p1 = `${headTipX},${headTipY}`;
      const p2 = `${headBaseX + nx * (headSize * 0.55)},${headBaseY + ny * (headSize * 0.55)}`;
      const p3 = `${headBaseX - nx * (headSize * 0.55)},${headBaseY - ny * (headSize * 0.55)}`;

      const animatedShaftEnd = easeOut;
      const shaftEndX = x1 + (headBaseX - x1) * animatedShaftEnd;
      const shaftEndY = y1 + (headBaseY - y1) * animatedShaftEnd;

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay arrow-pointer" opacity="${easeOut * fadeOutOpacity}">
          <line x1="${x1}" y1="${y1}" x2="${shaftEndX}" y2="${shaftEndY}" stroke="${color}" stroke-width="${strokeWidth * 2.2}" stroke-linecap="round" opacity="0.3"/>
          <line x1="${x1}" y1="${y1}" x2="${shaftEndX}" y2="${shaftEndY}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
          <circle cx="${x1}" cy="${y1}" r="${strokeWidth * 1.3}" fill="${color}"/>
          <polygon points="${p1} ${p2} ${p3}" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>
        </g>
      `.trim();
    }

    case 'callout_label': {
      const x = overlay.x;
      const y = overlay.y;
      const text = overlay.label || overlay.title || 'Educational Callout';
      const title = overlay.title && overlay.label && overlay.title !== overlay.label ? overlay.title : null;
      const color = overlay.color || '#38bdf8';
      const fillColor = overlay.fillColor || '#0f172a';
      const textColor = overlay.textColor || '#ffffff';
      const fontSize = overlay.fontSize || 14;

      const escapedText = escapeXml(text);
      const escapedTitle = title ? escapeXml(title) : null;

      const maxCharCount = Math.max(escapedText.length, escapedTitle ? escapedTitle.length : 0);
      const boxWidth = Math.max(130, maxCharCount * (fontSize * 0.65) + 36);
      const boxHeight = escapedTitle ? fontSize * 3.4 : fontSize * 2.5;
      const bx = x - boxWidth / 2;
      const by = y - boxHeight / 2;

      let leaderLineXml = '';
      if (overlay.hasConnectorLine && overlay.targetX !== undefined && overlay.targetY !== undefined) {
        const tx = overlay.targetX;
        const ty = overlay.targetY;
        const attachX = tx > x ? bx + boxWidth : bx;
        const attachY = y;
        leaderLineXml = `
          <circle cx="${tx}" cy="${ty}" r="4.5" fill="${color}"/>
          <circle cx="${tx}" cy="${ty}" r="2" fill="#ffffff"/>
          <path d="M ${tx} ${ty} L ${attachX} ${attachY}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4 3" opacity="0.85"/>
        `;
      }

      const riseOffsetY = (1 - easeOut) * 12;

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay callout-label" transform="translate(0, ${riseOffsetY})" opacity="${easeOut * fadeOutOpacity}">
          ${leaderLineXml}
          <rect x="${bx}" y="${by}" width="${boxWidth}" height="${boxHeight}" rx="${boxHeight / 2}" fill="${fillColor}" fill-opacity="0.92" stroke="${color}" stroke-width="2"/>
          <path d="M ${bx + 16} ${by + 3} Q ${x} ${by + 1.5} ${bx + boxWidth - 16} ${by + 3}" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.25"/>
          ${escapedTitle ? `
            <text x="${x}" y="${by + fontSize * 1.3}" fill="${color}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize * 0.85}" font-weight="700" text-anchor="middle" letter-spacing="0.5">${escapedTitle}</text>
            <text x="${x}" y="${by + fontSize * 2.6}" fill="${textColor}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="600" text-anchor="middle">${escapedText}</text>
          ` : `
            <text x="${x}" y="${y + fontSize * 0.35}" fill="${textColor}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="600" text-anchor="middle">${escapedText}</text>
          `}
        </g>
      `.trim();
    }

    default:
      return '';
  }
}

