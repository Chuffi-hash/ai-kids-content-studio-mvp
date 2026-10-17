import { test } from "node:test";
import assert from "node:assert";
import { randomUUID } from "crypto";
import {
  StructuredStorySchema,
  extractAndParseJson,
  validateAndNormalizeStory,
} from "../src/services/story-generation/story-schema.validator.js";
import { DeterministicStoryProvider } from "../src/services/story-generation/providers/deterministic-story.provider.js";
import { StoryGenerationService } from "../src/services/story-generation/story-generation.service.js";
import { StoryProviderFactory } from "../src/services/story-generation/providers/story-provider.factory.js";
import { CharacterResolutionService, ResolvedCharacterInfo } from "../src/services/story-generation/character-resolution.service.js";
import { ScenePreparationService } from "../src/services/story-generation/scene-preparation.service.js";
import {
  createCharacter,
  getCharacterById,
  deleteCharacter,
  getStoryByStoryId,
  getScenesByStoryId,
  deleteStory,
  getSceneById,
  updateStoryMetadata,
  prisma,
} from "../src/services/database/database.service.js";

// Ensure tests use the deterministic offline provider for fast, reliable execution
StoryProviderFactory.setMockProvider(new DeterministicStoryProvider());

test("Structured Story Generation - Schema Validation & Robust Parsing", () => {
  // 1. Markdown code block stripping
  const rawWithCodeFences = '```json\n{"title": "The Little Bear", "logline": "A bear exploring", "genre": "Adventure", "targetAudience": "4-7 years", "estimatedDurationSeconds": 30, "lesson": "Friendship", "characters": [{"name": "Pip", "species": "bear", "description": "A cute bear"}], "scenes": [{"sceneNumber": 1, "title": "Morning", "narration": "Once upon a time in a sunny forest.", "visualDescription": "Sunny forest", "dialogue": [], "characterActions": [], "durationSeconds": 15}, {"sceneNumber": 2, "title": "Adventure", "narration": "Pip found a magical glowing berry.", "visualDescription": "Forest berry", "dialogue": [], "characterActions": [], "durationSeconds": 15}]}\n```';
  const parsed = extractAndParseJson(rawWithCodeFences);
  assert.strictEqual(parsed.title, "The Little Bear");
  assert.strictEqual(parsed.scenes.length, 2);

  // 2. Trailing comma cleanup
  const rawWithTrailingCommas = '{\n  "title": "Clean Story",\n  "logline": "A nice tale",\n  "genre": "Bedtime",\n  "targetAudience": "4-7 years",\n  "estimatedDurationSeconds": 20,\n  "characters": [],\n  "scenes": [],\n}';
  const parsedCommas = extractAndParseJson(rawWithTrailingCommas);
  assert.strictEqual(parsedCommas.title, "Clean Story");

  // 3. Validation failure on invalid JSON
  assert.throws(() => {
    extractAndParseJson("This is not JSON at all!");
  }, SyntaxError);

  // 4. Schema validation rejecting missing required fields
  const invalidSchemaData = {
    title: "Incomplete Story",
    // Missing logline, genre, targetAudience, estimatedDurationSeconds, scenes
  };
  assert.throws(() => {
    StructuredStorySchema.parse(invalidSchemaData);
  });
});

