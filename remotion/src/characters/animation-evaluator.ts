import {
  CharacterInstance,
  AnimationClip,
  AnimationAction,
  ExpressionCue,
  DialogueLine,
  FacialExpression,
  MouthShape,
} from '../manifest';

export interface EvaluatedCharacterPose {
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
  activeAction: AnimationAction;
  expression: FacialExpression;
  mouthState: MouthShape;
  speaking: boolean;
  isSpeaker?: boolean;
}

/**
 * Deterministically evaluates motion path easing curves.
 * Supports linear, ease-in, ease-out, ease-in-out, smooth-step, and safe linear fallback.
 */
export function evaluateEasing(rawEasing: string | undefined, u: number): number {
  if (!rawEasing) return u;
  const clean = rawEasing.toLowerCase().trim().replace(/[-_]+/g, '');
  if (clean === 'easein') {
    return u * u;
  }
  if (clean === 'easeout') {
    return 1 - (1 - u) * (1 - u);
  }
  if (clean === 'easeinout') {
    return u < 0.5
      ? 2 * u * u
      : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }
  if (clean === 'smoothstep') {
    return u * u * (3 - 2 * u);
  }
  return u;
}

/**
 * Deterministically evaluates character transform, bone articulation angles,
 * active expression, and viseme mouth shape at an exact scene-relative timestamp (in milliseconds).
 */
