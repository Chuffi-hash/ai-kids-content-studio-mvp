import { test } from "node:test";
import assert from "node:assert";
import { randomUUID } from "crypto";
import {
  VectorAnimationEngine,
  evaluatePose,
  VectorSceneData,
  CharacterInstance,
  AnimationClip,
} from "../src/services/animation/vector-animation.engine.js";
import {
  buildRigFromAppearance,
  normalizeAppearance,
  DEFAULT_APPEARANCE,
  CHARACTER_PRESETS,
  CustomCharacterAppearance,
} from "../src/services/animation/templates/custom-character-rig.js";
import {
  createCharacter,
  getCharacterById,
  updateCharacter,
  deleteCharacter,
  createStory,
  deleteStory,
  createScene,
  batchUpdateSceneTimelines,
  deleteScene,
  updateScene,
  getSceneById,
  CharacterConflictError,
} from "../src/services/database/database.service.js";

test("Issue 1: Distinct SVG Customization for advertised options", () => {
  const engine = new VectorAnimationEngine();

  // Test Head Shapes: Heart vs Square vs Round vs Oval
  const heartHeadRig = buildRigFromAppearance("head-heart", "Heart Char", {
    ...DEFAULT_APPEARANCE,
    head: { shape: "heart", size: 1.0, skinColor: "#fed7aa" },
  });
  const squareHeadRig = buildRigFromAppearance("head-square", "Square Char", {
    ...DEFAULT_APPEARANCE,
    head: { shape: "square", size: 1.0, skinColor: "#fed7aa" },
  });
  const roundHeadRig = buildRigFromAppearance("head-round", "Round Char", {
    ...DEFAULT_APPEARANCE,
    head: { shape: "round", size: 1.0, skinColor: "#fed7aa" },
  });

  const heartShape = heartHeadRig.parts.head.shapes.find(
    (s) => s.type === "path",
  );
  assert.ok(heartShape, "Heart head must render as SVG path");
  assert.ok(
    heartShape.d?.includes("C") || heartShape.d?.includes("c"),
    "Heart head path must have cubic bezier curves",
  );

  const squareShape = squareHeadRig.parts.head.shapes.find(
    (s) => s.type === "rect",
  );
  assert.ok(squareShape, "Square head must render as SVG rect");

  const roundShape = roundHeadRig.parts.head.shapes.find(
    (s) => s.type === "circle",
  );
  assert.ok(roundShape, "Round head must render as SVG circle");

  // Test Eye Styles: Anime (with tall iris & dual sparkles) vs Sleepy vs Happy
  const animeEyeRig = buildRigFromAppearance("eye-anime", "Anime Eyes", {
    ...DEFAULT_APPEARANCE,
    eyes: { style: "anime", color: "#3b82f6", size: 1.0 },
  });
  const sleepyEyeRig = buildRigFromAppearance("eye-sleepy", "Sleepy Eyes", {
    ...DEFAULT_APPEARANCE,
    eyes: { style: "sleepy", color: "#0f172a", size: 1.0 },
  });

  // Anime eyes have white sparkle highlights
  const animeSparkles = animeEyeRig.parts.head.shapes.filter(
    (s) => s.type === "circle" && s.fill === "#ffffff",
  );
  assert.ok(
    animeSparkles.length >= 2,
    "Anime eyes must include multiple sparkle highlight circles",
  );

  // Sleepy eyes use curved stroke arcs without circle fills
  const sleepyLids = sleepyEyeRig.parts.head.shapes.filter(
    (s) => s.type === "path" && s.stroke && (s.fill === "none" || !s.fill),
  );
  assert.ok(
    sleepyLids.length >= 2,
    "Sleepy eyes must include curved eyelid arcs",
  );

  // Test Nose Styles: Oval vs Button vs Triangle vs Bear Snout
  const ovalNoseRig = buildRigFromAppearance("nose-oval", "Oval Nose", {
    ...DEFAULT_APPEARANCE,
    nose: { style: "oval", size: 1.0 },
  });
  const buttonNoseRig = buildRigFromAppearance("nose-button", "Button Nose", {
    ...DEFAULT_APPEARANCE,
    nose: { style: "button", size: 1.0 },
  });
  const triangleNoseRig = buildRigFromAppearance(
    "nose-triangle",
    "Triangle Nose",
    {
      ...DEFAULT_APPEARANCE,
      nose: { style: "triangle", size: 1.0 },
    },
  );

  assert.ok(
    ovalNoseRig.parts.head.shapes.some((s) => s.type === "ellipse"),
    "Oval nose must render as SVG ellipse",
  );
  assert.ok(
    buttonNoseRig.parts.head.shapes.some(
      (s) => s.type === "circle" || s.type === "path",
    ),
    "Button nose must render",
  );
  assert.ok(
    triangleNoseRig.parts.head.shapes.some(
      (s) => s.type === "polygon" || s.type === "path",
    ),
    "Triangle nose must render",
  );

  // Test Eyebrow Styles: Bushy vs Arched vs Flat
  const bushyBrowRig = buildRigFromAppearance("brow-bushy", "Bushy Brow", {
    ...DEFAULT_APPEARANCE,
    eyebrows: { style: "bushy", color: "#78350f" },
  });
  const bushyShapes = bushyBrowRig.parts.head.shapes.filter(
    (s) => s.strokeWidth && s.strokeWidth >= 5,
  );
  assert.ok(
    bushyShapes.length >= 2,
    "Bushy eyebrows must have bold strokeWidth >= 5",
  );

  // Test Mouth Styles: Open Grin (teeth) vs Laugh (tongue)
  const grinRig = buildRigFromAppearance("mouth-grin", "Grin", {
    ...DEFAULT_APPEARANCE,
    mouth: { style: "open_grin" },
  });
  const laughRig = buildRigFromAppearance("mouth-laugh", "Laugh", {
    ...DEFAULT_APPEARANCE,
    mouth: { style: "laugh" },
  });

  assert.ok(
    grinRig.parts.head.shapes.some((s) => s.fill === "#ffffff"),
    "Open grin must include white teeth highlight",
  );
  assert.ok(
    laughRig.parts.head.shapes.some(
      (s) => s.fill === "#f87171" || s.fill === "#f43f5e",
    ),
    "Laugh mouth must include pink/rose tongue",
  );

  // Test Ears: Elf (pointed) vs Bear (round)
  const elfEarRig = buildRigFromAppearance("ear-elf", "Elf Ear", {
    ...DEFAULT_APPEARANCE,
    ears: { style: "elf", size: 1.0 },
  });
  assert.ok(
    elfEarRig.parts.head.shapes.some(
      (s) => s.type === "path" && s.d?.includes("Q"),
    ),
    "Elf ears must render pointed SVG path",
  );

  // Test Shoes: Sneakers (laces/sole) vs Boots
  const sneakerRig = buildRigFromAppearance("shoe-sneakers", "Sneakers", {
    ...DEFAULT_APPEARANCE,
    legs: {
      ...DEFAULT_APPEARANCE.legs,
      shoeStyle: "sneakers",
      shoeColor: "#ef4444",
    },
  });
  const bootRig = buildRigFromAppearance("shoe-boots", "Boots", {
    ...DEFAULT_APPEARANCE,
    legs: {
      ...DEFAULT_APPEARANCE.legs,
      shoeStyle: "boots",
      shoeColor: "#1e293b",
    },
  });

  assert.ok(
    sneakerRig.parts.leftLeg.shapes.some((s) => s.fill === "#ffffff"),
    "Sneakers must have white rubber sole/laces",
  );
  assert.ok(
    bootRig.parts.leftLeg.shapes.some(
      (s) => s.type === "rect" || s.type === "path",
    ),
    "Boots must have distinct cuff/shaft structure",
  );
});

