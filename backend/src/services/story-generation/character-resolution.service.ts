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
   * Finds the best matching character using direct name, substring, or semantic archetype aliases.
   */
  public static findMatchingCharacter(
    rawName: string,
    characterSource: Map<string, ResolvedCharacterInfo> | ResolvedCharacterInfo[]
  ): ResolvedCharacterInfo | undefined {
    if (!rawName || !rawName.trim()) return undefined;
    const nameLower = rawName.trim().toLowerCase();

    const charEntries: Array<[string, ResolvedCharacterInfo]> =
      characterSource instanceof Map
        ? Array.from(characterSource.entries())
        : characterSource.map((c) => [c.name.toLowerCase().trim(), c]);

    // 1. Direct exact match
    for (const [key, char] of charEntries) {
      if (key === nameLower) return char;
    }

    // 2. Substring or semantic alias match
    for (const [key, char] of charEntries) {
      if (key === nameLower) return char;
      if (key.includes(nameLower) || nameLower.includes(key)) return char;
      const charNameLower = char.name.toLowerCase();
      if (charNameLower.includes(nameLower) || nameLower.includes(charNameLower)) return char;

      // Semantic archetype aliases (e.g. Terra <-> Earth, Pip <-> Bear, Sammy <-> Kid)
      const speciesLower = (char.species || '').toLowerCase();
      if (
        (nameLower.includes('earth') || nameLower.includes('terra') || nameLower.includes('planet')) &&
        (key.includes('earth') || key.includes('terra') || key.includes('planet') || speciesLower.includes('planet'))
      ) {
        return char;
      }
      if (
        (nameLower.includes('pip') || nameLower.includes('bear')) &&
        (key.includes('pip') || key.includes('bear') || speciesLower.includes('bear'))
      ) {
        return char;
      }
      if (
        (nameLower.includes('sammy') || nameLower.includes('kid') || nameLower.includes('boy')) &&
        (key.includes('sammy') || key.includes('kid') || key.includes('boy') || speciesLower.includes('boy'))
      ) {
        return char;
      }
      if (
        (nameLower.includes('maya') || nameLower.includes('girl')) &&
        (key.includes('maya') || key.includes('girl') || speciesLower.includes('girl'))
      ) {
        return char;
      }
      if (
        nameLower.includes('robot') &&
        (key.includes('robot') || speciesLower.includes('robot'))
      ) {
        return char;
      }
    }

    return undefined;
  }

  /**
   * Reconciles scene character actions and dialogue against resolved characters
   * without discarding speakers or forcefully reassigning distinct speakers.
   */
  public static reconcileSceneCharacters(
    scenes: StructuredScene[],
    characterMapByName: Map<string, ResolvedCharacterInfo>,
    defaultCharacter?: ResolvedCharacterInfo
  ): void {
    const fallbackChar = defaultCharacter || characterMapByName.values().next().value;

    for (const scene of scenes) {
      for (const d of scene.dialogue) {
        if (!d.characterName || !d.characterName.trim()) {
          if (fallbackChar) d.characterName = fallbackChar.name;
          continue;
        }
        const found = this.findMatchingCharacter(d.characterName, characterMapByName);
        if (found) {
          d.characterName = found.name;
        }
      }

      for (const a of scene.characterActions) {
        if (!a.characterName || !a.characterName.trim()) {
          if (fallbackChar) a.characterName = fallbackChar.name;
          continue;
        }
        const found = this.findMatchingCharacter(a.characterName, characterMapByName);
        if (found) {
          a.characterName = found.name;
        }
      }
    }
  }
}

