import { randomUUID } from 'crypto';
import {
  getCharacterById,
  getCharacterByName,
  createCharacter,
} from '../database/database.service.js';
import { StructuredCharacter, StructuredScene } from './story-generation.types.js';
import { CHARACTER_PRESETS } from '../animation/templates/custom-character-rig.js';

export interface ResolvedCharacterInfo {
  id: string;
  name: string;
  species: string;
  personality: string;
  visualDescription: string;
  distinctiveFeatures: string;
  canonicalAppearance?: any;
  referenceImageUrl?: string | null;
  isExisting: boolean;
}

export class CharacterResolutionService {
  /**
   * Resolves selected library characters and generated characters, ensuring consistency
   * without overwriting existing character designs or forcing non-humans into human rigs.
   */
  public static async resolveStoryCharacters(
    generatedCharacters: StructuredCharacter[],
    selectedCharacterIds: string[] = []
  ): Promise<{
    resolvedCharacters: ResolvedCharacterInfo[];
    characterMapByName: Map<string, ResolvedCharacterInfo>;
  }> {
    const characterMapByName = new Map<string, ResolvedCharacterInfo>();
    const resolvedCharacters: ResolvedCharacterInfo[] = [];
    const processedIds = new Set<string>();

    // 1. Process explicitly selected library characters first
    for (const charId of selectedCharacterIds) {
      if (!charId || processedIds.has(charId)) continue;
      const existing = await getCharacterById(charId);
      if (existing) {
        const info: ResolvedCharacterInfo = {
          id: existing.id,
          name: existing.name,
          species: existing.species,
          personality: existing.personality,
          visualDescription: existing.visualDescription,
          distinctiveFeatures: existing.distinctiveFeatures || '',
          canonicalAppearance: existing.canonicalAppearance,
          referenceImageUrl: existing.referenceImageUrl,
          isExisting: true,
        };
        processedIds.add(existing.id);
        resolvedCharacters.push(info);
        characterMapByName.set(existing.name.toLowerCase().trim(), info);
      }
    }

    // 2. Process generated characters from story output
    for (const genChar of generatedCharacters) {
      const trimmedName = genChar.name.trim();
      const lowerName = trimmedName.toLowerCase();

      // If already matched to a selected character, preserve it
      if (characterMapByName.has(lowerName)) {
        continue;
      }

      // Check if a character with this name already exists in the database
      const existingInDb = await getCharacterByName(trimmedName);
      if (existingInDb) {
        if (!processedIds.has(existingInDb.id)) {
          const info: ResolvedCharacterInfo = {
            id: existingInDb.id,
            name: existingInDb.name,
            species: existingInDb.species,
            personality: existingInDb.personality,
            visualDescription: existingInDb.visualDescription,
            distinctiveFeatures: existingInDb.distinctiveFeatures || '',
            canonicalAppearance: existingInDb.canonicalAppearance,
            referenceImageUrl: existingInDb.referenceImageUrl,
            isExisting: true,
          };
          processedIds.add(existingInDb.id);
          resolvedCharacters.push(info);
          characterMapByName.set(lowerName, info);
        }
        continue;
      }

      // Prepare appropriate appearance for new character based on species (preserving non-human archetype)
      const speciesLower = (genChar.species || 'human').toLowerCase();
      let initialAppearance: any = undefined;

      if (
        speciesLower.includes('planet') ||
        speciesLower.includes('earth') ||
        lowerName.includes('earth') ||
        lowerName.includes('terra')
      ) {
        initialAppearance = CHARACTER_PRESETS.earth.appearance;
      } else if (speciesLower.includes('bear')) {
        initialAppearance = CHARACTER_PRESETS.bear_cub.appearance;
      } else if (speciesLower.includes('robot')) {
        initialAppearance = CHARACTER_PRESETS.robot.appearance;
      } else if (speciesLower.includes('girl') || lowerName.includes('maya')) {
        initialAppearance = CHARACTER_PRESETS.kid_girl.appearance;
      } else if (speciesLower.includes('boy') || lowerName.includes('sammy')) {
        initialAppearance = CHARACTER_PRESETS.kid_boy.appearance;
      }

      const personalityStr = Array.isArray(genChar.personality)
        ? genChar.personality.join(', ')
        : genChar.personality || 'Kind and adventurous';

      // Create new character record
      const created = await createCharacter({
        id: randomUUID(),
        name: trimmedName,
        species: genChar.species || 'human',
        personality: personalityStr,
        visualDescription: genChar.description || `${trimmedName} the ${genChar.species}`,
        distinctiveFeatures: genChar.description ? genChar.description.split(',')[0].slice(0, 100) : '',
        canonicalAppearance: initialAppearance,
      });

      const newInfo: ResolvedCharacterInfo = {
        id: created.id,
        name: created.name,
        species: created.species,
        personality: created.personality,
        visualDescription: created.visualDescription,
        distinctiveFeatures: created.distinctiveFeatures,
        canonicalAppearance: created.canonicalAppearance,
        isExisting: false,
      };

      processedIds.add(created.id);
      resolvedCharacters.push(newInfo);
      characterMapByName.set(lowerName, newInfo);
    }

    return { resolvedCharacters, characterMapByName };
  }

  /**
   * Reconciles scene character actions and dialogue against resolved characters.
   */
  public static reconcileSceneCharacters(
    scenes: StructuredScene[],
    characterMapByName: Map<string, ResolvedCharacterInfo>,
    defaultCharacter?: ResolvedCharacterInfo
  ): void {
    const fallbackChar = defaultCharacter || characterMapByName.values().next().value;
    if (!fallbackChar) return;

    for (const scene of scenes) {
      for (const d of scene.dialogue) {
        const found = characterMapByName.get(d.characterName.trim().toLowerCase());
        if (found) {
          d.characterName = found.name;
        } else {
          d.characterName = fallbackChar.name;
        }
      }

      for (const a of scene.characterActions) {
        const found = characterMapByName.get(a.characterName.trim().toLowerCase());
        if (found) {
          a.characterName = found.name;
        } else {
          a.characterName = fallbackChar.name;
        }
      }
    }
  }
}