test("Issue 2: Connected joint hierarchy & independent limb customization", () => {
  // Appearance with independent left and right limbs
  const independentApp: CustomCharacterAppearance = {
    ...DEFAULT_APPEARANCE,
    leftArm: {
      upperArmLength: 0.9,
      upperArmThickness: 0.95,
      forearmLength: 0.85,
      forearmThickness: 0.9,
      sleeveStyle: "short",
      handShape: "simple",
    },
    rightArm: {
      upperArmLength: 1.25,
      upperArmThickness: 1.15,
      forearmLength: 1.2,
      forearmThickness: 1.1,
      sleeveStyle: "long",
      handShape: "paw",
    },
    leftLeg: {
      upperLegLength: 0.95,
      upperLegThickness: 1.0,
      lowerLegLength: 0.9,
      lowerLegThickness: 0.95,
      pantsStyle: "shorts",
      pantsColor: "#f59e0b",
      shoeStyle: "sneakers",
      shoeColor: "#ef4444",
    },
    rightLeg: {
      upperLegLength: 1.15,
      upperLegThickness: 1.1,
      lowerLegLength: 1.2,
      lowerLegThickness: 1.05,
      pantsStyle: "pants",
      pantsColor: "#1e3a8a",
      shoeStyle: "boots",
      shoeColor: "#0f172a",
    },
  };

  const normalized = normalizeAppearance(independentApp);
  assert.strictEqual(normalized.leftArm?.upperArmLength, 0.9);
  assert.strictEqual(normalized.rightArm?.upperArmLength, 1.25);
  assert.strictEqual(normalized.leftLeg?.pantsStyle, "shorts");
  assert.strictEqual(normalized.rightLeg?.shoeStyle, "boots");

  const rig = buildRigFromAppearance("indep-char", "Bionic Hero", normalized);

  // Both forearms must exist for full joint articulation
  assert.ok(rig.parts.leftForearm, "leftForearm must be present in rig");
  assert.ok(rig.parts.rightForearm, "rightForearm must be present in rig");

  // Verify left and right elbow pivots differ according to upper arm lengths
  const leftElbowY = rig.parts.leftForearm.pivot.y;
  const rightElbowY = rig.parts.rightForearm.pivot.y;
  assert.ok(
    rightElbowY > leftElbowY,
    `Right elbow pivot (${rightElbowY}) must be lower than left elbow pivot (${leftElbowY}) due to longer upper arm`,
  );

  // Kinematic evaluation across all poses produces finite numbers and no NaN
  const instance: CharacterInstance = {
    instanceId: "indep-inst",
    characterId: rig.id,
    assetType: "vector_rig",
    name: "Bionic Hero",
    x: 400,
    y: 500,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    zIndex: 1,
    customRig: rig,
    appearance: normalized,
  };

  const actions: Array<"idle" | "walk" | "wave" | "jump"> = [
    "idle",
    "walk",
    "wave",
    "jump",
  ];
  for (const act of actions) {
    const clip: AnimationClip = {
      clipId: `c-${act}`,
      instanceId: "indep-inst",
      action: act,
      startMs: 0,
      durationMs: 2000,
      loop: true,
    };
    for (const time of [0, 500, 1000, 1500, 2000]) {
      const pose = evaluatePose(instance, [clip], time);
      assert.ok(isFinite(pose.x), `${act} x must be finite`);
      assert.ok(isFinite(pose.y), `${act} y must be finite`);
      assert.ok(
        isFinite(pose.leftArmAngle),
        `${act} leftArmAngle must be finite`,
      );
      assert.ok(
        isFinite(pose.rightArmAngle),
        `${act} rightArmAngle must be finite`,
      );
      assert.ok(
        isFinite(pose.leftForearmAngle),
        `${act} leftForearmAngle must be finite`,
      );
      assert.ok(
        isFinite(pose.rightForearmAngle),
        `${act} rightForearmAngle must be finite`,
      );
      assert.ok(
        isFinite(pose.leftLegAngle),
        `${act} leftLegAngle must be finite`,
      );
      assert.ok(
        isFinite(pose.rightLegAngle),
        `${act} rightLegAngle must be finite`,
      );
    }
  }

  // Headless rendering of both forearms via Resvg
  const engine = new VectorAnimationEngine();
  const sceneData: VectorSceneData = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    characterInstances: [instance],
    animationClips: [
      {
        clipId: "wave-both",
        instanceId: "indep-inst",
        action: "wave",
        startMs: 0,
        durationMs: 2000,
        loop: true,
      },
    ],
  };

  const svg = engine.renderFrameToSVG(sceneData, 500);
  assert.ok(svg.includes("<svg"), "Rendered output must be SVG");
  assert.ok(
    svg.includes('id="leftForearm"'),
    "SVG must include left forearm group",
  );
  assert.ok(
    svg.includes('id="rightForearm"'),
    "SVG must include right forearm group",
  );
});

