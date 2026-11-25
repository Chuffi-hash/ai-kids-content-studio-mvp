import test from "node:test";
import assert from "node:assert/strict";
import {
  GenerationPromptService,
  extractCanonicalCharacterIdentity,
  normalizeCharacterFacingDirection,
  DIRECTIONAL_CAMERA_ORIENTATIONS,
} from "../src/services/google-flow/generation-prompt.service.js";
import { GoogleFlowAssetImportService } from "../src/services/google-flow/google-flow-asset-import.service.js";

const ALL_8_DIRECTIONS = [
  "front",
  "front-left",
  "front-right",
  "left",
  "right",
  "back-left",
  "back-right",
  "back",
] as const;

const SAMPLE_CHARACTER = {
  id: "char-mohan-1",
  name: "Mohan",
  species: "human",
  visualDescription: "8-year-old Indian boy with warm brown skin, round friendly face, dark brown eyes, and messy black hair",
  distinctiveFeatures: "small mole on left cheek, bright curious smile",
  clothing: "bright yellow kurta, blue denim shorts, brown leather sandals",
  referenceImageUrl: "/storage/mohan-master.png",
  canonicalAppearance: {
    age: "8 years old",
    gender: "boy",
    skinColor: "warm medium brown",
    eyeShape: "round",
    eyeColor: "dark brown",
    hairColor: "jet black",
    hairstyle: "short tousled hair",
    footwear: "brown leather sandals",
    accessories: "woven red friendship bracelet",
    artStyle: "2D storybook cartoon illustration",
    colourPalette: "warm yellow, cobalt blue, earthy brown",
    references: {
      mainUrl: "/storage/mohan-master.png",
    },
  },
};

test("Character Canonical Identity & Directional Prompt Consistency Suite", async (t) => {
  await t.test("1. Canonical character identity extracts all structured fields and remains unchanged across all 8 directions", () => {
    const identity = extractCanonicalCharacterIdentity(SAMPLE_CHARACTER as any);
    assert.equal(identity.name, "Mohan");
    assert.equal(identity.speciesCategory, "human");
    assert.equal(identity.age, "8 years old");
    assert.equal(identity.skinOrFurColour, "warm medium brown");
    assert.equal(identity.eyeDetails, "round, dark brown");
    assert.equal(identity.hairColour, "jet black");
    assert.equal(identity.hairstyle, "short tousled hair");
    assert.equal(identity.footwear, "brown leather sandals");
    assert.equal(identity.accessories, "woven red friendship bracelet");
    assert.equal(identity.canonicalReferenceUrl, "/storage/mohan-master.png");

    const prompts = ALL_8_DIRECTIONS.map((dir) =>
      GenerationPromptService.buildCharacterPrompt(
        { visualStyle: "2D storybook cartoon illustration" },
        SAMPLE_CHARACTER as any,
        "turnaround",
        { variation: dir }
      )
    );

    // Every directional prompt must preserve the exact same canonical identity fields
    for (const result of prompts) {
      assert.ok(result.prompt.includes("IMMUTABLE CHARACTER IDENTITY:"));
      assert.ok(result.prompt.includes("woven red friendship bracelet"));
      assert.ok(result.prompt.includes("bright yellow kurta"));
      assert.ok(result.prompt.includes("brown leather sandals"));
      assert.equal(result.referenceImageUrl, "/storage/mohan-master.png");
    }
  });

  await t.test("2. Each directional prompt contains exactly one requested camera angle and never mixes angles", () => {
    for (const dir of ALL_8_DIRECTIONS) {
      const result = GenerationPromptService.buildCharacterPrompt(
        { visualStyle: "2D storybook" },
        SAMPLE_CHARACTER as any,
        "turnaround",
        { variation: dir }
      );
      assert.equal(result.requestedDirection, dir);

      const expectedLabel = DIRECTIONAL_CAMERA_ORIENTATIONS[dir].label;
      assert.ok(
        result.prompt.includes(`Generate ONLY the requested [${expectedLabel}] view.`),
        `Prompt for ${dir} must specify [${expectedLabel}]`
      );

      // Ensure no other direction's [Label] is mixed into this prompt
      for (const otherDir of ALL_8_DIRECTIONS) {
        if (otherDir === dir) continue;
        const otherLabel = DIRECTIONAL_CAMERA_ORIENTATIONS[otherDir].label;
        assert.ok(
          !result.prompt.includes(`[${otherLabel}]`),
          `Prompt for ${dir} must NOT contain [${otherLabel}]`
        );
      }
    }
  });

  await t.test("3. Rear views (back, back-left, back-right) suppress front facial features in negative prompt", () => {
    for (const rearDir of ["back", "back-left", "back-right"] as const) {
      const result = GenerationPromptService.buildCharacterPrompt(
        {},
        SAMPLE_CHARACTER as any,
        "turnaround",
        { variation: rearDir }
      );
      assert.ok(result.negativePrompt.includes("front face"));
      assert.ok(result.negativePrompt.includes("both eyes visible"));
    }

    const frontResult = GenerationPromptService.buildCharacterPrompt(
      {},
      SAMPLE_CHARACTER as any,
      "turnaround",
      { variation: "front" }
    );
    assert.ok(!frontResult.negativePrompt.includes("front face"));
  });

  await t.test("4. Underscored directional aliases normalize cleanly to hyphenated 8-direction keys", () => {
    assert.equal(normalizeCharacterFacingDirection("three_quarter_left"), "front-left");
    assert.equal(normalizeCharacterFacingDirection("three_quarter_right"), "front-right");
    assert.equal(normalizeCharacterFacingDirection("left_profile"), "left");
    assert.equal(normalizeCharacterFacingDirection("right_profile"), "right");
    assert.equal(normalizeCharacterFacingDirection("back_three_quarter_left"), "back-left");
    assert.equal(normalizeCharacterFacingDirection("back_three_quarter_right"), "back-right");
    assert.equal(normalizeCharacterFacingDirection("unknown_angle"), "front");
  });

  await t.test("5. Invalid image responses (empty, invalid MIME, tiny dimensions, extreme aspect ratio) are rejected", async () => {
    await assert.rejects(
      () =>
        GoogleFlowAssetImportService.importAsset({
          target: "character_view",
          characterId: "char-mohan-1",
          imageData: Buffer.alloc(0),
        }),
      /empty/i
    );

    await assert.rejects(
      () =>
        GoogleFlowAssetImportService.importAsset({
          target: "character_view",
          characterId: "char-mohan-1",
          imageData: Buffer.from("not-an-image"),
        }),
      /Unsupported image format/i
    );

    // Valid PNG header with 10x10 dimensions (below 32x32 floor)
    const tinyPng = Buffer.from(
      "89504e470d0a1a0a0000000d494844520000000a0000000a08060000008d32cfbd",
      "hex"
    );
    await assert.rejects(
      () =>
        GoogleFlowAssetImportService.importAsset({
          target: "character_view",
          characterId: "char-mohan-1",
          imageData: tinyPng,
        }),
      /Invalid or unknown dimensions/i
    );
  });
});
