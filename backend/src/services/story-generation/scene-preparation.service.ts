import { randomUUID } from 'crypto';
import { StructuredScene } from './story-generation.types.js';
import { ResolvedCharacterInfo, CharacterResolutionService } from './character-resolution.service.js';
import {
  VectorSceneData,
  CharacterInstance,
  AnimationClip,
  MotionPath,
  SceneDialogue,
  ExpressionCue,
  FacialExpression,
  SpeakingDirection,
} from '../animation/vector-animation.engine.js';
import {
  buildRigFromAppearance,
  CHARACTER_PRESETS,
  DEFAULT_APPEARANCE,
} from '../animation/templates/custom-character-rig.js';
import { estimateSpeechDurationMs } from '../timing/timing.service.js';
import { generateVisemeCues } from '../audio-generation/viseme-generator.js';

export type SupportedActionType = 'idle' | 'walk' | 'wave' | 'jump';

export interface PreparedSceneRecord {
  sceneNumber: number;
  order: number;
  title: string;
  startMs: number;
  endMs: number;
  estimatedDurationMs: number;
  narration: string;
  visualPrompt: string;
  cameraDirection: string;
  characterIds: string; // JSON array of character IDs
  animationData: VectorSceneData;
}

export class ScenePreparationService {
  /**
   * Prepares animation-ready scenes conforming to VectorSceneData,
   * with calculated durations, contiguous timeline, and mapped character actions.
   */
  public static prepareScenes(
    rawScenes: StructuredScene[],
    characterMapByName: Map<string, ResolvedCharacterInfo>,
    allResolvedCharacters: ResolvedCharacterInfo[],
    targetDurationSeconds?: number
  ): PreparedSceneRecord[] {
    let runningTimeMs = 0;

    return rawScenes.map((sc, index) => {
      const sceneNumber = sc.sceneNumber ?? index + 1;
      const order = index + 1;

      // 1. Identify characters present in this scene
      const sceneCharNames = new Set<string>();
      for (const d of (sc.dialogue || [])) {
        if (d.characterName) sceneCharNames.add(d.characterName.trim().toLowerCase());
      }
      for (const a of (sc.characterActions || [])) {
        if (a.characterName) sceneCharNames.add(a.characterName.trim().toLowerCase());
      }

      // If no characters explicitly mentioned, include the protagonist
      if (sceneCharNames.size === 0 && allResolvedCharacters.length > 0) {
        sceneCharNames.add(allResolvedCharacters[0].name.toLowerCase());
      }

      const sceneCharacters: ResolvedCharacterInfo[] = [];
      for (const name of sceneCharNames) {
        let found = characterMapByName.get(name);
        if (!found) {
          found = CharacterResolutionService.findMatchingCharacter(name, allResolvedCharacters);
        }
        if (found && !sceneCharacters.some((c) => c.id === found!.id)) {
          sceneCharacters.push(found);
        }
      }

      const characterIdsArray = sceneCharacters.map((c) => c.id);

      // 2. Position characters on stage and construct CharacterInstances
      const characterInstances: CharacterInstance[] = [];
      const count = sceneCharacters.length;

      sceneCharacters.forEach((char, cIdx) => {
        const instanceId = `char-${char.id}-${sceneNumber}-${cIdx}`;

        // Horizontal stage layout
        let xPos = 640;
        if (count === 2) {
          xPos = cIdx === 0 ? 460 : 820;
        } else if (count >= 3) {
          const step = 640 / (count + 1);
          xPos = 320 + (cIdx + 1) * step;
        }

        // Determine appearance / rig
        let app = char.canonicalAppearance;
        if (!app) {
          const sp = (char.species || 'human').toLowerCase();
          const nm = (char.name || '').toLowerCase();
          if (
            sp.includes('planet') ||
            sp.includes('earth') ||
            nm.includes('earth') ||
            nm.includes('terra')
          ) {
            app = CHARACTER_PRESETS.earth.appearance;
          } else if (sp.includes('bear')) {
            app = CHARACTER_PRESETS.bear_cub.appearance;
          } else if (sp.includes('robot')) {
            app = CHARACTER_PRESETS.robot.appearance;
          } else {
            app = {
              ...DEFAULT_APPEARANCE,
              species: char.species || 'human',
            };
          }
        }

        const rig = buildRigFromAppearance(char.id, char.name, app);

        characterInstances.push({
          instanceId,
          characterId: char.id,
          assetType: 'vector_rig',
          name: char.name,
          x: Math.round(xPos),
          y: 470,
          scale: 1.0,
          rotation: 0,
          flipX: count === 2 && cIdx === 1, // Face each other
          zIndex: cIdx + 1,
          customRig: rig,
          appearance: app,
        });
      });

      // 3. Map structured dialogue and facial expression cues with sequential timing
      const speechDurationMs = estimateSpeechDurationMs(sc.narration);
      let currentDialogueStartMs = speechDurationMs > 0 ? speechDurationMs + 600 : 500;
      const dialogueLines: SceneDialogue[] = [];
      const expressionCues: ExpressionCue[] = [];

      for (const d of (sc.dialogue || [])) {
        if (!d.text || !d.text.trim()) continue;

        const charNameLower = (d.characterName || '').trim().toLowerCase();
        let matchedChar = sceneCharacters.find((c) => c.name.toLowerCase() === charNameLower);
        if (!matchedChar) {
          matchedChar =
            CharacterResolutionService.findMatchingCharacter(charNameLower, sceneCharacters) ||
            CharacterResolutionService.findMatchingCharacter(charNameLower, allResolvedCharacters);
        }
        const matchedInst = characterInstances.find(
          (ci) =>
            (ci.name || '').toLowerCase() === charNameLower ||
            (matchedChar && ci.characterId === matchedChar.id)
        );

        // Resolve voice configuration
        let charVoice = 'af_heart';
        const voiceConfig =
          (matchedInst?.appearance as any)?.voiceConfig ||
          (matchedChar?.canonicalAppearance as any)?.voiceConfig;
        if (voiceConfig?.voiceId) {
          charVoice = voiceConfig.voiceId;
        } else if (
          matchedChar?.species?.toLowerCase().includes('planet') ||
          matchedChar?.species?.toLowerCase().includes('earth') ||
          charNameLower.includes('earth') ||
          charNameLower.includes('terra')
        ) {
          charVoice = 'bm_daniel';
        } else if (matchedChar?.species?.toLowerCase().includes('bear')) {
          charVoice = 'bm_george';
        } else if (matchedChar?.species?.toLowerCase().includes('robot')) {
          charVoice = 'bm_lewis';
        } else if (matchedChar?.species?.toLowerCase().includes('boy')) {
          charVoice = 'am_adam';
        } else if (matchedChar?.species?.toLowerCase().includes('girl')) {
          charVoice = 'af_bella';
        }

        // Map emotion to speaking direction and facial expression
        const emotionLower = (d.emotion || 'cheerful').toLowerCase();
        let speakingDirection: SpeakingDirection = 'cheerful';
        let facialExpression: FacialExpression = 'happy';

        if (emotionLower.includes('sad')) {
          speakingDirection = 'sad';
          facialExpression = 'sad';
        } else if (emotionLower.includes('excit')) {
          speakingDirection = 'excited';
          facialExpression = 'happy';
        } else if (emotionLower.includes('scare') || emotionLower.includes('fear')) {
          speakingDirection = 'worried';
          facialExpression = 'scared';
        } else if (emotionLower.includes('worr')) {
          speakingDirection = 'worried';
          facialExpression = 'scared';
        } else if (emotionLower.includes('angr')) {
          speakingDirection = 'serious';
          facialExpression = 'angry';
        } else if (emotionLower.includes('curio')) {
          speakingDirection = 'curious';
          facialExpression = 'curious';
        } else if (
          emotionLower.includes('surpris') ||
          emotionLower.includes('amaz') ||
          emotionLower.includes('wonder')
        ) {
          speakingDirection = 'excited';
          facialExpression = 'surprised';
        } else if (emotionLower.includes('calm') || emotionLower.includes('gentle')) {
          speakingDirection = 'calm';
          facialExpression = 'neutral';
        }

        const lineDurationMs = Math.max(1500, estimateSpeechDurationMs(d.text));
        const visemeCues = generateVisemeCues(d.text, lineDurationMs);

        const dialogueItem: SceneDialogue = {
          id: randomUUID(),
          characterId: matchedChar?.id,
          characterInstanceId: matchedInst?.instanceId,
          characterName: d.characterName || 'Character',
          text: d.text,
          voice: charVoice,
          speakingDirection,
          speed: 1.0,
          startMs: currentDialogueStartMs,
          durationMs: lineDurationMs,
          visemeCues,
        };
        dialogueLines.push(dialogueItem);

        if (matchedInst) {
          expressionCues.push({
            id: randomUUID(),
            instanceId: matchedInst.instanceId,
            characterInstanceId: matchedInst.instanceId,
            characterId: matchedInst.characterId,
            expression: facialExpression,
            startMs: currentDialogueStartMs,
            durationMs: lineDurationMs + 400,
          });
        }

        currentDialogueStartMs += lineDurationMs + 400;
      }

      // 4. Duration Calculation & Pacing
      const minRequiredDurationMs = Math.max(
        4000,
        speechDurationMs + 1500,
        currentDialogueStartMs + 600
      );
      const requestedDurationMs = (sc.durationSeconds || 15) * 1000;
      const finalDurationMs = Math.max(minRequiredDurationMs, requestedDurationMs);

      const startMs = runningTimeMs;
      const endMs = startMs + finalDurationMs;
      runningTimeMs = endMs;

      // 5. Map semantic actions to valid animation clips
      const animationClips: AnimationClip[] = [];

      characterInstances.forEach((inst) => {
        const charName = (inst.name || '').toLowerCase();
        const charAction = (sc.characterActions || []).find(
          (a) => a.characterName.trim().toLowerCase() === charName
        );

        let actionType: SupportedActionType = 'idle';
        let motionMode: 'in_place' | 'motion_path' = 'in_place';
        let motionPath: MotionPath | undefined = undefined;

        if (charAction) {
          const rawAct = charAction.action.toLowerCase();
          if (rawAct === 'walk') {
            actionType = 'walk';
            motionMode = 'motion_path';
            motionPath = {
              startX: inst.x - 120,
              startY: inst.y,
              endX: inst.x,
              endY: inst.y,
            };
          } else if (rawAct === 'wave') {
            actionType = 'wave';
          } else if (rawAct === 'jump') {
            actionType = 'jump';
          } else {
            actionType = 'idle';
          }
        }

        const clip: AnimationClip = {
          clipId: `clip-${inst.instanceId}`,
          instanceId: inst.instanceId,
          action: actionType,
          startMs: 0,
          durationMs: finalDurationMs,
          loop: true,
          motionMode,
          motionPath,
        };

        animationClips.push(clip);
      });

      // 6. Construct full VectorSceneData
      const animationData: VectorSceneData = {
        version: 1,
        viewport: { width: 1280, height: 720 },
        background: undefined,
        characterInstances,
        animationClips,
        expressionCues,
        dialogueLines,
      };

      // Attach structured dialogue and actions to animationData for editor & inspector backward compatibility
      (animationData as any).dialogue = (sc.dialogue || []).map((d) => ({
        speaker: d.characterName,
        line: d.text,
        emotion: d.emotion,
      }));
      (animationData as any).characterActions = (sc.characterActions || []).map((a) => ({
        characterName: a.characterName,
        action: a.action,
        pose: a.pose,
        description: a.description,
      }));

      const cameraDirection =
        sc.location && sc.timeOfDay
          ? `Eye level shot at ${sc.location}, ${sc.timeOfDay}`
          : 'Eye level wide establishing shot';

      return {
        sceneNumber,
        order,
        title: sc.title,
        startMs,
        endMs,
        estimatedDurationMs: finalDurationMs,
        narration: sc.narration,
        visualPrompt: sc.visualDescription,
        cameraDirection,
        characterIds: JSON.stringify(characterIdsArray),
        animationData,
      };
    });
  }
}