test("Issue 4: Character Conflict Error on Name Collision and Safe Story Linking", async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const testCharName = `Oliver Safety ${uniqueSuffix}`;

  // 1. Create first character
  const char1 = await createCharacter({
    name: testCharName,
    species: "Human",
    personality: "Brave and kind",
    visualDescription: "A little boy with blue shirt",
    canonicalAppearance: DEFAULT_APPEARANCE,
  });
  assert.ok(char1.id, "First character must be created");

  try {
    // 2. Creating another character with duplicate name (case-insensitive & trimmed) must throw CharacterConflictError (409)
    await assert.rejects(
      async () => {
        await createCharacter({
          name: `  ${testCharName.toLowerCase()}  `,
          species: "Elf",
          personality: "Sneaky",
          visualDescription: "Should never overwrite!",
          canonicalAppearance: DEFAULT_APPEARANCE,
        });
      },
      (err: any) => {
        assert.ok(
          err instanceof CharacterConflictError ||
            err.name === "CharacterConflictError" ||
            err.statusCode === 409,
          `Expected CharacterConflictError 409, got: ${err.message}`,
        );
        return true;
      },
    );

    // 3. Verify original character was NOT modified
    const original = await getCharacterById(char1.id);
    assert.strictEqual(
      original?.species,
      "Human",
      "Original character species must not be overwritten",
    );
    assert.strictEqual(
      original?.personality,
      "Brave and kind",
      "Original personality must remain intact",
    );

    // 4. Intentional update by ID is allowed and succeeds
    const updated = await updateCharacter(char1.id, {
      personality: "Extra brave and kind",
    });
    assert.strictEqual(updated.personality, "Extra brave and kind");

    // 5. Updating name to another existing character name must also throw conflict error
    const testCharName2 = `Luna Second ${uniqueSuffix}`;
    const char2 = await createCharacter({
      name: testCharName2,
      species: "Human",
      personality: "Curious",
      visualDescription: "A girl with pink hoodie",
      canonicalAppearance: DEFAULT_APPEARANCE,
    });

    await assert.rejects(
      async () => {
        await updateCharacter(char2.id, {
          name: testCharName,
        });
      },
      (err: any) => {
        assert.ok(
          err instanceof CharacterConflictError ||
            err.name === "CharacterConflictError" ||
            err.statusCode === 409,
          `Expected CharacterConflictError on update to existing name`,
        );
        return true;
      },
    );

    await deleteCharacter(char2.id);
  } finally {
    await deleteCharacter(char1.id);
  }
});

