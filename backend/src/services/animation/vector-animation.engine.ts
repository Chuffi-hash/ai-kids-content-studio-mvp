import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';
import {
  VectorRigDefinition,
  VectorRigPart,
  VectorPartShape,
  getVectorRig,
} from './templates/default-characters.js';
import {
  buildRigFromAppearance,
  CustomCharacterAppearance,
} from './templates/custom-character-rig.js';
import { getHeadShapesForPose } from './face-renderer.js';

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
  customRig?: VectorRigDefinition;
  appearance?: CustomCharacterAppearance;
  expression?: FacialExpression;
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

export type FacialExpression =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'scared'
  | 'confused'
  | 'curious';

export type MouthShape = 'rest' | 'open' | 'wide' | 'round' | 'closed';

export type SpeakingDirection =
  | 'cheerful'
  | 'excited'
  | 'calm'
  | 'sad'
  | 'worried'
  | 'curious'
  | 'serious';

export interface ExpressionCue {
  id?: string;
  instanceId?: string;
  characterInstanceId?: string;
  characterId?: string;
  expression: FacialExpression;
  startMs: number;
  durationMs: number;
}

export interface VisemeCue {
  timeMs: number;
  shape: MouthShape;
  durationMs: number;
}

export interface SceneDialogue {
  id: string;
  characterId?: string;
  characterInstanceId?: string;
  characterName: string;
  text: string;
  voice?: string;
  speakingDirection?: SpeakingDirection;
  speed?: number;
  audioUrl?: string;
  startMs: number;
  durationMs: number;
  visemeCues?: VisemeCue[];
}

export interface CharacterVoiceConfig {
  voiceId: string;
  speed?: number;
  style?: SpeakingDirection;
  effect?: 'normal' | 'cartoon' | 'robot';
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
  expressionCues?: ExpressionCue[];
  dialogueLines?: SceneDialogue[];
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
  expression?: FacialExpression;
  mouthState?: MouthShape;
  speaking?: boolean;
}

/**
 * Deterministically evaluates character poses at any timestamp.
 */
