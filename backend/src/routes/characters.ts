import { Router } from "express";
import {
  getAllCharacters,
  getCharacterById,
  createCharacter,
  getCharacterByName,
  deleteCharacter,
  updateCharacter,
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
    const { name, species, personality, visualDescription, distinctiveFeatures } = req.body;

    if (!name || !species || !personality || !visualDescription) {
      return res.status(400).json({
        message: "name, species, personality, and visualDescription are required",
      });
    }

    // Check if character already exists
    const existing = await getCharacterByName(name);
    if (existing) {
      return res.status(409).json({ message: "Character with this name already exists" });
    }

    const character = await createCharacter({
      id: randomUUID(),
      name,
      species,
      personality,
      visualDescription,
      distinctiveFeatures: distinctiveFeatures || "",
    });

    return res.status(201).json(character);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to create character" });
  }
});

// PUT update character
characterRouter.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, species, personality, visualDescription, distinctiveFeatures } = req.body;

    const existing = await getCharacterById(id);
    if (!existing) {
      return res.status(404).json({ message: "Character not found" });
    }

    // If name is being changed, check if new name already exists
    if (name && name !== existing.name) {
      const nameConflict = await getCharacterByName(name);
      if (nameConflict) {
        return res.status(409).json({ message: "Character with this name already exists" });
      }
    }

    const character = await updateCharacter(id, {
      name: name || existing.name,
      species: species || existing.species,
      personality: personality || existing.personality,
      visualDescription: visualDescription || existing.visualDescription,
      distinctiveFeatures: distinctiveFeatures || existing.distinctiveFeatures,
    });

    return res.json(character);
  } catch (error) {
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
