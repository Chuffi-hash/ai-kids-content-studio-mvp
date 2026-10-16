import { test } from "node:test";
import assert from "node:assert";
import {
  VectorAnimationEngine,
  evaluatePose,
  VectorSceneData,
  CharacterInstance,
  AnimationClip,
} from "../src/services/animation/vector-animation.engine.js";
import { getVectorRig } from "../src/services/animation/templates/default-characters.js";
// import { databaseService } from '../src/services/database/database.service.js';

test("Vector Animation - Rig Templates", () => {
  const pip = getVectorRig("pip_the_bear");
  assert.strictEqual(pip.id, "char-rig-pip-bear");
  assert.strictEqual(pip.species, "Bear");
  assert.ok(pip.parts.torso);
  assert.ok(pip.parts.head);
  assert.ok(pip.parts.leftArm);
  assert.ok(pip.parts.rightArm);
  assert.ok(pip.parts.leftLeg);
  assert.ok(pip.parts.rightLeg);

  const sammy = getVectorRig("sammy_the_kid");
  assert.strictEqual(sammy.id, "char-rig-sammy-kid");
  assert.strictEqual(sammy.species, "Human");
  assert.ok(sammy.parts.torso);
  assert.ok(sammy.parts.head);
});

test("Vector Animation - Kinematics: In-Place Walking", () => {
  const instance: CharacterInstance = {
    instanceId: "char-1",
    characterId: "pip_the_bear",
    x: 640,
    y: 450,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    zIndex: 1,
  };

  const clips: AnimationClip[] = [
    {
      clipId: "clip-1",
      instanceId: "char-1",
      action: "walk",
      startMs: 0,
      durationMs: 4000,
      loop: true,
      motionMode: "in_place",
    },
  ];

  const poseAt0 = evaluatePose(instance, clips, 0);
  assert.strictEqual(poseAt0.x, 640);
  assert.strictEqual(poseAt0.y, 450);
  assert.strictEqual(poseAt0.activeAction, "walk");

  // As time progresses, legs and arms alternate sinusoidally while X stays 640
  const poseAt500 = evaluatePose(instance, clips, 500);
  assert.strictEqual(poseAt500.x, 640);
  assert.ok(
    Math.abs(poseAt500.leftLegAngle) > 0 ||
      Math.abs(poseAt500.rightLegAngle) > 0,
  );
  assert.ok(poseAt500.torsoBobY <= 0); // Bobs down as feet strike
});

test("Vector Animation - Kinematics: Motion Path Walking with Auto-Flip", () => {
  const instance: CharacterInstance = {
    instanceId: "char-2",
    characterId: "sammy_the_kid",
    x: 200,
    y: 450,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    zIndex: 1,
  };

  const clips: AnimationClip[] = [
    {
      clipId: "clip-2",
      instanceId: "char-2",
      action: "walk",
      startMs: 0,
      durationMs: 2000,
      loop: false,
      motionMode: "motion_path",
      motionPath: {
        startX: 200,
        startY: 450,
        endX: 800,
        endY: 450,
        easing: "linear",
      },
    },
  ];

  const startPose = evaluatePose(instance, clips, 0);
  assert.strictEqual(startPose.x, 200);
  assert.strictEqual(startPose.flipX, false); // Walking rightwards

  const midPose = evaluatePose(instance, clips, 1000);
  assert.strictEqual(midPose.x, 500); // 50% between 200 and 800

  const endPose = evaluatePose(instance, clips, 2000);
  assert.strictEqual(endPose.x, 800);

  // Test reverse walk (walking leftwards)
  const leftClips: AnimationClip[] = [
    {
      clipId: "clip-3",
      instanceId: "char-2",
      action: "walk",
      startMs: 0,
      durationMs: 2000,
      loop: false,
      motionMode: "motion_path",
      motionPath: {
        startX: 900,
        startY: 450,
        endX: 100,
        endY: 450,
        easing: "linear",
      },
    },
  ];

  const revPose = evaluatePose(instance, leftClips, 500);
  assert.strictEqual(revPose.flipX, true); // Auto-flipped facing left
});

