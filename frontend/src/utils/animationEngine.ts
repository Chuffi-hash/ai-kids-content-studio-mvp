import {
  CharacterInstance,
  AnimationClip,
  EvaluatedCharacterPose,
  VectorRigDefinition,
  AnimationActionType,
  ExpressionCue,
  SceneDialogue,
  FacialExpression,
  MouthShape,
} from '../types/animation';

/**
 * Deterministically calculates a character's pose, transform coordinates, and bone angles
 * at an exact scene-relative timestamp (in milliseconds).
 */
export function evaluateCharacterPose(
  instance: CharacterInstance,
  clips: AnimationClip[],
  sceneRelativeMs: number,
  expressionCues: ExpressionCue[] = [],
  dialogueLines: SceneDialogue[] = []
): EvaluatedCharacterPose {
  // Find clips assigned to this character instance
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

  // Find active clip at current timestamp
  let activeClip: AnimationClip | null = null;
  for (const clip of instanceClips) {
    const endMs = clip.startMs + clip.durationMs;
    if (sceneRelativeMs >= clip.startMs && sceneRelativeMs <= endMs) {
      activeClip = clip;
      break;
    }
  }

  // Base transform default values
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
  let activeAction: AnimationActionType = 'idle';

  const isPlanet =
    instance.appearance?.species?.toLowerCase() === 'planet' ||
    instance.appearance?.species?.toLowerCase() === 'earth' ||
    instance.customRig?.species?.toLowerCase() === 'planet' ||
    instance.customRig?.species?.toLowerCase() === 'earth' ||
    instance.characterId?.includes('earth') ||
    Boolean(instance.name?.toLowerCase().includes('earth'));

  if (!activeClip) {
    // If no clip is currently active, compute gentle idle breathing / floating
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
    activeAction = activeClip.action;
    const clipOffsetMs = sceneRelativeMs - activeClip.startMs;
    const durationMs = Math.max(100, activeClip.durationMs);
    const speed = activeClip.speedMultiplier || 1.0;

    // Normalized progress in clip [0, 1]
    const uRaw = clipOffsetMs / durationMs;
    const u = activeClip.loop ? uRaw % 1.0 : Math.min(1.0, Math.max(0.0, uRaw));

    switch (activeClip.action) {
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

        // Motion Path walking vs In-Place walking
        if (activeClip.motionMode === 'motion_path' && activeClip.motionPath) {
          const path = activeClip.motionPath;
          let progress = u;

          // Apply easing if configured
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

          // Auto-flip orientation based on movement direction
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
          // Right arm raised with oscillating forearm/hand
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
        // Parabolic trajectory: 4 * h * u * (1 - u)
        const verticalDisplacement = -4 * jumpHeight * u * (1 - u);
        // Apply jumping relative to the current timeline position, including a completed walk path.
        currentY += verticalDisplacement;

        if (u < 0.15) {
          // Crouch before launch
          chestScaleY = 0.85;
          leftLegAngle = 14;
          rightLegAngle = -14;
          leftArmAngle = -15;
          rightArmAngle = 15;
        } else if (u > 0.85) {
          // Squash upon landing
          chestScaleY = 0.88;
          leftLegAngle = 10;
          rightLegAngle = -10;
          leftArmAngle = 10;
          rightArmAngle = -10;
        } else {
          // Mid-air stretch
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