test("Issue 5: Safe normalization and non-human character species preservation", () => {
  // Legacy character with missing or non-human attributes
  const bearLegacy = {
    species: "bear",
    head: { skinColor: "#d97706" },
  };

  const normalizedBear = normalizeAppearance(bearLegacy);
  assert.strictEqual(
    normalizedBear.species,
    "bear",
    "Bear species must be preserved",
  );
  assert.strictEqual(normalizedBear.version, 1, "Version must be 1");
  assert.ok(normalizedBear.torso, "Missing torso must be safely backfilled");
  assert.ok(normalizedBear.arms, "Missing arms must be safely backfilled");
  assert.ok(
    normalizedBear.leftArm,
    "Missing leftArm must be safely backfilled",
  );
  assert.ok(
    normalizedBear.rightArm,
    "Missing rightArm must be safely backfilled",
  );

  // Verify buildRigFromAppearance works without crashing or NaN on legacy bear
  const bearRig = buildRigFromAppearance("legacy-bear", "Pip", normalizedBear);
  assert.strictEqual(bearRig.species, "bear");
  assert.ok(bearRig.parts.head);
  assert.ok(bearRig.parts.torso);
});

test("Issue 3: Scene timeline validation, contiguous deletion re-indexing, and dialogue persistence", async () => {
  const storyId = `story-test-safety-${Date.now()}`;
  // 1. Create a test story
  const story = await createStory({
    storyId,
    title: "Test Story for Editing Safety",
    targetDuration: 15000,
  });

  const scene1 = await createScene({
    id: randomUUID(),
    sceneId: `sc-1-${Date.now()}`,
    storyId: story.storyId,
    title: "Scene 1: Introduction",
    narration: "Once upon a time in the emerald forest.",
    startMs: 0,
    endMs: 5000,
    order: 0,
    number: 1,
  });

  const scene2 = await createScene({
    id: randomUUID(),
    sceneId: `sc-2-${Date.now()}`,
    storyId: story.storyId,
    title: "Scene 2: The Cave",
    narration: "They reached the mysterious crystal cave.",
    startMs: 5000,
    endMs: 10000,
    order: 1,
    number: 2,
  });

  const scene3 = await createScene({
    id: randomUUID(),
    sceneId: `sc-3-${Date.now()}`,
    storyId: story.storyId,
    title: "Scene 3: The Discovery",
    narration: "A glowing star illuminated the cavern walls.",
    startMs: 10000,
    endMs: 15000,
    order: 2,
    number: 3,
  });

  try {
    // 2. Cross-story validation in batchUpdateSceneTimelines
    const foreignStoryId = randomUUID();
    await assert.rejects(
      async () => {
        await batchUpdateSceneTimelines(foreignStoryId, [
          { sceneId: scene1.sceneId, order: 0, startMs: 0, endMs: 4000 },
        ]);
      },
      (err: any) => {
        assert.ok(
          err.message.includes("do not belong"),
          "Must reject scenes not belonging to story",
        );
        return true;
      },
    );

    // 3. Structured dialogue and characterActions persistence
    const updatedScene2 = await updateScene(scene2.sceneId, {
      title: "Scene 2: Inside the Deep Cave",
      narration: "They stepped inside the deep cavern.",
      animationData: {
        version: 1,
        viewport: { width: 1280, height: 720 },
        characterInstances: [],
        animationClips: [],
        dialogue: [
          { speaker: "Pip", text: "Look at those glowing gems!" },
          { speaker: "Sammy", text: "Be careful not to slip!" },
        ],
        characterActions: [
          { characterName: "Pip", action: "points at gems", pose: "wave" },
          { characterName: "Sammy", action: "walks carefully", pose: "walk" },
        ],
      } as any,
    });

    assert.strictEqual(updatedScene2.title, "Scene 2: Inside the Deep Cave");
    const fetchedScene2 = await getSceneById(scene2.sceneId);
    const animData = fetchedScene2?.animationData as any;
    assert.ok(animData, "animationData must be persisted");
    assert.strictEqual(
      animData.dialogue?.length,
      2,
      "Dialogue items must be saved in animationData",
    );
    assert.strictEqual(animData.dialogue[0].speaker, "Pip");
    assert.strictEqual(
      animData.characterActions?.length,
      2,
      "Character actions must be saved in animationData",
    );
    assert.strictEqual(animData.characterActions[1].pose, "walk");

    // 4. Delete middle scene (scene2) and verify contiguous re-indexing
    await deleteScene(scene2.sceneId);

    const reindexedScene3 = await getSceneById(scene3.sceneId);
    assert.ok(reindexedScene3, "Scene 3 must still exist");
    assert.strictEqual(
      reindexedScene3.order,
      2,
      "Scene 3 order must be contiguous position 2",
    );
    assert.strictEqual(
      reindexedScene3.number,
      2,
      "Scene 3 number must be contiguous position 2",
    );
    assert.strictEqual(
      reindexedScene3.startMs,
      5000,
      "Scene 3 startMs must shift contiguously to 5000ms",
    );
    assert.strictEqual(
      reindexedScene3.endMs,
      10000,
      "Scene 3 endMs must be 10000ms",
    );
  } finally {
    await deleteStory(story.storyId);
  }
});