test("Structured Story Generation - Deterministic Provider Output Adheres to Schema", async () => {
  const provider = new DeterministicStoryProvider();
  const input = {
    topic: "learning to share toys at preschool",
    ageGroup: "4-7 years",
    desiredDurationSeconds: 45,
    language: "en",
    genre: "Friendship",
    lesson: "Sharing makes playing more fun",
  };

  const rawJson = await provider.generateRaw("generate story", input);
  const valResult = validateAndNormalizeStory(rawJson, input);

  assert.strictEqual(valResult.success, true, `Validation failed: ${valResult.errors?.join(', ')}`);
  const validated = valResult.data!;

  assert.ok(validated.title, "Generated story must have a title");
  assert.ok(validated.logline, "Generated story must have a logline");
  assert.strictEqual(validated.targetAudience, "4-7 years");
  assert.ok(validated.characters.length >= 1, "Must contain at least 1 character");
  assert.ok(validated.scenes.length >= 2, "Must contain at least 2 scenes");

  // Verify all scenes have valid narrations, durations, and characters
  for (const scene of validated.scenes) {
    assert.ok(scene.title, "Scene must have a title");
    assert.ok(scene.narration && scene.narration.length > 5, "Scene must have narration");
    assert.ok(scene.durationSeconds > 0, "Scene duration must be positive");
    assert.ok(Array.isArray(scene.dialogue), "dialogue must be an array");
    assert.ok(Array.isArray(scene.characterActions), "characterActions must be an array");
  }
});

test("Structured Story Generation - Scene Preparation & Animation Action Mapping", () => {
  const characters: ResolvedCharacterInfo[] = [
    {
      id: "char-pip",
      name: "Pip",
      species: "bear",
      personality: "friendly",
      visualDescription: "Cute brown bear",
      distinctiveFeatures: "round ears",
      isExisting: true,
      canonicalAppearance: { head: { shape: "round" } },
    },
    {
      id: "char-sammy",
      name: "Sammy",
      species: "human",
      personality: "playful",
      visualDescription: "Energetic kid",
      distinctiveFeatures: "blue cap",
      isExisting: true,
    },
  ];

  const characterMapByName = new Map<string, ResolvedCharacterInfo>();
  characters.forEach((c) => characterMapByName.set(c.name.toLowerCase().trim(), c));

  const scenes = [
    {
      sceneNumber: 1,
      title: "Scene 1",
      summary: "First meeting",
      narration: "Pip waved cheerfully to Sammy across the meadow.",
      visualDescription: "Sunny meadow with flowers",
      location: "Meadow",
      timeOfDay: "Morning",
      durationSeconds: 5,
      dialogue: [{ characterName: "Pip", text: "Hello Sammy!", emotion: "happy" }],
      characterActions: [
        { characterName: "Pip", action: "wave", pose: "friendly", description: "Waves" },
        { characterName: "Sammy", action: "jump", pose: "excited", description: "Jumps" },
      ],
    },
    {
      sceneNumber: 2,
      title: "Scene 2",
      summary: "Sharing",
      narration: "Sammy walked toward Pip to share his toy.",
      visualDescription: "Meadow path",
      location: "Meadow",
      timeOfDay: "Morning",
      durationSeconds: 6,
      dialogue: [{ characterName: "Sammy", text: "Here, let's play together.", emotion: "happy" }],
      characterActions: [
        { characterName: "Sammy", action: "walk", pose: "confident", description: "Walks" },
        { characterName: "Pip", action: "unrecognized_spin", pose: "neutral", description: "Unknown" }, // Fallback test
      ],
    },
  ];

  const prepared = ScenePreparationService.prepareScenes(
    scenes,
    characterMapByName,
    characters,
    15
  );

  assert.strictEqual(prepared.length, 2, "Must produce 2 prepared scenes");

  // Check scene 1 contiguous timeline
  const scene1 = prepared[0];
  assert.strictEqual(scene1.startMs, 0, "First scene must start at 0ms");
  assert.ok(scene1.estimatedDurationMs > 0, "Scene duration must be positive");
  assert.strictEqual(scene1.endMs, scene1.startMs + scene1.estimatedDurationMs, "EndMs must equal startMs + durationMs");

  // Check scene 2 starts exactly at scene 1 endMs (contiguous timeline)
  const scene2 = prepared[1];
  assert.strictEqual(scene2.startMs, scene1.endMs, "Scene 2 must start contiguously at Scene 1 endMs");
  assert.strictEqual(scene2.endMs, scene2.startMs + scene2.estimatedDurationMs);

  // Check character instances and action clips in scene 1
  assert.ok(scene1.animationData, "Scene 1 must have animationData");
  assert.strictEqual(scene1.animationData.characterInstances.length, 2, "Scene 1 must contain 2 character instances");

  // Verify Pip's wave animation clip in scene 1
  const pip1Instance = scene1.animationData.characterInstances.find((ch) => ch.characterId === "char-pip");
  assert.ok(pip1Instance, "Pip instance must exist in scene 1 animationData");
  const pip1Clips = scene1.animationData.animationClips.filter((c) => c.instanceId === pip1Instance.instanceId);
  const waveClip = pip1Clips.find((c) => c.action === "wave");
  assert.ok(waveClip, "Pip must have a wave action clip in scene 1");
  assert.strictEqual(waveClip?.loop, true, "Clips must have loop: true");

  // Verify Sammy's jump clip in scene 1
  const sammy1Instance = scene1.animationData.characterInstances.find((ch) => ch.characterId === "char-sammy");
  assert.ok(sammy1Instance, "Sammy instance must exist in scene 1 animationData");
  const sammy1Clips = scene1.animationData.animationClips.filter((c) => c.instanceId === sammy1Instance.instanceId);
  const jumpClip = sammy1Clips.find((c) => c.action === "jump");
  assert.ok(jumpClip, "Sammy must have a jump action clip in scene 1");

  // Verify scene 2: Sammy has walk action with motionPath
  const sammy2Instance = scene2.animationData.characterInstances.find((ch) => ch.characterId === "char-sammy");
  assert.ok(sammy2Instance, "Sammy instance must exist in scene 2 animationData");
  const sammy2Clips = scene2.animationData.animationClips.filter((c) => c.instanceId === sammy2Instance.instanceId);
  const walkClip = sammy2Clips.find((c) => c.action === "walk");
  assert.ok(walkClip, "Sammy must have a walk action clip in scene 2");
  assert.strictEqual(walkClip?.motionMode, "motion_path");
  assert.ok(walkClip?.motionPath, "Walk clip must have motionPath defined");

  // Verify scene 2: Unrecognized action ("unrecognized_spin") falls back safely to idle
  const pip2Instance = scene2.animationData.characterInstances.find((ch) => ch.characterId === "char-pip");
  assert.ok(pip2Instance, "Pip instance must exist in scene 2 animationData");
  const pip2Clips = scene2.animationData.animationClips.filter((c) => c.instanceId === pip2Instance.instanceId);
  const fallbackClip = pip2Clips.find((c) => c.action === "idle");
  assert.ok(fallbackClip, "Unrecognized action must safely fall back to idle");
});