export function evaluatePose(
  instance: CharacterInstance,
  clips: AnimationClip[],
  sceneRelativeMs: number,
  expressionCues: ExpressionCue[] = [],
  dialogueLines: SceneDialogue[] = []
): EvaluatedPose {
  const instanceClips = clips.filter((c) => c.instanceId === instance.instanceId);

  // Keep the character at the end of its most recently completed non-looping motion path.
  // This also provides the starting transform for later clips (for example, wave after walk).
  const completedMotionPathClip = instanceClips
    .filter(
      (c) =>
        c.action === 'walk' &&
        c.motionMode === 'motion_path' &&
        !!c.motionPath &&
        !c.loop &&
        sceneRelativeMs > c.startMs + c.durationMs
    )
    .sort((a, b) => (b.startMs + b.durationMs) - (a.startMs + a.durationMs))[0];

  let activeClip: AnimationClip | null = null;
  for (const clip of instanceClips) {
    const endMs = clip.startMs + clip.durationMs;
    if (sceneRelativeMs >= clip.startMs && sceneRelativeMs <= endMs) {
      activeClip = clip;
      break;
    }
  }

  let currentX = completedMotionPathClip?.motionPath?.endX ?? instance.x;
  let currentY = completedMotionPathClip?.motionPath?.endY ?? instance.y;
  let currentScale = instance.scale || 1.0;
  let currentRotation = instance.rotation || 0;
  let currentFlipX = completedMotionPathClip?.motionPath
    ? completedMotionPathClip.motionPath.endX < completedMotionPathClip.motionPath.startX
      ? true
      : completedMotionPathClip.motionPath.endX > completedMotionPathClip.motionPath.startX
        ? false
        : instance.flipX || false
    : instance.flipX || false;

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
        // Apply jumping relative to the current timeline position, including a completed walk path.
        currentY += verticalDisplacement;

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
    expression: (() => {
      // 1. Check timeline active expression cue
      const activeExpCue = (expressionCues || []).find((c) => {
        const matchesChar =
          c.instanceId === instance.instanceId ||
          c.characterInstanceId === instance.instanceId ||
          (c.characterId && c.characterId === instance.characterId);
        if (!matchesChar) return false;
        const start = c.startMs ?? 0;
        const dur = c.durationMs ?? 999999;
        return sceneRelativeMs >= start && sceneRelativeMs <= start + dur;
      });
      if (activeExpCue) return activeExpCue.expression;

      // 2. Check direct character instance expression
      if (instance.expression) return instance.expression;

      // 3. Fallback to any expression cue set on this character in the scene
      const charCue = (expressionCues || []).find(
        (c) =>
          c.instanceId === instance.instanceId ||
          c.characterInstanceId === instance.instanceId ||
          (c.characterId && c.characterId === instance.characterId)
      );
      if (charCue) return charCue.expression;

      // 4. Check active dialogue speaking direction
      const activeDialogue = dialogueLines.find((d) => {
        const isSpeaker =
          (d.characterInstanceId && d.characterInstanceId === instance.instanceId) ||
          (d.characterId && d.characterId === instance.characterId) ||
          (d.characterName && instance.name && d.characterName.trim().toLowerCase() === instance.name.trim().toLowerCase());
        return isSpeaker && sceneRelativeMs >= d.startMs && sceneRelativeMs <= d.startMs + d.durationMs;
      });

      if (activeDialogue?.speakingDirection) {
        const dirMap: Record<string, FacialExpression> = {
          cheerful: 'happy',
          excited: 'surprised',
          calm: 'neutral',
          sad: 'sad',
          worried: 'scared',
          curious: 'curious',
          serious: 'angry',
        };
        if (dirMap[activeDialogue.speakingDirection]) {
          return dirMap[activeDialogue.speakingDirection];
        }
      }

      return 'neutral';
    })(),
    mouthState: (() => {
      const activeDialogue = dialogueLines.find((d) => {
        const isSpeaker =
          (d.characterInstanceId && d.characterInstanceId === instance.instanceId) ||
          (d.characterId && d.characterId === instance.characterId) ||
          (d.characterName && instance.name && d.characterName.trim().toLowerCase() === instance.name.trim().toLowerCase());
        return isSpeaker && sceneRelativeMs >= d.startMs && sceneRelativeMs <= d.startMs + d.durationMs;
      });
      if (!activeDialogue) return 'rest';

      const dialogueOffsetMs = sceneRelativeMs - activeDialogue.startMs;
      if (activeDialogue.visemeCues && activeDialogue.visemeCues.length > 0) {
        const activeViseme = activeDialogue.visemeCues.find(
          (v) =>
            dialogueOffsetMs >= v.timeMs &&
            dialogueOffsetMs <= v.timeMs + v.durationMs
        );
        return activeViseme ? activeViseme.shape : 'open';
      }

      // Default rhythmic syllable cadence
      const cycleMs = 140;
      const step = Math.floor((dialogueOffsetMs % (cycleMs * 4)) / cycleMs);
      const cadenceShapes: MouthShape[] = ['open', 'wide', 'round', 'closed'];
      return cadenceShapes[step] || 'open';
    })(),
    speaking: Boolean(
      dialogueLines.find((d) => {
        const isSpeaker =
          (d.characterInstanceId && d.characterInstanceId === instance.instanceId) ||
          (d.characterId && d.characterId === instance.characterId) ||
          (d.characterName && instance.name && d.characterName.trim().toLowerCase() === instance.name.trim().toLowerCase());
        return isSpeaker && sceneRelativeMs >= d.startMs && sceneRelativeMs <= d.startMs + d.durationMs;
      })
    ),
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
   * Direct helper to render an SVG frame string at a given millisecond timestamp.
   */
  renderFrameToSVG(animationData: VectorSceneData, timestampMs = 0, width = 1280, height = 720): string {
    return this.generateSvgFrame({
      animationData,
      timestampSec: timestampMs / 1000,
      width,
      height,
    });
  }

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
    if (animationData?.background?.imageUrl) {
      let imageHref = animationData.background.imageUrl;
      if (resolveLocalPath) {
        try {
          const localImagePath = resolveLocalPath(animationData.background.imageUrl);
          if (fs.existsSync(localImagePath)) {
            let base64 = this.base64ImageCache.get(localImagePath);
            if (!base64) {
              const buffer = fs.readFileSync(localImagePath);
              const ext = path.extname(localImagePath).toLowerCase();
              const mime = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'image/png';
              base64 = `data:${mime};base64,${buffer.toString('base64')}`;
              this.base64ImageCache.set(localImagePath, base64);
            }
            imageHref = base64;
          }
        } catch (imgError) {
          console.warn(`[VectorAnimationEngine] Failed to load background image:`, imgError);
        }
      }

      const fitMode = animationData.background?.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
      const backdropXml = `<rect id="scene-background-backdrop" width="${width}" height="${height}" fill="#090d16"/>`;
      backgroundXml = `<g id="scene-background-group">${backdropXml}<image id="scene-background-image" href="${imageHref}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="${fitMode}"/></g>`;
    }

    if (!backgroundXml) {
      backgroundXml = `
        <g id="default-stylized-background">
          <rect id="scene-background-rect" width="${width}" height="${height}" fill="#101726"/>
          <line x1="0" y1="540" x2="${width}" y2="540" stroke="#1e293b" stroke-width="2"/>
          <rect x="0" y="540" width="${width}" height="180" fill="#0d131f" opacity="0.6"/>
        </g>
      `;
    }

    const instances = animationData.characterInstances || [];
    const clips = animationData.animationClips || [];
    const sortedInstances = [...instances].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    const charactersXml = sortedInstances
      .map((instance) => {
        const hasHeadTags = instance.customRig?.parts?.head?.shapes?.some(
          (s) => s.tag === 'eyes' || s.tag === 'mouth'
        );
        const rig =
          (instance.customRig && hasHeadTags)
            ? instance.customRig
            : (instance.appearance
                ? buildRigFromAppearance(instance.characterId, instance.name || 'Character', instance.appearance)
                : (instance.customRig || getVectorRig(instance.characterId)));
        const pose = evaluatePose(
          instance,
          clips,
          sceneRelativeMs,
          animationData.expressionCues,
          animationData.dialogueLines
        );
        const parts = rig.parts;

        const rootTransform = `translate(${pose.x}, ${pose.y}) scale(${pose.scale * (pose.flipX ? -1 : 1)}, ${pose.scale}) rotate(${pose.rotation})`;
        const leftLegTransform = `rotate(${pose.leftLegAngle}, ${parts.leftLeg.pivot.x}, ${parts.leftLeg.pivot.y})`;
        const rightLegTransform = `rotate(${pose.rightLegAngle}, ${parts.rightLeg.pivot.x}, ${parts.rightLeg.pivot.y})`;
        const torsoTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.torsoAngle}, ${parts.torso.pivot.x}, ${parts.torso.pivot.y}) scale(1, ${pose.chestScaleY})`;
        const leftArmTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.leftArmAngle}, ${parts.leftArm.pivot.x}, ${parts.leftArm.pivot.y})`;
        const leftArmXml = `
          <g transform="${leftArmTransform}">
            ${renderPartXml(parts.leftArm, 'translate(0, 0)')}
            ${parts.leftForearm
              ? renderPartXml(
                  parts.leftForearm,
                  `rotate(${pose.leftForearmAngle}, ${parts.leftForearm.pivot.x}, ${parts.leftForearm.pivot.y})`
                )
              : ''}
          </g>
        `;
        const rightArmTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.rightArmAngle}, ${parts.rightArm.pivot.x}, ${parts.rightArm.pivot.y})`;
        const rightArmXml = `
          <g transform="${rightArmTransform}">
            ${renderPartXml(parts.rightArm, 'translate(0, 0)')}
            ${parts.rightForearm
              ? renderPartXml(
                  parts.rightForearm,
                  `rotate(${pose.rightForearmAngle}, ${parts.rightForearm.pivot.x}, ${parts.rightForearm.pivot.y})`
                )
              : ''}
          </g>
        `;
        const headTransform = `translate(0, ${pose.torsoBobY}) rotate(${pose.headAngle}, ${parts.head.pivot.x}, ${parts.head.pivot.y})`;
        const dynamicHeadPart: VectorRigPart = {
          ...parts.head,
          shapes: getHeadShapesForPose(rig, pose),
        };

        const shadowY = pose.y + (rig.baseHeight / 2) * pose.scale - 8;
        const shadowRx = 40 * pose.scale;
        const shadowRy = 12 * pose.scale;
        const shadowXml = `<ellipse cx="${pose.x}" cy="${shadowY}" rx="${shadowRx}" ry="${shadowRy}" fill="rgba(0,0,0,0.3)"/>`;

        const characterXml = `
          <g id="char-${instance.instanceId}" data-character="${instance.characterId}" transform="${rootTransform}">
            ${renderPartXml(parts.leftLeg, leftLegTransform)}
            ${renderPartXml(parts.rightLeg, rightLegTransform)}
            ${leftArmXml}
            ${renderPartXml(parts.torso, torsoTransform)}
            ${rightArmXml}
            ${renderPartXml(dynamicHeadPart, headTransform)}
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
