import { StructuredScene } from './story-generation.types.js';
import { ResolvedCharacterInfo } from './character-resolution.service.js';
import {
  VectorSceneData,
  CharacterInstance,
  AnimationClip,
  MotionPath,
} from '../animation/vector-animation.engine.js';
import {
  buildRigFromAppearance,
  CHARACTER_PRESETS,
  DEFAULT_APPEARANCE,
} from '../animation/templates/custom-character-rig.js';
import { estimateSpeechDurationMs } from '../timing/timing.service.js';

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

      // 1. Duration Calculation & Pacing
      // Estimate narration speech duration
      const speechDurationMs = estimateSpeechDurationMs(sc.narration);
      // Minimum duration accounts for narration plus brief dialogue pauses
      const minDurationMs = Math.max(4000, speechDurationMs + 1500);
      const requestedDurationMs = (sc.durationSeconds || 15) * 1000;
      const finalDurationMs = Math.max(minDurationMs, requestedDurationMs);

      const startMs = runningTimeMs;
      const endMs = startMs + finalDurationMs;
      runningTimeMs = endMs;

      // 2. Identify characters present in this scene
      const sceneCharNames = new Set<string>();
      for (const d of sc.dialogue) {
        if (d.characterName) sceneCharNames.add(d.characterName.trim().toLowerCase());
      }
      for (const a of sc.characterActions) {
        if (a.characterName) sceneCharNames.add(a.characterName.trim().toLowerCase());
      }

      // If no characters explicitly mentioned, include the protagonist
      if (sceneCharNames.size === 0 && allResolvedCharacters.length > 0) {
        sceneCharNames.add(allResolvedCharacters[0].name.toLowerCase());
      }

      const sceneCharacters: ResolvedCharacterInfo[] = [];
      for (const name of sceneCharNames) {
        const found = characterMapByName.get(name);
        if (found) {
          sceneCharacters.push(found);
        }
      }

      const characterIdsArray = sceneCharacters.map((c) => c.id);

      // 3. Position characters on stage and construct CharacterInstances
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
          if (sp.includes('bear')) {
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

      // 4. Map semantic actions to valid animation clips
      const animationClips: AnimationClip[] = [];

      characterInstances.forEach((inst) => {
        const charName = (inst.name || '').toLowerCase();
        const charAction = sc.characterActions.find(
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

      // 5. Construct full VectorSceneData
      const animationData: VectorSceneData = {
        version: 1,
        viewport: { width: 1280, height: 720 },
        background: undefined,
        characterInstances,
        animationClips,
      };

      // Attach structured dialogue and actions to animationData for editor & inspector
      (animationData as any).dialogue = sc.dialogue.map((d) => ({
        speaker: d.characterName,
        line: d.text,
        emotion: d.emotion,
      }));
      (animationData as any).characterActions = sc.characterActions.map((a) => ({
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