test("Structured Story Generation - Character Resolution (Preserves Library & Generates Presets)", async () => {
  const testCharId = `test-char-${randomUUID().slice(0, 8)}`;
  let createdLibChar: any = null;

  try {
    // Create an existing character in DB with personality and visualDescription
    createdLibChar = await createCharacter({
      id: testCharId,
      name: `OriginalLibraryChar_${Date.now()}`,
      species: "bunny",
      personality: "cheerful and kind",
      visualDescription: "A friendly bunny from library",
      avatarSvg: "<svg><circle r='10'/></svg>",
      canonicalAppearance: { head: { shape: "round", skinColor: "#ffffff" } },
    });

    const structuredCharacters = [
      {
        name: createdLibChar.name,
        role: "companion",
        species: "rabbit", // Should preserve original species 'bunny' from DB
        description: "Different description from prompt",
        personality: ["calm", "gentle"],
      },
      {
        name: `BrandNewChar_${Date.now()}`,
        role: "hero",
        species: "bear",
        description: "A gentle forest bear",
        personality: ["brave", "curious"],
      },
    ];

    const { resolvedCharacters, characterMapByName } =
      await CharacterResolutionService.resolveStoryCharacters(
        structuredCharacters,
        [createdLibChar.id]
      );

    assert.strictEqual(resolvedCharacters.length, 2, "Must resolve both characters");

    // Check existing library character was reused without mutation
    const existingResolved = resolvedCharacters.find((c) => c.id === createdLibChar.id);
    assert.ok(existingResolved, "Existing library character must be matched by ID/name");
    assert.strictEqual(existingResolved.species, "bunny", "Existing species must not be overwritten");
    assert.ok(existingResolved.canonicalAppearance, "Existing canonicalAppearance must be preserved");

    // Check new character was created with appropriate species preset
    const newResolved = resolvedCharacters.find((c) => c.name === structuredCharacters[1].name);
    assert.ok(newResolved, "New character must be created");
    assert.strictEqual(newResolved.species, "bear");

    // Cleanup new character from DB
    if (newResolved?.id) {
      await deleteCharacter(newResolved.id).catch(() => {});
    }
  } finally {
    if (createdLibChar) {
      await deleteCharacter(createdLibChar.id).catch(() => {});
    }
  }
});

