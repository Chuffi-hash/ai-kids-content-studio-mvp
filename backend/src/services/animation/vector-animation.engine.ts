import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';
import {
  VectorRigDefinition,
  VectorRigPart,
  VectorPartShape,
  getVectorRig,
} from './templates/default-characters.js';

export interface MotionPath {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  easing?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
}

export interface CharacterInstance {
  instanceId: string;
  characterId: string;
  assetType?: string;
  name?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  zIndex: number;
}

export interface AnimationClip {
  clipId: string;
  instanceId: string;
  action: 'idle' | 'walk' | 'wave' | 'jump';
  startMs: number;
  durationMs: number;
  loop: boolean;
  speedMultiplier?: number;
  motionMode?: 'in_place' | 'motion_path';
  motionPath?: MotionPath;
}

export interface VectorSceneData {
  version: number;
  viewport: { width: number; height: number };
  background?: {
    imageUrl: string;
    fit?: 'cover' | 'contain';
  };
  characterInstances: CharacterInstance[];
  animationClips: AnimationClip[];
}

export interface EvaluatedPose {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  torsoBobY: number;
  torsoAngle: number;
  headAngle: number;
  leftArmAngle: number;
  rightArmAngle: number;
  leftForearmAngle: number;
  rightForearmAngle: number;
  leftLegAngle: number;
  rightLegAngle: number;
  chestScaleY: number;
  activeAction: string;
}

/**
 * Deterministically evaluates character poses at any timestamp.
 */
export function evaluatePose(
  instance: CharacterInstance,
  clips: AnimationClip[],
  sceneRelativeMs: number
): EvaluatedPose {
  const instanceClips = clips.filter((c) => c.instanceId === instance.instanceId);

  let activeClip: AnimationClip | null = null;
  for (const clip of instanceClips) {
    const endMs = clip.startMs + clip.durationMs;
    if (sceneRelativeMs >= clip.startMs && sceneRelativeMs <= endMs) {
      activeClip = clip;
      break;
    }
  }

  let currentX = instance.x;
  let currentY = instance.y;
  let currentScale = instance.scale || 1.0;
  let currentRotation = instance.rotation || 0;
  let currentFlipX = instance.flipX || false;

  let torsoBobY = 0;
  let torsoAngle = 0;
  let headAngle = 0;
  let leftArmAngle = 0;
  let rightArmAngle = 0;
  let leftForearmAngle = 0;
  let rightForearmAngle = 0;
  let leftLegAngle = 0;
  let rightLegAngle = 0;
  let chestScaleY = 1.0;
  let activeAction = 'idle';

  if (!activeClip) {
    activeAction = 'idle';
    const tSec = sceneRelativeMs / 1000;
    chestScaleY = 1.0 + 0.02 * Math.sin(2 * Math.PI * 0.6 * tSec);
    headAngle = 1.5 * Math.sin(2 * Math.PI * 0.4 * tSec);
    leftArmAngle = 6 + 2 * Math.sin(2 * Math.PI * 0.6 * tSec);
    rightArmAngle = -6 - 2 * Math.sin(2 * Math.PI * 0.6 * tSec);
  } else {
    activeAction = activeClip.action;
    const clipOffsetMs = sceneRelativeMs - activeClip.startMs;
    const durationMs = Math.max(100, activeClip.durationMs);
    const speed = activeClip.speedMultiplier || 1.0;

    const uRaw = clipOffsetMs / durationMs;
    const u = activeClip.loop ? uRaw % 1.0 : Math.min(1.0, Math.max(0.0, uRaw));

    switch (activeClip.action) {
      case 'walk': {
        const strideFreq = 1.6 * speed;
        const phase = 2 * Math.PI * strideFreq * (clipOffsetMs / 1000);

        leftLegAngle = 28 * Math.sin(phase);
        rightLegAngle = -28 * Math.sin(phase);
        leftArmAngle = -20 * Math.sin(phase);
        rightArmAngle = 20 * Math.sin(phase);
        torsoBobY = -7 * Math.abs(Math.sin(phase));
        torsoAngle = 2.5 * Math.sin(phase);
        headAngle = -2 * Math.sin(phase);

        if (activeClip.motionMode === 'motion_path' && activeClip.motionPath) {
          const path = activeClip.motionPath;
          let progress = u;

          if (path.easing === 'easeInOut') {
            progress = progress < 0.5
              ? 2 * progress * progress
              : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          } else if (path.easing === 'easeIn') {
            progress = progress * progress;
          } else if (path.easing === 'easeOut') {
            progress = 1 - (1 - progress) * (1 - progress);
          }

          currentX = path.startX + (path.endX - path.startX) * progress;
          currentY = path.startY + (path.endY - path.startY) * progress;

          if (path.endX < path.startX) {
            currentFlipX = true;
          } else if (path.endX > path.startX) {
            currentFlipX = false;
          }
        }
        break;
      }

      case 'wave': {
        const waveFreq = 3.2 * speed;
        const phase = 2 * Math.PI * waveFreq * (clipOffsetMs / 1000);

        rightArmAngle = -135;
        rightForearmAngle = -20 + 26 * Math.sin(phase);
        leftArmAngle = 8 + 2 * Math.sin(phase * 0.3);
        torsoAngle = -2;
        headAngle = -4;
        break;
      }

      case 'jump': {
        const jumpHeight = 110;
        const verticalDisplacement = -4 * jumpHeight * u * (1 - u);
        currentY = instance.y + verticalDisplacement;

        if (u < 0.15) {
          chestScaleY = 0.85;
          leftLegAngle = 14;
          rightLegAngle = -14;
          leftArmAngle = -15;
          rightArmAngle = 15;
        } else if (u > 0.85) {
          chestScaleY = 0.88;
          leftLegAngle = 10;
          rightLegAngle = -10;
          leftArmAngle = 10;
          rightArmAngle = -10;
        } else {
          chestScaleY = 1.08;
          leftLegAngle = -10;
          rightLegAngle = 10;
          leftArmAngle = -50;
          rightArmAngle = 50;
        }
        break;
      }

      case 'idle':
      default: {
        const idleFreq = 0.6 * speed;
        const phase = 2 * Math.PI * idleFreq * (clipOffsetMs / 1000);
        chestScaleY = 1.0 + 0.025 * Math.sin(phase);
        headAngle = 2 * Math.sin(phase * 0.7);
        leftArmAngle = 6 + 2 * Math.sin(phase);
        rightArmAngle = -6 - 2 * Math.sin(phase);
        break;
      }
    }
  }

  return {
    x: Math.round(currentX * 10) / 10,
    y: Math.round(currentY * 10) / 10,
    scale: currentScale,
    rotation: currentRotation,
    flipX: currentFlipX,
    torsoBobY: Math.round(torsoBobY * 10) / 10,
    torsoAngle: Math.round(torsoAngle * 10) / 10,
    headAngle: Math.round(headAngle * 10) / 10,
    leftArmAngle: Math.round(leftArmAngle * 10) / 10,
    rightArmAngle: Math.round(rightArmAngle * 10) / 10,
    leftForearmAngle: Math.round(leftForearmAngle * 10) / 10,
    rightForearmAngle: Math.round(rightForearmAngle * 10) / 10,
    leftLegAngle: Math.round(leftLegAngle * 10) / 10,
    rightLegAngle: Math.round(rightLegAngle * 10) / 10,
    chestScaleY: Math.round(chestScaleY * 1000) / 1000,
    activeAction,
  };
}