test("Vector Animation - Completed motion path holds its endpoint for later clips", () => {
  const instance: CharacterInstance = {
    instanceId: "char-path-hold",
    characterId: "pip_the_bear",
    x: 200,
    y: 450,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    zIndex: 1,
  };

  const clips: AnimationClip[] = [
    {
      clipId: "clip-path-hold",
      instanceId: instance.instanceId,
      action: "walk",
      startMs: 0,
      durationMs: 2000,
      loop: false,
      motionMode: "motion_path",
      motionPath: {
        startX: 200,
        startY: 450,
        endX: 800,
        endY: 380,
        easing: "linear",
      },
    },
    {
      clipId: "clip-wave-after-walk",
      instanceId: instance.instanceId,
      action: "wave",
      startMs: 2500,
      durationMs: 1000,
      loop: true,
    },
  ];

  const afterWalk = evaluatePose(instance, clips, 2250);
  assert.strictEqual(afterWalk.x, 800);
  assert.strictEqual(afterWalk.y, 380);

  const duringWave = evaluatePose(instance, clips, 3000);
  assert.strictEqual(duringWave.activeAction, "wave");
  assert.strictEqual(duringWave.x, 800);
  assert.strictEqual(duringWave.y, 380);
});

test("Vector Animation - Kinematics: Waving and Jumping", () => {
  const instance: CharacterInstance = {
    instanceId: "char-3",
    characterId: "pip_the_bear",
    x: 640,
    y: 450,
    scale: 1.0,
    rotation: 0,
    flipX: false,
    zIndex: 1,
  };

  // Wave
  const waveClip: AnimationClip = {
    clipId: "clip-wave",
    instanceId: "char-3",
    action: "wave",
    startMs: 0,
    durationMs: 2000,
    loop: true,
  };
  const wavePose = evaluatePose(instance, [waveClip], 250);
  assert.strictEqual(wavePose.activeAction, "wave");
  assert.strictEqual(wavePose.rightArmAngle, -135); // Arm raised up
  assert.ok(Math.abs(wavePose.rightForearmAngle) > 0);

  // Jump
  const jumpClip: AnimationClip = {
    clipId: "clip-jump",
    instanceId: "char-3",
    action: "jump",
    startMs: 0,
    durationMs: 1000,
    loop: false,
  };
  const apexPose = evaluatePose(instance, [jumpClip], 500); // Apex at midpoint
  assert.strictEqual(apexPose.activeAction, "jump");
  assert.ok(apexPose.y < 450, "Character should be higher at jump apex");
  assert.strictEqual(apexPose.y, 450 - 110); // 110px peak
});

test("Vector Animation - Headless Resvg Rasterization to PNG Buffer", () => {
  const engine = new VectorAnimationEngine();
  const animData: VectorSceneData = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    characterInstances: [
      {
        instanceId: "test-pip",
        characterId: "pip_the_bear",
        x: 640,
        y: 480,
        scale: 1.0,
        rotation: 0,
        flipX: false,
        zIndex: 1,
      },
    ],
    animationClips: [
      {
        clipId: "test-walk",
        instanceId: "test-pip",
        action: "walk",
        startMs: 0,
        durationMs: 3000,
        loop: true,
        motionMode: "in_place",
      },
    ],
  };

  const svgXml = engine.generateSvgFrame({
    animationData: animData,
    timestampSec: 0.5,
  });

  assert.ok(svgXml.includes("<svg"));
  assert.ok(svgXml.includes("char-test-pip"));
  assert.ok(svgXml.includes("</svg>"));

  // Test PNG rasterization
  const pngBuffer = engine.rasterizeSvgToPng(svgXml, 1280);
  assert.ok(pngBuffer.length > 500);

  // Validate PNG signature: 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
  assert.strictEqual(pngBuffer[0], 0x89);
  assert.strictEqual(pngBuffer[1], 0x50); // P
  assert.strictEqual(pngBuffer[2], 0x4e); // N
  assert.strictEqual(pngBuffer[3], 0x47); // G
});
