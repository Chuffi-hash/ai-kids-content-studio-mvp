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

    case 'spotlight': {
      const targetX = overlay.x;
      const targetY = overlay.y;
      const sourceX = overlay.targetX ?? targetX;
      const sourceY = overlay.targetY ?? 0;
      const radius = overlay.radius || 130;
      const color = overlay.color || '#fef08a';
      const pulseSpeed = overlay.pulseSpeedMs || 2200;
      const pulse = 1.0 + 0.04 * Math.sin(((elapsed % pulseSpeed) / pulseSpeed) * 2 * Math.PI);
      const currentRadius = radius * pulse * easeOut;

      const beamOpacity = 0.22 * easeOut * fadeOutOpacity;
      const groundOpacity = 0.35 * easeOut * fadeOutOpacity;

      const coneLeftX = targetX - currentRadius;
      const coneRightX = targetX + currentRadius;

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay spotlight" opacity="${fadeOutOpacity}">
          <defs>
            <linearGradient id="spotlight-grad-${overlay.id}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.05"/>
              <stop offset="70%" stop-color="${color}" stop-opacity="${beamOpacity}"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="${beamOpacity * 1.5}"/>
            </linearGradient>
            <radialGradient id="spotlight-pool-${overlay.id}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="${color}" stop-opacity="${groundOpacity}"/>
              <stop offset="60%" stop-color="${color}" stop-opacity="${groundOpacity * 0.5}"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <polygon points="${sourceX},${sourceY} ${coneRightX},${targetY} ${coneLeftX},${targetY}" fill="url(#spotlight-grad-${overlay.id})" />
          <ellipse cx="${targetX}" cy="${targetY}" rx="${currentRadius}" ry="${currentRadius * 0.38}" fill="url(#spotlight-pool-${overlay.id})" />
        </g>
      `.trim();
    }

    case 'glow': {
      const x = overlay.x;
      const y = overlay.y;
      const radius = overlay.radius || 90;
      const color = overlay.color || '#38bdf8';
      const pulseSpeed = overlay.pulseSpeedMs || 1800;
      const phase = ((elapsed % pulseSpeed) / pulseSpeed) * 2 * Math.PI;
      const pulse = 1.0 + 0.12 * Math.sin(phase);
      const r = radius * pulse * easeOut;
      const glowOpacity = 0.45 * easeOut * fadeOutOpacity;

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay glow" opacity="${fadeOutOpacity}">
          <defs>
            <radialGradient id="glow-grad-${overlay.id}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="${color}" stop-opacity="${glowOpacity}"/>
              <stop offset="45%" stop-color="${color}" stop-opacity="${glowOpacity * 0.6}"/>
              <stop offset="80%" stop-color="${color}" stop-opacity="${glowOpacity * 0.2}"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="${x}" cy="${y}" r="${r * 1.4}" fill="url(#glow-grad-${overlay.id})" />
          <circle cx="${x}" cy="${y}" r="${r * 0.7}" fill="${color}" fill-opacity="${glowOpacity * 0.25}" />
        </g>
      `.trim();
    }

    case 'sparkles': {
      const centerX = overlay.x;
      const centerY = overlay.y;
      const areaR = overlay.radius || 80;
      const color = overlay.color || '#fde047';

      const sparkleConfigs = [
        { dx: -0.45, dy: -0.35, size: 10, freq: 1100, shift: 0 },
        { dx: 0.5, dy: -0.4, size: 12, freq: 950, shift: 1.8 },
        { dx: -0.2, dy: 0.45, size: 8, freq: 1300, shift: 3.2 },
        { dx: 0.4, dy: 0.35, size: 11, freq: 1050, shift: 4.5 },
        { dx: 0.0, dy: -0.6, size: 9, freq: 850, shift: 2.1 },
        { dx: -0.55, dy: 0.1, size: 7, freq: 1200, shift: 5.0 },
      ];

      const starsXml = sparkleConfigs.map((sp) => {
        const sx = centerX + sp.dx * areaR;
        const sy = centerY + sp.dy * areaR;
        const phase = ((elapsed + sp.shift * 1000) % sp.freq) / sp.freq;
        const scale = (0.2 + 0.8 * Math.sin(phase * Math.PI)) * easeOut;
        const opacity = (0.3 + 0.7 * Math.sin(phase * Math.PI)) * fadeOutOpacity;
        const s = sp.size * scale;
        const d = `M ${sx} ${sy - s} Q ${sx} ${sy} ${sx + s} ${sy} Q ${sx} ${sy} ${sx} ${sy + s} Q ${sx} ${sy} ${sx - s} ${sy} Q ${sx} ${sy} ${sx} ${sy - s} Z`;
        return `<path d="${d}" fill="${color}" opacity="${Math.max(0, opacity).toFixed(3)}"/>`;
      }).join('\n');

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay sparkles">
          ${starsXml}
        </g>
      `.trim();
    }

    case 'flying_birds': {
      const startX = overlay.x;
      const startY = overlay.y;
      const endX = overlay.targetX ?? (startX + 450);
      const endY = overlay.targetY ?? (startY - 30);
      const color = overlay.color || '#334155';
      const strokeWidth = overlay.strokeWidth || 2.2;

      const t = Math.min(1.0, Math.max(0.0, elapsed / duration));
      const curX = startX + (endX - startX) * t;
      const curY = startY + (endY - startY) * t;

      const birds = [
        { offsetX: 0, offsetY: 0, scale: 1.0, phaseOffset: 0 },
        { offsetX: -28, offsetY: 14, scale: 0.82, phaseOffset: 0.25 },
        { offsetX: -52, offsetY: 26, scale: 0.72, phaseOffset: 0.5 },
        { offsetX: -22, offsetY: -16, scale: 0.85, phaseOffset: 0.15 },
      ];

      const birdsXml = birds.map((b) => {
        const bx = curX + b.offsetX;
        const by = curY + b.offsetY;
        const flapCycle = ((elapsed + b.phaseOffset * 1000) % 320) / 320;
        const wingAngle = Math.sin(flapCycle * 2 * Math.PI);
        const wingUp = -8 * wingAngle * b.scale;
        const wingSpan = 14 * b.scale;
        const d = `M ${bx - wingSpan} ${by + wingUp} Q ${bx - wingSpan * 0.4} ${by - 2} ${bx} ${by} Q ${bx + wingSpan * 0.4} ${by - 2} ${bx + wingSpan} ${by + wingUp}`;
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth * b.scale}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('\n');

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay flying-birds" opacity="${fadeOutOpacity}">
          ${birdsXml}
        </g>
      `.trim();
    }

    case 'moving_clouds': {
      const startX = overlay.x;
      const y = overlay.y;
      const endX = overlay.targetX ?? (startX + 350);
      const width = overlay.width || 140;
      const height = overlay.height || 50;
      const fillColor = overlay.fillColor || '#ffffff';
      const opacity = (overlay.strokeWidth ? 0.9 : 0.82) * fadeOutOpacity;

      const t = Math.min(1.0, Math.max(0.0, elapsed / duration));
      const curX = startX + (endX - startX) * t;

      const r1 = height * 0.5;
      const r2 = height * 0.7;
      const r3 = height * 0.55;

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay moving-clouds" opacity="${opacity}">
          <rect x="${curX}" y="${y}" width="${width}" height="${height * 0.7}" rx="${height * 0.35}" fill="${fillColor}"/>
          <circle cx="${curX + width * 0.28}" cy="${y + height * 0.2}" r="${r1}" fill="${fillColor}"/>
          <circle cx="${curX + width * 0.55}" cy="${y + height * 0.1}" r="${r2}" fill="${fillColor}"/>
          <circle cx="${curX + width * 0.8}" cy="${y + height * 0.25}" r="${r3}" fill="${fillColor}"/>
        </g>
      `.trim();
    }

    case 'title_card': {
      const x = overlay.x;
      const y = overlay.y;
      const title = overlay.title || overlay.label || 'LESSON TITLE';
      const label = overlay.label && overlay.title && overlay.label !== overlay.title ? overlay.label : null;
      const color = overlay.color || '#38bdf8';
      const fillColor = overlay.fillColor || '#0f172a';
      const textColor = overlay.textColor || '#ffffff';
      const fontSize = overlay.fontSize || 22;

      const escapedTitle = escapeXml(title);
      const escapedLabel = label ? escapeXml(label) : null;

      const textLen = Math.max(escapedTitle.length, escapedLabel ? escapedLabel.length : 0);
      const cardWidth = Math.max(260, textLen * (fontSize * 0.6) + 64);
      const cardHeight = escapedLabel ? fontSize * 3.6 : fontSize * 2.6;
      const bx = x - cardWidth / 2;
      const by = y - cardHeight / 2;

      const slideY = (1 - easeOut) * 20;
      const wipeProgress = calculateDrawProgress(elapsed, 600);
      const wipeWidth = cardWidth * wipeProgress;

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay title-card" transform="translate(0, ${slideY})" opacity="${easeOut * fadeOutOpacity}">
          <rect x="${bx + 4}" y="${by + 4}" width="${cardWidth}" height="${cardHeight}" rx="8" fill="rgba(0,0,0,0.4)"/>
          <rect x="${bx}" y="${by}" width="${cardWidth}" height="${cardHeight}" rx="8" fill="${fillColor}" fill-opacity="0.94" stroke="${color}" stroke-width="2"/>
          <line x1="${bx}" y1="${by}" x2="${bx + wipeWidth}" y2="${by}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
          <rect x="${bx}" y="${by}" width="6" height="${cardHeight}" rx="3" fill="${color}"/>
          <text x="${x}" y="${by + (escapedLabel ? fontSize * 1.4 : fontSize * 1.6)}" fill="${textColor}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="middle" letter-spacing="1">
            ${escapedTitle}
          </text>
          ${escapedLabel ? `
            <text x="${x}" y="${by + fontSize * 2.7}" fill="${color}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize * 0.65}" font-weight="600" text-anchor="middle" letter-spacing="0.5">
              ${escapedLabel}
            </text>
          ` : ''}
        </g>
      `.trim();
    }

    case 'rain': {
      const color = overlay.color || '#38bdf8';
      const intensity = overlay.strokeWidth || 1.8;
      const count = 24;
      const drops = Array.from({ length: count }, (_, i) => {
        const seedX = (i * 53 + 37) % 1280;
        const seedY = (i * 47 + 19) % 720;
        const speed = 1.1 + (i % 5) * 0.2;
        const yOffset = (elapsed * speed * 0.9) % 720;
        const curY = (seedY + yOffset) % 720;
        const curX = (seedX - (curY - seedY) * 0.15 + 1280) % 1280;
        const len = 16 * speed;
        return `<line x1="${curX.toFixed(1)}" y1="${curY.toFixed(1)}" x2="${(curX - 4).toFixed(1)}" y2="${(curY + len).toFixed(1)}" stroke="${color}" stroke-width="${intensity}" stroke-linecap="round" opacity="${(0.4 + (i % 3) * 0.2) * fadeOutOpacity}"/>`;
      }).join('\n');

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay rain">
          ${drops}
        </g>
      `.trim();
    }

    case 'snowfall': {
      const color = overlay.color || '#ffffff';
      const count = 20;
      const flakes = Array.from({ length: count }, (_, i) => {
        const seedX = (i * 67 + 23) % 1280;
        const seedY = (i * 51 + 31) % 720;
        const speed = 0.18 + (i % 4) * 0.08;
        const curY = (seedY + elapsed * speed) % 720;
        const sway = Math.sin((elapsed / (800 + i * 100)) * 2 * Math.PI) * (12 + (i % 8) * 3);
        const curX = (seedX + sway + 1280) % 1280;
        const r = 2.5 + (i % 4) * 1.2;
        const op = (0.5 + (i % 4) * 0.15) * fadeOutOpacity;
        return `<circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="${op.toFixed(2)}"/>`;
      }).join('\n');

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay snowfall">
          ${flakes}
        </g>
      `.trim();
    }

    case 'wind': {
      const color = overlay.color || '#e2e8f0';
      const strokeW = overlay.strokeWidth || 2;
      const streaks = [
        { y: 180, len: 260, speed: 0.6, shift: 0 },
        { y: 320, len: 320, speed: 0.85, shift: 400 },
        { y: 460, len: 240, speed: 0.7, shift: 800 },
        { y: 240, len: 280, speed: 0.9, shift: 1200 },
      ].map((st, i) => {
        const xOffset = ((elapsed + st.shift) * st.speed) % 1600 - 300;
        return `<path d="M ${xOffset} ${st.y} Q ${xOffset + st.len * 0.6} ${st.y - 15} ${xOffset + st.len} ${st.y + 10}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round" opacity="${0.35 * fadeOutOpacity}"/>`;
      }).join('\n');

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay wind">
          ${streaks}
        </g>
      `.trim();
    }

    case 'falling_leaves': {
      const colors = ['#f59e0b', '#ef4444', '#d97706', '#ea580c', '#ca8a04'];
      const count = 12;
      const leaves = Array.from({ length: count }, (_, i) => {
        const seedX = (i * 103 + 47) % 1280;
        const seedY = (i * 79 + 17) % 720;
        const speed = 0.22 + (i % 3) * 0.08;
        const curY = (seedY + elapsed * speed) % 720;
        const sway = Math.sin((elapsed / (900 + i * 150)) * 2 * Math.PI) * 35;
        const curX = (seedX + sway + 1280) % 1280;
        const rot = (elapsed * 0.15 + i * 45) % 360;
        const color = colors[i % colors.length];
        const sz = 10 + (i % 4) * 3;
        return `
          <g transform="translate(${curX.toFixed(1)}, ${curY.toFixed(1)}) rotate(${rot.toFixed(1)})" opacity="${0.85 * fadeOutOpacity}">
            <path d="M 0 ${-sz} Q ${sz * 0.6} 0 0 ${sz} Q ${-sz * 0.6} 0 0 ${-sz} Z" fill="${color}"/>
            <line x1="0" y1="${-sz}" x2="0" y2="${sz}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
          </g>
        `;
      }).join('\n');

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay falling-leaves">
          ${leaves}
        </g>
      `.trim();
    }

    case 'sunshine_rays': {
      const color = overlay.color || '#fef08a';
      const pulse = 1.0 + 0.06 * Math.sin((elapsed / 1400) * 2 * Math.PI);
      const op = 0.25 * pulse * easeOut * fadeOutOpacity;
      const rays = [
        `M 0 0 L 380 720 L 520 720 Z`,
        `M 0 0 L 640 720 L 780 720 Z`,
        `M 0 0 L 920 720 L 1060 720 Z`,
        `M 0 0 L 1180 720 L 1280 640 Z`,
      ].map((d, i) => `<path key="${i}" d="${d}" fill="url(#sun-beam-grad-${overlay.id})" />`).join('\n');

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay sunshine-rays" opacity="${op}">
          <defs>
            <linearGradient id="sun-beam-grad-${overlay.id}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.7"/>
              <stop offset="60%" stop-color="${color}" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          ${rays}
        </g>
      `.trim();
    }

    case 'heat_shimmer': {
      const color = overlay.color || '#fde047';
      const baseY = overlay.y || 480;
      const lines = [0, 40, 80, 120].map((dy, i) => {
        const y = baseY + dy;
        const wave = Math.sin((elapsed / 600 + i) * 2 * Math.PI) * 8;
        return `<path d="M 0 ${y + wave} Q 320 ${y - wave} 640 ${y + wave} T 1280 ${y + wave}" fill="none" stroke="${color}" stroke-width="1.8" opacity="${0.22 * fadeOutOpacity}"/>`;
      }).join('\n');

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay heat-shimmer">
          ${lines}
        </g>
      `.trim();
    }

    case 'fog_mist': {
      const color = overlay.color || '#f8fafc';
      const baseY = overlay.y || 520;
      const t = (elapsed * 0.04) % 1280;
      return `
        <g id="overlay-${overlay.id}" class="edu-overlay fog-mist" opacity="${0.45 * easeOut * fadeOutOpacity}">
          <ellipse cx="${(200 + t) % 1400 - 100}" cy="${baseY}" rx="240" ry="60" fill="${color}" opacity="0.35"/>
          <ellipse cx="${(600 + t) % 1400 - 100}" cy="${baseY + 30}" rx="320" ry="70" fill="${color}" opacity="0.4"/>
          <ellipse cx="${(1000 + t) % 1400 - 100}" cy="${baseY - 10}" rx="280" ry="65" fill="${color}" opacity="0.3"/>
        </g>
      `.trim();
    }

    case 'lightning': {
      const cycle = elapsed % 3200;
      if (cycle > 220) return '';
      const flashOp = (1 - cycle / 220) * 0.85 * fadeOutOpacity;
      const color = overlay.color || '#ffffff';
      return `
        <g id="overlay-${overlay.id}" class="edu-overlay lightning" opacity="${flashOp}">
          <rect width="1280" height="720" fill="#ffffff" opacity="${flashOp * 0.3}"/>
          <path d="M 640 0 L 610 220 L 660 240 L 590 480 L 630 490 L 580 720" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M 640 0 L 610 220 L 660 240 L 590 480 L 630 490 L 580 720" fill="none" stroke="#38bdf8" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
        </g>
      `.trim();
    }

    case 'water_splashes': {
      const x = overlay.x || 640;
      const y = overlay.y || 540;
      const color = overlay.color || '#38bdf8';
      const period = 1200;
      const phase = (elapsed % period) / period;
      const r = (overlay.radius || 40) * phase;
      const op = (1 - phase) * 0.7 * fadeOutOpacity;
      return `
        <g id="overlay-${overlay.id}" class="edu-overlay water-splashes" opacity="${fadeOutOpacity}">
          <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.35}" fill="none" stroke="${color}" stroke-width="2.5" opacity="${op}"/>
          <ellipse cx="${x}" cy="${y}" rx="${r * 1.5}" ry="${r * 0.5}" fill="none" stroke="${color}" stroke-width="1.8" opacity="${op * 0.6}"/>
        </g>
      `.trim();
    }

    case 'butterflies': {
      const startX = overlay.x || 300;
      const startY = overlay.y || 400;
      const color1 = overlay.color || '#f43f5e';
      const color2 = '#38bdf8';
      const period = 2400;
      const phase = (elapsed % period) / period;
      const t = phase * 2 * Math.PI;
      const bx = startX + Math.sin(t) * 120;
      const by = startY + Math.sin(t * 2) * 50;
      const wingFlap = Math.abs(Math.sin((elapsed / 120) * Math.PI));
      const wingW = 14 * wingFlap;

      return `
        <g id="overlay-${overlay.id}" class="edu-overlay butterflies" transform="translate(${bx.toFixed(1)}, ${by.toFixed(1)})" opacity="${easeOut * fadeOutOpacity}">
          <ellipse cx="${-wingW * 0.6}" cy="-4" rx="${wingW}" ry="10" fill="${color1}" opacity="0.85"/>
          <ellipse cx="${wingW * 0.6}" cy="-4" rx="${wingW}" ry="10" fill="${color1}" opacity="0.85"/>
          <ellipse cx="${-wingW * 0.5}" cy="6" rx="${wingW * 0.7}" ry="7" fill="${color2}" opacity="0.85"/>
          <ellipse cx="${wingW * 0.5}" cy="6" rx="${wingW * 0.7}" ry="7" fill="${color2}" opacity="0.85"/>
          <ellipse cx="0" cy="0" rx="2.5" ry="8" fill="#1e293b"/>
        </g>
      `.trim();
    }

    default:
      return '';
  }
}

