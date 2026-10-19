import { test } from "node:test";
import assert from "node:assert";
import { getVectorRig } from "../src/services/animation/templates/default-characters.js";
import { buildRigFromAppearance, normalizeAppearance, CHARACTER_PRESETS } from "../src/services/animation/templates/custom-character-rig.js";
import { extractFaceAnchors, getHeadShapesForPose } from "../src/services/animation/face-renderer.js";
import { evaluatePose, CharacterInstance, AnimationClip } from "../src/services/animation/vector-animation.engine.js";
import { CharacterResolutionService, ResolvedCharacterInfo } from "../src/services/story-generation/character-resolution.service.js";
import { ScenePreparationService } from "../src/services/story-generation/scene-preparation.service.js";
import { createCharacter, getCharacterById, updateCharacter, deleteCharacter, createStory, createScene, deleteStory } from "../src/services/database/database.service.js";
import { AudioGenerationService } from "../src/services/audio-generation/audio-generation.service.js";
import { randomUUID } from "crypto";

test("Talking Earth Rig - Default Template & Structure", () => {
  const earth = getVectorRig("earth");
  assert.ok(earth, "Earth rig must be defined");
  assert.strictEqual(earth.species, "Planet");
  assert.strictEqual(earth.id, "char-rig-earth-planet");

  // Earth anatomy: Head/Globe contains face + continents + clouds
  assert.ok(earth.parts.head, "Earth must have a head (globe) part");
  assert.ok(earth.parts.head.shapes.length > 5, "Earth head should have globe, continent, and facial shapes");

  // Earth has no hands/arms, no legs/torso
  assert.strictEqual(earth.parts.torso.shapes.length, 0, "Planet torso should be empty");
  assert.strictEqual(earth.parts.leftLeg.shapes.length, 0, "Planet left leg should be empty");
  assert.strictEqual(earth.parts.rightLeg.shapes.length, 0, "Planet right leg should be empty");
  assert.strictEqual(earth.parts.leftArm.shapes.length, 0, "Planet has no arms/hands");
  assert.strictEqual(earth.parts.rightArm.shapes.length, 0, "Planet has no arms/hands");

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
  assert.strictEqual(builtRig.parts.leftArm.shapes.length, 0, "Planet rig has no arms/hands");
  assert.strictEqual(builtRig.parts.rightArm.shapes.length, 0, "Planet rig has no arms/hands");
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

test("Talking Earth Rig - Continent Stability Across Expressions and Lip-Sync", () => {
  const earth = getVectorRig("earth");
  assert.ok(earth, "Earth rig must exist");

  // Count base shapes with tag 'face_base' (globe, shading, and continents/clouds)
  const baseShapes = earth.parts.head.shapes.filter((s: any) => s.tag === "face_base");
  assert.ok(baseShapes.length >= 8, "Must have globe, shading, and multiple continents/clouds tagged face_base");

  // Verify that across various emotions and visemes, the base shapes remain completely unchanged
  const emotions = ["happy", "sad", "thinking", "excited", "surprised"] as const;
  const visemes = ["AI", "E", "O", "U", "MBP", "FV", "L", "rest"] as const;

  for (const emotion of emotions) {
    for (const viseme of visemes) {
      const dynamicShapes = getHeadShapesForPose(earth, {
        expression: emotion,
        mouthState: (viseme === "rest" ? "rest" : "open") as any,
        speaking: viseme !== "rest",
        torsoRotation: 0,
        torsoScaleY: 1,
        torsoPivotX: 0,
        torsoPivotY: 0,
        headRotation: 0,
        headPivotX: 0,
        headPivotY: 0,
        leftArmRotation: 0,
        rightArmRotation: 0,
        leftForearmRotation: 0,
        rightForearmRotation: 0,
        leftLegRotation: 0,
        rightLegRotation: 0,
        bodyY: 0,
        bodyX: 0,
        bodyRotation: 0,
        bounceOffset: 0,
        scaleX: 1,
        scaleY: 1,
      });
      const dynamicBaseShapes = dynamicShapes.filter((s: any) => s.tag === "face_base");
      assert.strictEqual(
        dynamicBaseShapes.length,
        baseShapes.length,
        `face_base shape count must stay identical during ${emotion} / ${viseme}`
      );
      // Verify first shape is ocean globe
      assert.strictEqual(
        (dynamicBaseShapes[0] as any).type,
        "circle",
        "Base globe shape must remain circle"
      );
    }
  }
});

test("Talking Earth Rig - Customization Options (Ocean, Continents, Glow, Clouds, Gloves)", () => {
  const customEarthApp = {
    ...CHARACTER_PRESETS.earth.appearance,
    planet: {
      oceanColor: "#0284c7", // Azure ocean
      continentColor: "#84cc16", // Lime continents
      atmosphereGlow: "gold" as const,
      clouds: false,
      showHands: false,
    },
  };

  const rig = buildRigFromAppearance("custom-earth-1", "Aura Earth", customEarthApp);
  assert.strictEqual(rig.species, "planet");

  // Verify custom ocean circle is present
  const oceanShape = rig.parts.head.shapes.find(
    (s: any) => s.type === "circle" && s.fill === "#0284c7"
  );
  assert.ok(oceanShape, "Rig must render customized ocean color");

  // Verify custom continent color is present
  const continentShape = rig.parts.head.shapes.find(
    (s: any) => s.fill === "#84cc16"
  );
  assert.ok(continentShape, "Rig must render customized continent color");

  // Verify clouds are disabled when clouds: false
  const cloudShapes = rig.parts.head.shapes.filter(
    (s: any) => s.stroke === "#ffffff" && s.strokeWidth >= 2.5
  );
  assert.strictEqual(cloudShapes.length, 0, "No clouds should be rendered when clouds: false");

  // Verify hands are omitted when showHands: false
  assert.strictEqual(rig.parts.leftArm.shapes.length, 0, "Left arm should be empty when showHands: false");
  assert.strictEqual(rig.parts.rightArm.shapes.length, 0, "Right arm should be empty when showHands: false");
});

test("Per-Character Voice Assignment - Normalization & Independent Persistence", async () => {
  // 1. normalizeAppearance preservation
  const appWithVoice = {
    ...CHARACTER_PRESETS.earth.appearance,
    voiceConfig: {
      voiceId: "bm_daniel",
      speed: 1.05,
      style: "serious" as const,
      effect: "normal" as const,
    },
  };
  const normalized = normalizeAppearance(appWithVoice);
  assert.ok(normalized.voiceConfig, "normalizeAppearance must preserve voiceConfig");
  assert.strictEqual(normalized.voiceConfig?.voiceId, "bm_daniel");
  assert.strictEqual(normalized.voiceConfig?.speed, 1.05);

  // 2. Independent DB persistence
  const charId1 = `test-earth-${randomUUID()}`;
  const charId2 = `test-bella-${randomUUID()}`;

  const char1 = await createCharacter({
    id: charId1,
    name: "Independent Earth",
    species: "planet",
    personality: "Wise and ancient",
    visualDescription: "Living talking globe",
    canonicalAppearance: {
      ...CHARACTER_PRESETS.earth.appearance,
      voiceConfig: {
        voiceId: "bm_daniel",
        speed: 0.95,
        style: "calm",
        effect: "normal",
      },
    },
  });

  const char2 = await createCharacter({
    id: charId2,
    name: "Independent Bella",
    species: "human",
    personality: "Energetic girl",
    visualDescription: "Girl in hoodie",
    canonicalAppearance: {
      ...CHARACTER_PRESETS.kid_girl.appearance,
      voiceConfig: {
        voiceId: "af_bella",
        speed: 1.15,
        style: "excited",
        effect: "cartoon",
      },
    },
  });

  assert.strictEqual((char1.canonicalAppearance as any)?.voiceConfig?.voiceId, "bm_daniel");
  assert.strictEqual((char2.canonicalAppearance as any)?.voiceConfig?.voiceId, "af_bella");

  // Updating char1 voice must NOT affect char2
  await updateCharacter(charId1, {
    canonicalAppearance: {
      ...(char1.canonicalAppearance as any),
      voiceConfig: {
        voiceId: "bm_daniel",
        speed: 1.25,
        style: "excited",
        effect: "normal",
      },
    },
  });

  const fetched1 = await getCharacterById(charId1);
  const fetched2 = await getCharacterById(charId2);

  assert.strictEqual((fetched1?.canonicalAppearance as any)?.voiceConfig?.speed, 1.25);
  assert.strictEqual((fetched2?.canonicalAppearance as any)?.voiceConfig?.voiceId, "af_bella");
  assert.strictEqual((fetched2?.canonicalAppearance as any)?.voiceConfig?.speed, 1.15);

  // Clean up
  await deleteCharacter(charId1).catch(() => {});
  await deleteCharacter(charId2).catch(() => {});
});

test("Dialogue Voice Resolution - Resolves by Character ID or Name with Fallbacks", async () => {
  const audioService = new AudioGenerationService();

  // Test 1: Fallback heuristic for Earth/Terra when no voice passed
  const earthDialogue = await audioService.generateCharacterDialogueAudio({
    sceneId: "scene-test-fallback",
    characterName: "Terra",
    text: "Welcome to the solar system!",
  });
  assert.strictEqual(earthDialogue.voice, "bm_daniel", "Earth/Terra must resolve to bm_daniel by default");

  // Test 2: Fallback heuristic for Bear when no voice passed
  const bearDialogue = await audioService.generateCharacterDialogueAudio({
    sceneId: "scene-test-fallback",
    characterName: "Pip the Bear",
    text: "Look at the stars!",
  });
  assert.strictEqual(bearDialogue.voice, "bm_george", "Bear must resolve to bm_george by default");

  // Test 3: Resolution from DB character record
  const customCharId = `test-char-${randomUUID()}`;
  const cosmosName = `Doctor Cosmos ${randomUUID().slice(0, 6)}`;
  await createCharacter({
    id: customCharId,
    name: cosmosName,
    species: "human",
    personality: "Curious scientist",
    visualDescription: "Scientist with telescope",
    canonicalAppearance: {
      ...CHARACTER_PRESETS.kid_boy.appearance,
      voiceConfig: {
        voiceId: "af_sky",
        speed: 1.1,
        style: "curious",
        effect: "normal",
      },
    },
  });

  const resolvedDialogue = await audioService.generateCharacterDialogueAudio({
    sceneId: "scene-test-db",
    characterId: customCharId,
    characterName: cosmosName,
    text: "Behold the constellation!",
  });
  assert.strictEqual(resolvedDialogue.voice, "af_sky", "Must resolve character-specific voiceConfig from DB");

  await deleteCharacter(customCharId).catch(() => {});
});

test("Single Character Dialogue Regeneration - Updates matching character lines only", async () => {
  const audioService = new AudioGenerationService();

  const testStoryId = `story-regen-${randomUUID()}`;
  const testSceneId = `scene-regen-${randomUUID()}`;

  await createStory({
    id: testStoryId,
    storyId: testStoryId,
    title: "Space Journey",
    ageGroup: "6-8",
  });

  await createScene({
    id: `scene-record-${randomUUID()}`,
    storyId: testStoryId,
    sceneId: testSceneId,
    number: 1,
    title: "Space Intro",
    narration: "A voyage through the cosmos",
    animationData: {
      characterInstances: [],
      dialogueLines: [
        {
          id: "diag-1",
          characterId: "char-terra",
          characterName: "Terra",
          text: "I am planet Earth!",
          voice: "bm_daniel",
          startMs: 0,
          durationMs: 2000,
        },
        {
          id: "diag-2",
          characterId: "char-pip",
          characterName: "Pip",
          text: "I am Pip the bear!",
          voice: "bm_george",
          audioUrl: "/storage/audio/original-pip.mp3",
          startMs: 2500,
          durationMs: 2000,
        },
      ],
    } as any,
  });

  // Regenerate dialogue for Terra only
  const updatedLines = await audioService.regenerateCharacterDialogueInScene(
    testSceneId,
    "Terra"
  );

  assert.strictEqual(updatedLines.length, 2);
  const terraLine = updatedLines.find((l) => l.characterName === "Terra");
  const pipLine = updatedLines.find((l) => l.characterName === "Pip");

  assert.ok(terraLine?.audioUrl, "Terra line must have freshly generated audioUrl");
  assert.strictEqual(pipLine?.audioUrl, "/storage/audio/original-pip.mp3", "Pip line audioUrl must remain untouched");

  // Clean up
  await deleteStory(testStoryId).catch(() => {});
});
