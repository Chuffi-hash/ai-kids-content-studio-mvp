import { Router } from "express";
import {
  getAllCharacters,
  getCharacterById,
  createCharacter,
  getCharacterByName,
  deleteCharacter,
  updateCharacter,
  CharacterConflictError,
} from "../services/database/database.service.js";
import { ImageGenerationService } from "../services/image-generation/image-generation.service.js";
import { getImageGenerationProvider } from "../services/image-generation/provider.factory.js";
import { LocalStorageService } from "../services/storage/local-storage.service.js";
import { randomUUID } from "crypto";

export const characterRouter = Router();

// Initialize image generation services
const imageGenerationProvider = getImageGenerationProvider();
const imageGenerationService = new ImageGenerationService(
  imageGenerationProvider,
);
const storageService = new LocalStorageService();
const providerType = process.env.IMAGE_PROVIDER || "mock";

// GET all characters
characterRouter.get("/", async (_req, res) => {
  try {
    const characters = await getAllCharacters();
    return res.json(characters);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch characters" });
  }
});

// GET single character by ID
characterRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const character = await getCharacterById(id);

    if (!character) {
      return res.status(404).json({ message: "Character not found" });
    }

    return res.json(character);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch character" });
  }
});

// POST create new character
characterRouter.post("/", async (req, res) => {
  try {
    const { name, species, personality, visualDescription, distinctiveFeatures, canonicalAppearance } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Character name is required",
      });
    }

    const trimmedName = name.trim();
    const resolvedSpecies = species || (canonicalAppearance?.species ? canonicalAppearance.species.charAt(0).toUpperCase() + canonicalAppearance.species.slice(1) : "Human");
    const resolvedPersonality = personality || "Friendly, curious, and adventurous";
    const resolvedDescription = visualDescription || `Custom 2D vector character (${resolvedSpecies})`;

    // Check if character already exists
    const existing = await getCharacterByName(trimmedName);
    if (existing) {
      return res.status(409).json({ message: "Character with this name already exists" });
    }

    const character = await createCharacter({
      id: randomUUID(),
      name: trimmedName,
      species: resolvedSpecies,
      personality: resolvedPersonality,
      visualDescription: resolvedDescription,
      distinctiveFeatures: distinctiveFeatures || "",
      canonicalAppearance: canonicalAppearance || null,
    });

    return res.status(201).json(character);
  } catch (error: any) {
    if (error instanceof CharacterConflictError || error?.statusCode === 409) {
      return res.status(409).json({ message: error.message || "Character with this name already exists" });
    }
    console.error(error);
    return res.status(500).json({ message: "Failed to create character" });
  }
});

// POST duplicate character
characterRouter.post("/:id/duplicate", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getCharacterById(id);
    if (!existing) {
      return res.status(404).json({ message: "Character not found" });
    }

    // Generate unique name
    let copyName = `${existing.name} (Copy)`;
    let counter = 2;
    while (await getCharacterByName(copyName)) {
      copyName = `${existing.name} (Copy ${counter})`;
      counter++;
    }

    const duplicated = await createCharacter({
      id: randomUUID(),
      name: copyName,
      species: existing.species,
      personality: existing.personality,
      visualDescription: existing.visualDescription,
      distinctiveFeatures: existing.distinctiveFeatures,
      canonicalAppearance: existing.canonicalAppearance,
      referenceImageUrl: existing.referenceImageUrl || undefined,
      referenceImagePrompt: existing.referenceImagePrompt || undefined,
    });

    return res.status(201).json(duplicated);
  } catch (error) {
    console.error("[Characters] Failed to duplicate character:", error);
    return res.status(500).json({ message: "Failed to duplicate character" });
  }
});

// PUT update character
characterRouter.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, species, personality, visualDescription, distinctiveFeatures, canonicalAppearance } = req.body;

    const existing = await getCharacterById(id);
    if (!existing) {
      return res.status(404).json({ message: "Character not found" });
    }

    // If name is being changed, check if new name already exists
    if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const nameConflict = await getCharacterByName(name.trim());
      if (nameConflict && nameConflict.id !== id) {
        return res.status(409).json({ message: "Character with this name already exists" });
      }
    }

    const character = await updateCharacter(id, {
      name: name ? name.trim() : existing.name,
      species: species || existing.species,
      personality: personality || existing.personality,
      visualDescription: visualDescription || existing.visualDescription,
      distinctiveFeatures: distinctiveFeatures !== undefined ? distinctiveFeatures : existing.distinctiveFeatures,
      canonicalAppearance: canonicalAppearance !== undefined ? canonicalAppearance : existing.canonicalAppearance,
    });

    return res.json(character);
  } catch (error: any) {
    if (error instanceof CharacterConflictError || error?.statusCode === 409) {
      return res.status(409).json({ message: error.message || "Character with this name already exists" });
    }
    console.error(error);
    return res.status(500).json({ message: "Failed to update character" });
  }
});

// DELETE character
characterRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await getCharacterById(id);
    if (!existing) {
      return res.status(404).json({ message: "Character not found" });
    }

    await deleteCharacter(id);
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete character" });
  }
});

// POST generate character reference image
characterRouter.post("/:id/reference-image", async (req, res) => {
  try {
    const { id } = req.params;

    const character = await getCharacterById(id);
    if (!character) {
      return res.status(404).json({ message: "Character not found" });
    }

    // Build prompt from character appearance
    const prompt = `Polished 3D animated children's storybook character reference image. ${character.name} is a ${character.species}. ${character.visualDescription}. ${character.distinctiveFeatures}. Bright cheerful lighting, clean background, full body shot, high detail, no text, no watermark.`;

    console.log(`[Character] Generating reference image for character ${id}`);

    // Generate image (1:1 aspect ratio - 512x512 for reference)
    const result = await imageGenerationService.generateSceneImage({
      prompt,
      width: 512,
      height: 512,
    });

    console.log(`[Character] Reference image generated for character ${id}`);

    // Update character with reference image
    await updateCharacter(id, {
      referenceImageUrl: (result as any).url,
      referenceImagePrompt: prompt,
    });

    return res.json({
      success: true,
      referenceImageUrl: (result as any).url,
      referenceImagePrompt: prompt,
    });
  } catch (error) {
    console.error(`[Character] Reference image generation failed for character ${req.params.id}`);
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate reference image",
    });
  }
});