export function evaluateCharacterPose(
  instance: CharacterInstance,
  clips: AnimationClip[] = [],
  sceneRelativeMs: number = 0,
  expressionCues: ExpressionCue[] = [],
  dialogueLines: DialogueLine[] = []
): EvaluatedCharacterPose {
  const instanceClips = clips.filter((c) => c.instanceId === instance.instanceId);

  // Keep the character at the end of its most recently completed non-looping motion path
  const completedMotionPathClip = instanceClips
    .filter(
      (c) =>
        c.action === 'walk' &&
        c.motionMode === 'motion_path' &&
        !!c.motionPath &&
        !c.loop &&
        sceneRelativeMs > c.startMs + c.durationMs
    )
    .sort((a, b) => b.startMs + b.durationMs - (a.startMs + a.durationMs))[0];

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
  let activeAction: AnimationAction = 'idle';

  const isPlanet =
    instance.appearance?.species?.toLowerCase() === 'planet' ||
    instance.appearance?.species?.toLowerCase() === 'earth' ||
    instance.customRig?.species?.toLowerCase() === 'planet' ||
    instance.customRig?.species?.toLowerCase() === 'earth' ||
    instance.characterId?.includes('earth') ||
    Boolean(instance.name?.toLowerCase().includes('earth'));

  const fallbackAction = ((instance as any).action && ['walk', 'wave', 'jump', 'point', 'idle'].includes((instance as any).action))
    ? ((instance as any).action as AnimationAction)
    : 'idle';

  // Animation Precedence Model:
  // 1. Explicit user-authored active non-idle timeline animation clip.
  // 2. Shot-level character action (instance.action) when clip is absent or ambient idle.
  // 3. Default ambient idle breathing.
  const isDefaultIdleClip = activeClip && (activeClip.action === 'idle' || activeClip.clipId.startsWith('default-') || activeClip.clipId.startsWith('auto-'));
  if (isDefaultIdleClip && fallbackAction !== 'idle') {
    activeAction = fallbackAction;
  } else if (activeClip) {
    activeAction = activeClip.action;
  } else {
    activeAction = fallbackAction;
  }

  if (!activeClip && activeAction === 'idle') {
    activeAction = 'idle';
    const tSec = sceneRelativeMs / 1000;
    if (isPlanet) {
      torsoBobY = 8 * Math.sin(2 * Math.PI * 0.5 * tSec);
      headAngle = 2.5 * Math.sin(2 * Math.PI * 0.3 * tSec);
      leftArmAngle = 4 + 2 * Math.sin(2 * Math.PI * 0.5 * tSec);
      rightArmAngle = -4 - 2 * Math.sin(2 * Math.PI * 0.5 * tSec);
    } else {
      chestScaleY = 1.0 + 0.02 * Math.sin(2 * Math.PI * 0.6 * tSec);
      headAngle = 1.5 * Math.sin(2 * Math.PI * 0.4 * tSec);
      leftArmAngle = 6 + 2 * Math.sin(2 * Math.PI * 0.6 * tSec);
      rightArmAngle = -6 - 2 * Math.sin(2 * Math.PI * 0.6 * tSec);
    }
  } else {
    activeAction = activeClip ? activeClip.action : fallbackAction;
    const clipOffsetMs = activeClip ? sceneRelativeMs - activeClip.startMs : sceneRelativeMs;
    const durationMs = activeClip ? Math.max(100, activeClip.durationMs) : 1200;
    const speed = activeClip?.speedMultiplier || 1.0;

    const uRaw = clipOffsetMs / durationMs;
    const isLooping = activeClip ? activeClip.loop : true;
    const u = isLooping ? uRaw % 1.0 : Math.min(1.0, Math.max(0.0, uRaw));

    switch (activeAction) {
      case 'walk': {
        const strideFreq = 1.6 * speed;
        const phase = 2 * Math.PI * strideFreq * (clipOffsetMs / 1000);

        if (isPlanet) {
          torsoBobY = -10 * Math.sin(phase);
          torsoAngle = 3 * Math.sin(phase * 0.7);
          headAngle = 2.5 * Math.sin(phase);
          leftArmAngle = 5 + 3 * Math.sin(phase);
          rightArmAngle = -5 - 3 * Math.sin(phase);
        } else {
          leftLegAngle = 28 * Math.sin(phase);
          rightLegAngle = -28 * Math.sin(phase);
          leftArmAngle = -20 * Math.sin(phase);
          rightArmAngle = 20 * Math.sin(phase);
          torsoBobY = -7 * Math.abs(Math.sin(phase));
          torsoAngle = 2.5 * Math.sin(phase);
          headAngle = -2 * Math.sin(phase);
        }

        if (activeClip?.motionMode === 'motion_path' && activeClip.motionPath) {
          const path = activeClip.motionPath;
          const progress = evaluateEasing(path.easing, u);

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

        if (isPlanet) {
          rightArmAngle = -35 + 20 * Math.sin(phase);
          rightForearmAngle = 0;
          leftArmAngle = 6 + 2 * Math.sin(phase * 0.3);
          torsoBobY = 4 * Math.sin(phase * 0.5);
          headAngle = -3;
        } else {
          rightArmAngle = -135;
          rightForearmAngle = -20 + 26 * Math.sin(phase);
          leftArmAngle = 8 + 2 * Math.sin(phase * 0.3);
          torsoAngle = -2;
          headAngle = -4;
        }
        break;
      }

      case 'jump': {
        const jumpHeight = 110;
        const verticalDisplacement = -4 * jumpHeight * u * (1 - u);
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

      case 'point': {
        const pointFreq = 1.0 * speed;
        const phase = 2 * Math.PI * pointFreq * (clipOffsetMs / 1000);
        if (isPlanet) {
          rightArmAngle = -45 + 5 * Math.sin(phase);
          rightForearmAngle = -10;
          leftArmAngle = 8 + 2 * Math.sin(phase * 0.3);
          torsoBobY = 5 * Math.sin(phase * 0.5);
          headAngle = 4;
        } else {
          rightArmAngle = -75;
          rightForearmAngle = -15 + 4 * Math.sin(phase);
          leftArmAngle = 10 + 2 * Math.sin(phase * 0.3);
          torsoAngle = -3;
          headAngle = 5;
        }
        break;
      }

      case 'idle':
      default: {
        const idleFreq = 0.6 * speed;
        const phase = 2 * Math.PI * idleFreq * (clipOffsetMs / 1000);
        if (isPlanet) {
          torsoBobY = 8 * Math.sin(phase);
          headAngle = 2.5 * Math.sin(phase * 0.7);
          leftArmAngle = 6 + 4 * Math.sin(phase);
          rightArmAngle = -6 - 4 * Math.sin(phase);
          chestScaleY = 1.0 + 0.015 * Math.sin(phase * 0.5);
        } else {
          chestScaleY = 1.0 + 0.025 * Math.sin(phase);
          headAngle = 2 * Math.sin(phase * 0.7);
          leftArmAngle = 6 + 2 * Math.sin(phase);
          rightArmAngle = -6 - 2 * Math.sin(phase);
        }
        break;
      }
    }
  }

  // Expression Resolution
  const expression = (() => {
    // 1. Check if active dialogue line has an explicit facialExpression override
    const activeDialogue = dialogueLines.find((d) => {
      const isSpeaker =
        (d.characterInstanceId && d.characterInstanceId === instance.instanceId) ||
        (d.characterId && d.characterId === instance.characterId) ||
        (d.characterName && instance.name && d.characterName.trim().toLowerCase() === instance.name.trim().toLowerCase());
      return isSpeaker && sceneRelativeMs >= d.startMs && sceneRelativeMs <= d.startMs + d.durationMs;
    });
    if (activeDialogue?.facialExpression) {
      return activeDialogue.facialExpression;
    }

    // 2. Check timeline active expression cue
    const activeExpCue = expressionCues.find((c) => {
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

    // 3. Check direct character instance expression
    if (instance.expression) return instance.expression;

    // 4. Fallback to active dialogue speaking direction / emotion mapping
    const emotionOrDir = activeDialogue?.emotion || activeDialogue?.speakingDirection;
    if (emotionOrDir) {
      const dirMap: Record<string, FacialExpression> = {
        neutral: 'neutral',
        happy: 'happy',
        cheerful: 'happy',
        excited: 'surprised',
        calm: 'neutral',
        sad: 'sad',
        sleepy: 'neutral',
        confused: 'confused',
        worried: 'scared',
        curious: 'curious',
        serious: 'angry',
        angry: 'angry',
        surprised: 'surprised',
        whispering: 'curious',
        shouting: 'angry',
      };
      if (dirMap[emotionOrDir]) {
        return dirMap[emotionOrDir];
      }
    }

    // 5. Fallback to any cue on this character
    const charCue = expressionCues.find(
      (c) =>
        c.instanceId === instance.instanceId ||
        c.characterInstanceId === instance.instanceId ||
        (c.characterId && c.characterId === instance.characterId)
    );
    if (charCue) return charCue.expression;

    return 'neutral';
  })();

  // Mouth State (Lip-Sync Visemes or Syllable Cadence)
  const mouthState = (() => {
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

    // Syllable cadence fallback
    const cycleMs = 140;
    const step = Math.floor((dialogueOffsetMs % (cycleMs * 4)) / cycleMs);
    const cadenceShapes: MouthShape[] = ['open', 'wide', 'round', 'closed'];
    return cadenceShapes[step] || 'open';
  })();

  const speaking = Boolean(
    dialogueLines.find((d) => {
      const isSpeaker =
        (d.characterInstanceId && d.characterInstanceId === instance.instanceId) ||
        (d.characterId && d.characterId === instance.characterId) ||
        (d.characterName && instance.name && d.characterName.trim().toLowerCase() === instance.name.trim().toLowerCase());
      return isSpeaker && sceneRelativeMs >= d.startMs && sceneRelativeMs <= d.startMs + d.durationMs;
    })
  );

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
    expression,
    mouthState,
    speaking,
    isSpeaker: Boolean((instance as any).isSpeaker || speaking),
  };
}