function renderShapeXml(shape: VectorPartShape): string {
  const opacityAttr = shape.opacity !== undefined
    ? `opacity="${shape.opacity}"`
    : (shape.transform?.includes('opacity') ? 'opacity="0.5"' : '');

  switch (shape.type) {
    case 'circle':
      return `<circle cx="${shape.cx ?? 0}" cy="${shape.cy ?? 0}" r="${shape.r ?? 0}" fill="${shape.fill || 'none'}" ${shape.stroke ? `stroke="${shape.stroke}" stroke-width="${shape.strokeWidth || 1}"` : ''} ${opacityAttr}/>`;
    case 'ellipse':
      return `<ellipse cx="${shape.cx ?? 0}" cy="${shape.cy ?? 0}" rx="${shape.rx ?? 0}" ry="${shape.ry ?? 0}" fill="${shape.fill || 'none'}" ${shape.stroke ? `stroke="${shape.stroke}" stroke-width="${shape.strokeWidth || 1}"` : ''} ${opacityAttr}/>`;
    case 'rect':
      return `<rect x="${shape.x ?? 0}" y="${shape.y ?? 0}" width="${shape.width ?? 0}" height="${shape.height ?? 0}" fill="${shape.fill || 'none'}" ${shape.stroke ? `stroke="${shape.stroke}" stroke-width="${shape.strokeWidth || 1}"` : ''} ${opacityAttr}/>`;
    case 'path':
    default:
      return `<path d="${shape.d || ''}" fill="${shape.fill || 'none'}" ${shape.stroke ? `stroke="${shape.stroke}" stroke-width="${shape.strokeWidth || 1}"` : ''} ${shape.strokeLinecap ? `stroke-linecap="${shape.strokeLinecap}"` : ''} ${shape.strokeLinejoin ? `stroke-linejoin="${shape.strokeLinejoin}"` : ''} ${opacityAttr}/>`;
  }
}