test("Structured Story Generation - Atomic Persistence & Idempotency Key Caching", async () => {
  const idempotencyKey = `idem-key-${randomUUID()}`;
  let createdStoryId: string | null = null;

  try {
    const input = {
      topic: "Space adventures on the moon with Pip",
      title: "Moon Rover Pip",
      ageGroup: "4-7 years",
      desiredDurationSeconds: 30,
      language: "en",
      genre: "Adventure",
      lesson: "Curiosity and courage",
      idempotencyKey,
    };

    // First generation
    const result1 = await StoryGenerationService.generateAndPersistStory(input);
    createdStoryId = result1.story.storyId;

    assert.ok(result1.story.storyId, "Must return created storyId");
    assert.strictEqual(result1.story.title, "Moon Rover Pip");
    assert.ok(result1.scenes.length >= 2, "Must create scenes in database");
    assert.ok(result1.characters.length >= 1, "Must associate characters");

    // Verify DB records
    const dbStory = await getStoryByStoryId(createdStoryId);
    assert.ok(dbStory, "Story must exist in database");
    const dbScenes = await getScenesByStoryId(createdStoryId);
    assert.strictEqual(dbScenes.length, result1.scenes.length);

    // Second generation with SAME idempotencyKey must return cached result
    const result2 = await StoryGenerationService.generateAndPersistStory(input);
    assert.strictEqual(result2.story.storyId, createdStoryId, "Idempotency must return identical storyId");
    assert.strictEqual(result2.scenes.length, result1.scenes.length, "Idempotency must return identical scene count");
  } finally {
    if (createdStoryId) {
      await deleteStory(createdStoryId).catch(() => {});
    }
  }
});

