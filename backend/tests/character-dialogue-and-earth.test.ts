import { test } from "node:test";
import assert from "node:assert";
import { getVectorRig } from "../src/services/animation/templates/default-characters.js";
import { buildRigFromAppearance, CHARACTER_PRESETS } from "../src/services/animation/templates/custom-character-rig.js";
import { extractFaceAnchors } from "../src/services/animation/face-renderer.js";
import { evaluatePose, CharacterInstance, AnimationClip } from "../src/services/animation/vector-animation.engine.js";
import { CharacterResolutionService, ResolvedCharacterInfo } from "../src/services/story-generation/character-resolution.service.js";
import { ScenePreparationService } from "../src/services/story-generation/scene-preparation.service.js";
import { deleteCharacter } from "../src/services/database/database.service.js";

test("Talking Earth Rig - Default Template & Structure", () => {
  const earth = getVectorRig("earth");
  assert.ok(earth, "Earth rig must be defined");
  assert.strictEqual(earth.species, "Planet");
  assert.strictEqual(earth.id, "char-rig-earth-planet");

  // Earth anatomy: Head/Globe contains face + continents + clouds
  assert.ok(earth.parts.head, "Earth must have a head (globe) part");
  assert.ok(earth.parts.head.shapes.length > 5, "Earth head should have globe, continent, and facial shapes");

  // Earth has floating gloved side hands, no legs/torso
  assert.strictEqual(earth.parts.torso.shapes.length, 0, "Planet torso should be empty");
  assert.strictEqual(earth.parts.leftLeg.shapes.length, 0, "Planet left leg should be empty");
  assert.strictEqual(earth.parts.rightLeg.shapes.length, 0, "Planet right leg should be empty");
  assert.ok(earth.parts.leftArm.shapes.length > 0, "Planet has floating left arm/glove");
  assert.ok(earth.parts.rightArm.shapes.length > 0, "Planet has floating right arm/glove");

  // Verify tags for facial parts inside head
  const eyeShape = earth.parts.head.shapes.find((s) => (s as any).tag === "eyes");
  assert.ok(eyeShape, "Earth must have tagged eye shape for dynamic expressions");
  const mouthShape = earth.parts.head.shapes.find((s) => (s as any).tag === "mouth");
  assert.ok(mouthShape, "Earth must have tagged mouth shape for viseme lip-sync");
  const browShape = earth.parts.head.shapes.find((s) => (s as any).tag === "eyebrows");
  assert.ok(browShape, "Earth must have tagged eyebrow shape");
});

test("Talking Earth Rig - Custom Rig Generation from Appearance", () => {
  const earthPreset = CHARACTER_PRESETS.earth;
  assert.ok(earthPreset, "Earth preset must exist");
  assert.strictEqual(earthPreset.appearance.species, "planet");
  assert.strictEqual(earthPreset.appearance.voiceConfig?.voiceId, "bm_daniel");

  const builtRig = buildRigFromAppearance("earth-instance-1", "Terra", earthPreset.appearance);
  assert.strictEqual(builtRig.species, "planet");
  assert.strictEqual(builtRig.parts.torso.shapes.length, 0);
  assert.ok(builtRig.parts.head.shapes.length > 0);
  assert.ok(builtRig.parts.leftArm.shapes.length > 0);
  assert.ok(builtRig.parts.rightArm.shapes.length > 0);
});

test("Talking Earth Rig - Face Anchors Extraction", () => {
  const earth = getVectorRig("earth");
  const anchors = extractFaceAnchors(earth);
  assert.ok(anchors, "Face anchors must be extractable from Earth rig");
  assert.ok(anchors.eyeY < anchors.mouthY, "Eyes should be above mouth on Earth globe");
  assert.ok(anchors.browY < anchors.eyeY, "Eyebrows should be above eyes on Earth globe");
  assert.ok(anchors.leftEyeX < 0 && anchors.rightEyeX > 0, "Eyes should be horizontally balanced");
});

test("Talking Earth Rig - Evaluation of Floating & Gestures", () => {
  const instance: CharacterInstance = {
    instanceId: "terra-1",
    characterId: "earth",
    x: 640,
    y: 360,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    zIndex: 1,
  };

  // 1. Idle: Gentle floating bob
  const idleClip: AnimationClip[] = [
    {
      clipId: "c1",
      instanceId: "terra-1",
      action: "idle",
      startMs: 0,
      durationMs: 3000,
      loop: true,
    },
  ];
  const poseIdle1 = evaluatePose(instance, idleClip, 0);
  const poseIdle2 = evaluatePose(instance, idleClip, 750);
  assert.strictEqual(poseIdle1.activeAction, "idle");
  assert.notStrictEqual(poseIdle1.torsoBobY, poseIdle2.torsoBobY, "Earth should float/bob up and down during idle");

  // 2. Wave: Right glove arm moves
  const waveClip: AnimationClip[] = [
    {
      clipId: "c2",
      instanceId: "terra-1",
      action: "wave",
      startMs: 0,
      durationMs: 2000,
      loop: true,
    },
  ];
  const poseWave = evaluatePose(instance, waveClip, 500);
  assert.strictEqual(poseWave.activeAction, "wave");
  assert.notStrictEqual(poseWave.rightArmAngle, 0, "Right arm/glove should wave");

  // 3. Walk: Floating glide with no leg swing
  const walkClip: AnimationClip[] = [
    {
      clipId: "c3",
      instanceId: "terra-1",
      action: "walk",
      startMs: 0,
      durationMs: 2000,
      loop: true,
    },
  ];
  const poseWalk = evaluatePose(instance, walkClip, 500);
  assert.strictEqual(poseWalk.leftLegAngle, 0, "Earth has no leg swing during walk/glide");
  assert.strictEqual(poseWalk.rightLegAngle, 0, "Earth has no leg swing during walk/glide");
});