function renderPartXml(part: VectorRigPart, transform: string): string {
  const shapesXml = part.shapes.map(renderShapeXml).join('');
  return `<g id="${part.id}" transform="${transform}">${shapesXml}</g>`;
}

export class VectorAnimationEngine {
  private base64ImageCache = new Map<string, string>();

  /**
   * Generates a complete SVG frame XML document.
   */
  generateSvgFrame(options: {
    animationData: VectorSceneData;
    timestampSec: number;
    width?: number;
    height?: number;
    resolveLocalPath?: (url: string) => string;
  }): string {
    const { animationData, timestampSec, width = 1280, height = 720, resolveLocalPath } = options;
    const sceneRelativeMs = timestampSec * 1000;

    let backgroundXml = '';
    if (animationData.background?.imageUrl && resolveLocalPath) {
      const localImagePath = resolveLocalPath(animationData.background.imageUrl);
      if (fs.existsSync(localImagePath)) {
        let base64 = this.base64ImageCache.get(localImagePath);
        if (!base64) {
          const buffer = fs.readFileSync(localImagePath);
          const ext = path.extname(localImagePath).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          base64 = `data:${mime};base64,${buffer.toString('base64')}`;
          this.base64ImageCache.set(localImagePath, base64);
        }
        backgroundXml = `<image href="${base64}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`;
      }
    }

    if (!backgroundXml) {
      backgroundXml = `
        <rect width="${width}" height="${height}" fill="#101726"/>
        <line x1="0" y1="540" x2="${width}" y2="540" stroke="#1e293b" stroke-width="2"/>
        <rect x="0" y="540" width="${width}" height="180" fill="#0d131f" opacity="0.6"/>
      `;
    }

    const instances = animationData.characterInstances || [];
    const clips = animationData.animationClips || [];
    const sortedInstances = [...instances].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    const charactersXml = sortedInstances
      .map((instance) => {
        const rig = getVectorRig(instance.characterId);
        const pose = evaluatePose(instance, clips, sceneRelativeMs);
        const parts = rig.parts;

        const rootTransform = `translate(${pose.x}, ${pose.y}) scale(${pose.scale * (pose.flipX ? -1 : 1)}, ${pose.scale}) rotate(${pose.rotation})`;
        const leftLegTransform = `rotate(${pose.leftLegAngle}, ${parts.leftLeg.pivot.x}, ${parts.leftLeg.pivot.y})`;
        const rightLegTransform = `rotate(${pose.rightLegAngle}, ${parts.rightLeg.pivot.x}, ${parts.rightLeg.pivot.y})`;
        const torsoTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.torsoAngle}, ${parts.torso.pivot.x}, ${parts.torso.pivot.y}) scale(1, ${pose.chestScaleY})`;
        const leftArmTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.leftArmAngle}, ${parts.leftArm.pivot.x}, ${parts.leftArm.pivot.y})`;
        const rightArmTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.rightArmAngle + pose.rightForearmAngle}, ${parts.rightArm.pivot.x}, ${parts.rightArm.pivot.y})`;
        const headTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.headAngle}, ${parts.head.pivot.x}, ${parts.head.pivot.y})`;

        const shadowY = pose.y + (rig.baseHeight / 2) * pose.scale - 8;
        const shadowRx = 40 * pose.scale;
        const shadowRy = 12 * pose.scale;
        const shadowXml = `<ellipse cx="${pose.x}" cy="${shadowY}" rx="${shadowRx}" ry="${shadowRy}" fill="rgba(0,0,0,0.3)"/>`;

        const characterXml = `
          <g id="char-${instance.instanceId}" data-character="${instance.characterId}" transform="${rootTransform}">
            ${renderPartXml(parts.leftLeg, leftLegTransform)}
            ${renderPartXml(parts.rightLeg, rightLegTransform)}
            ${renderPartXml(parts.leftArm, leftArmTransform)}
            ${renderPartXml(parts.torso, torsoTransform)}
            ${renderPartXml(parts.rightArm, rightArmTransform)}
            ${renderPartXml(parts.head, headTransform)}
          </g>
        `;

        return `${shadowXml}\n${characterXml}`;
      })
      .join('\n');

    return `
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
        <g id="background-layer">
          ${backgroundXml}
        </g>
        <g id="characters-layer">
          ${charactersXml}
        </g>
      </svg>
    `.trim();
  }

  /**
   * Rasterizes an SVG string into a high-quality PNG buffer using @resvg/resvg-js.
   */
  rasterizeSvgToPng(svgXml: string, width = 1280): Buffer {
    const resvg = new Resvg(svgXml, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: true },
    });
    const pngData = resvg.render();
    return Buffer.from(pngData.asPng());
  }
}