test("Structured Story Generation - Story Regeneration (PUT) vs Manual Update (PATCH)", async () => {
  let storyId: string | null = null;

  try {
    // 1. Initial creation
    const initialResult = await StoryGenerationService.generateAndPersistStory({
      topic: "Exploring the garden flowers",
      title: "Garden Flowers",
      ageGroup: "2-4 years",
      desiredDurationSeconds: 25,
    });
    storyId = initialResult.story.storyId;
    const initialScenes = initialResult.scenes;
    assert.ok(initialScenes.length >= 2);

    // 2. Manual Update (PATCH equivalent via updateStoryMetadata)
    // Non-destructive: updates title and metadata without altering scenes
    const updatedStoryMeta = await updateStoryMetadata(storyId, {
      title: "Garden Flowers - Updated Title",
      logline: "Updated manual logline",
    });
    assert.strictEqual(updatedStoryMeta.title, "Garden Flowers - Updated Title");

    // Verify scenes were NOT deleted or regenerated
    const scenesAfterPatch = await getScenesByStoryId(storyId);
    assert.strictEqual(scenesAfterPatch.length, initialScenes.length, "PATCH must not delete or recreate scenes");
    assert.strictEqual(scenesAfterPatch[0].sceneId, initialScenes[0].sceneId, "Existing scene IDs must remain identical");

    // 3. Regeneration (PUT equivalent via regenerateStory)
    // Destructive: replaces scenes with fresh AI-generated scenes inside a transaction
    const regenerated = await StoryGenerationService.regenerateStory(storyId, {
      topic: "Pip the Bear goes on a cosmic space adventure",
      title: "Cosmic Bear Adventure",
      ageGroup: "4-7 years",
      desiredDurationSeconds: 30,
    });

    assert.strictEqual(regenerated.story.storyId, storyId, "Story ID must be preserved");
    assert.strictEqual(regenerated.story.title, "Cosmic Bear Adventure", "Title must be updated to new story");
    assert.ok(regenerated.scenes.length >= 2, "Must generate fresh scenes");

    // Old scene database records should be replaced with new ones
    const oldSceneIds = new Set(initialScenes.map((s) => s.id));
    const anyOldSceneRemains = regenerated.scenes.some((s) => oldSceneIds.has(s.id));
    assert.strictEqual(anyOldSceneRemains, false, "Regeneration must replace old scene records with newly generated ones");
    assert.notStrictEqual(regenerated.scenes[0].narration, initialScenes[0].narration, "Scene narration must be newly regenerated");
  } finally {
    if (storyId) {
      await deleteStory(storyId).catch(() => {});
    }
  }
});

test("Structured Story Generation - Single Scene Regeneration (POST /scenes/:sceneId/regenerate)", async () => {
  let storyId: string | null = null;

  try {
    const initial = await StoryGenerationService.generateAndPersistStory({
      topic: "Baking bread with Grandpa",
      title: "Baking Day",
      ageGroup: "4-7 years",
      desiredDurationSeconds: 30,
    });
    storyId = initial.story.storyId;
    assert.ok(initial.scenes.length >= 2);

    const targetScene = initial.scenes[0];

    // Regenerate only the first scene
    const regeneratedScene = await StoryGenerationService.regenerateSingleScene(
      targetScene.sceneId,
      "Make the scene more cheerful and emphasize the smell of fresh cinnamon"
    );

    assert.strictEqual(regeneratedScene.sceneId, targetScene.sceneId, "Scene ID must remain unchanged");
    assert.ok(regeneratedScene.narration, "Regenerated scene must have narration");
    assert.ok(regeneratedScene.animationData, "Regenerated scene must retain animationData");

    // Verify other scenes were not affected
    const scenesAfter = await getScenesByStoryId(storyId);
    assert.strictEqual(scenesAfter.length, initial.scenes.length, "Total scene count must remain unchanged");
    assert.strictEqual(scenesAfter[1].sceneId, initial.scenes[1].sceneId, "Second scene must be unchanged");
  } finally {
    if (storyId) {
      await deleteStory(storyId).catch(() => {});
    }
  }
});

test("Structured Story Generation - Provider Failure Graceful Fallback", async () => {
  // Test provider error fallback to deterministic generator
  const failingProvider = {
    name: "mock-flaky-cloud",
    async isAvailable() { return true; },
    async generateRaw(): Promise<string> {
      throw new Error("Rate limit exceeded 429");
    },
  };

  StoryProviderFactory.setMockProvider(failingProvider);

  try {
    const result = await StoryProviderFactory.generateStoryJson("tell a story", {
      topic: "a little bird learning to fly",
      ageGroup: "4-7 years",
      desiredDurationSeconds: 30,
    });

    assert.strictEqual(result.providerName, "deterministic_fallback", "Must gracefully fallback to deterministic provider");
    assert.ok(result.rawJson, "Must return valid rawJson from fallback");
    const parsed = JSON.parse(result.rawJson);
    assert.ok(parsed.title, "Fallback result must have title");
  } finally {
    // Reset mock provider to deterministic
    StoryProviderFactory.setMockProvider(new DeterministicStoryProvider());
  }
});
