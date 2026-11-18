import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAllowedFlowUrl,
  buildCharacterViewPrompt,
  CHARACTER_VIEW_LABELS
} from "../src/prompts.mjs";
import { detectImageType, safeFilename } from "../src/image-validation.mjs";

test("allows the official Flow home URL", () => {
  assert.equal(assertAllowedFlowUrl("https://labs.google/fx/tools/flow"), "https://labs.google/fx/tools/flow");
});

test("allows a Flow project URL on the supported Flow hosts", () => {
  assert.equal(
    assertAllowedFlowUrl("https://flow.google.com/project/example"),
    "https://flow.google.com/project/example"
  );
});

test("rejects non-Flow and non-HTTPS project URLs", () => {
  assert.throws(() => assertAllowedFlowUrl("http://labs.google/fx/tools/flow"));
  assert.throws(() => assertAllowedFlowUrl("https://example.com/"));
});

test("builds a view-specific prompt that protects character identity", () => {
  const prompt = buildCharacterViewPrompt({
    characterName: "Sammy",
    view: "left",
    additionalInstructions: "Keep the scarf visible."
  });

  assert.match(prompt, /@Sammy/);
  assert.match(prompt, /left side profile/);
  assert.match(prompt, /genuine authored view/);
  assert.match(prompt, /Keep the scarf visible/);
});

test("rejects unsupported character views", () => {
  assert.throws(() => buildCharacterViewPrompt({ characterName: "Sammy", view: "top" }));
  assert.ok(CHARACTER_VIEW_LABELS.front);
});

test("recognizes PNG, JPEG and WebP by file signature", () => {
  assert.equal(
    detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mimeType,
    "image/png"
  );
  assert.equal(
    detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00])).mimeType,
    "image/jpeg"
  );
  assert.equal(
    detectImageType(Buffer.from("RIFF0000WEBP")).mimeType,
    "image/webp"
  );
});

test("sanitizes downloaded filenames", () => {
  assert.equal(safeFilename("../../my:image.png"), "my-image.png");
});