test("Character Resolution - Earth / Planet Recognition", async () => {
  const structuredChars = [
    {
      name: "Terra",
      role: "guide",
      species: "planet",
      description: "Our blue and green home planet Earth with animated eyes and smiling mouth",
      personality: ["nurturing", "wise"],
    },
  ];

  const { resolvedCharacters } = await CharacterResolutionService.resolveStoryCharacters(
    structuredChars as any,
    []
  );

  assert.strictEqual(resolvedCharacters.length, 1);
  const terra = resolvedCharacters[0];
  assert.strictEqual(terra.species, "planet");
  assert.strictEqual(terra.canonicalAppearance?.voiceConfig?.voiceId, "bm_daniel");

  if (terra.id) {
    await deleteCharacter(terra.id).catch(() => {});
  }
});

test("Scene Preparation - Sequential Dialogue Timing & Viseme Generation", () => {
  const characters: ResolvedCharacterInfo[] = [
    {
      id: "char-terra",
      name: "Terra",
      species: "planet",
      personality: "wise",
      visualDescription: "Planet Earth",
      distinctiveFeatures: "blue and green",
      isExisting: true,
      canonicalAppearance: CHARACTER_PRESETS.earth.appearance,
    },
    {
      id: "char-pip",
      name: "Pip",
      species: "bear",
      personality: "cheerful",
      visualDescription: "Brown bear",
      distinctiveFeatures: "bear ears",
      isExisting: true,
      canonicalAppearance: CHARACTER_PRESETS.bear_cub.appearance,
    },
  ];

  const characterMapByName = new Map<string, ResolvedCharacterInfo>();
  characters.forEach((c) => characterMapByName.set(c.name.toLowerCase().trim(), c));

  const rawScenes = [
    {
      sceneNumber: 1,
      title: "Welcome to Space",
      summary: "Terra speaks to Pip",
      narration: "Welcome to our wonderful solar system!",
      visualDescription: "Outer space with starry background",
      location: "Space",
      timeOfDay: "Day",
      durationSeconds: 8,
      dialogue: [
        {
          characterName: "Terra",
          text: "Hello young explorers! I am Planet Earth.",
          emotion: "happy",
          speakingStyle: "cheerful",
        },
        {
          characterName: "Pip",
          text: "Hi Terra, you look so bright and blue today!",
          emotion: "curious",
          speakingStyle: "cheerful",
        },
      ],
      characterActions: [
        { characterName: "Terra", action: "wave", pose: "friendly", description: "Waves" },
        { characterName: "Pip", action: "idle", pose: "listening", description: "Listens" },
      ],
    },
  ];

  const prepared = ScenePreparationService.prepareScenes(
    rawScenes as any,
    characterMapByName,
    characters,
    8
  );

  assert.strictEqual(prepared.length, 1);
  const scene1 = prepared[0];
  const animData = scene1.animationData;

  // Check dialogue lines
  assert.ok(animData.dialogueLines, "dialogueLines must be populated in animationData");
  assert.strictEqual(animData.dialogueLines.length, 2, "Both dialogue turns must be present");

  const [d1, d2] = animData.dialogueLines;
  assert.strictEqual(d1.characterName, "Terra");
  assert.strictEqual(d1.voice, "bm_daniel", "Terra must be assigned Daniel's Kokoro voice");
  assert.ok(d1.visemeCues && d1.visemeCues.length > 0, "Terra must have initial viseme cues");

  assert.strictEqual(d2.characterName, "Pip");
  assert.strictEqual(d2.voice, "bm_george", "Pip the Bear must be assigned George's Kokoro voice");

  // Verify sequential ordering (d2 starts after d1 ends)
  assert.ok(d1.startMs >= 0, "d1 startMs should be non-negative");
  assert.ok(d1.durationMs > 0, "d1 durationMs should be positive");
  assert.ok(d2.startMs >= d1.startMs + d1.durationMs, "d2 must start after d1 finishes to prevent dialogue overlapping");

  // Verify expression cues were also generated
  assert.ok(animData.expressionCues, "expressionCues must be populated");
  assert.ok(animData.expressionCues.length >= 2, "Expression cues should be created for dialogue turns");
});
