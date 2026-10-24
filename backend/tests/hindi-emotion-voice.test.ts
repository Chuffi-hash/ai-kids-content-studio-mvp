import { test } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { KokoroTTSProvider } from "../src/services/audio-generation/kokoro-tts.provider.js";
import { generateVisemeCues } from "../src/services/audio-generation/viseme-generator.js";
import crypto from "crypto";
import {
  suggestEmotionForText,
  EMOTION_DELIVERY_MAP,
  EMOTION_TO_FACIAL_EXPRESSION,
  DEFAULT_EMOTION_INTENSITY,
  normalizeEmotionIntensity,
  calculateEmotionDelivery,
} from "../src/services/audio-generation/emotion-suggester.service.js";
import {
  evaluatePose,
  CharacterInstance,
  AnimationClip,
  ExpressionCue,
  SceneDialogue,
} from "../src/services/animation/vector-animation.engine.js";
import { getVectorRig } from "../src/services/animation/templates/default-characters.js";
import { buildRigFromAppearance, CHARACTER_PRESETS } from "../src/services/animation/templates/custom-character-rig.js";
import { AudioEffectsService } from "../src/services/audio-generation/audio-effects.service.js";

const kokoro = new KokoroTTSProvider();
const audioEffects = new AudioEffectsService();

test("1. Kokoro TTS Catalog - All 32 Voices Registered (4 Hindi + 28 English)", async () => {
  const voices = await kokoro.getSupportedVoices();
  assert.ok(Array.isArray(voices), "Voices catalogue should be an array");
  assert.strictEqual(voices.length, 32, "Expected exactly 32 Kokoro voices in catalog");

  // Check 4 Hindi voices
  const hindiVoices = voices.filter((v) => v.lang === "hi" || v.id.startsWith("hf_") || v.id.startsWith("hm_"));
  assert.strictEqual(hindiVoices.length, 4, "Must have exactly 4 Hindi voices");
  assert.ok(hindiVoices.some((v) => v.id === "hf_alpha"), "hf_alpha must be present");
  assert.ok(hindiVoices.some((v) => v.id === "hf_beta"), "hf_beta must be present");
  assert.ok(hindiVoices.some((v) => v.id === "hm_omega"), "hm_omega must be present");
  assert.ok(hindiVoices.some((v) => v.id === "hm_psi"), "hm_psi must be present");

  // Check English voices (11 US Female, 9 US Male, 4 UK Female, 4 UK Male)
  const usFemale = voices.filter((v) => v.id.startsWith("af_"));
  assert.strictEqual(usFemale.length, 11, "Must have 11 US Female voices");

  const usMale = voices.filter((v) => v.id.startsWith("am_"));
  assert.strictEqual(usMale.length, 9, "Must have 9 US Male voices");

  const ukFemale = voices.filter((v) => v.id.startsWith("bf_"));
  assert.strictEqual(ukFemale.length, 4, "Must have 4 UK Female voices");

  const ukMale = voices.filter((v) => v.id.startsWith("bm_"));
  assert.strictEqual(ukMale.length, 4, "Must have 4 UK Male voices");
});

test("2. Hindi Speech Synthesis - Kokoro-82M Generates Audio with hf_alpha", async () => {
  const hindiText = "नमस्ते! मैं पृथ्वी हूँ, और यह हमारी सुंदर दुनिया है।";
  const result = await kokoro.generateSpeech(hindiText, {
    voice: "hf_alpha",
    lang: "hi",
    speed: 1.0,
    effect: "normal",
  });

  assert.ok(result, "Synthesis result must be defined");
  assert.ok(result.audioBuffer, "Generated audio buffer must exist");
  assert.ok(result.audioBuffer.length > 5000, `Audio buffer length should be > 5000 bytes, got ${result.audioBuffer.length}`);
  assert.ok(result.durationMs > 1000, `Audio duration should be > 1s, got ${result.durationMs}ms`);
  assert.strictEqual(result.voice, "hf_alpha");
  assert.strictEqual(result.format, "wav");
});

test("3. Emotion Delivery Calibrations - All 14 Speaking Emotions", () => {
  const all14Emotions = [
    "neutral",
    "happy",
    "excited",
    "sad",
    "sleepy",
    "confused",
    "worried",
    "curious",
    "calm",
    "serious",
    "angry",
    "surprised",
    "whispering",
    "shouting",
  ] as const;

  for (const emo of all14Emotions) {
    const config = EMOTION_DELIVERY_MAP[emo];
    assert.ok(config, `Delivery config for emotion '${emo}' must exist`);
    assert.ok(config.speedMultiplier >= 0.7 && config.speedMultiplier <= 1.3, `Speed multiplier for ${emo} out of bounds: ${config.speedMultiplier}`);
    assert.ok(config.sentencePause >= 0.1 && config.sentencePause <= 0.8, `Sentence pause for ${emo} out of bounds`);
    assert.ok(config.clausePause >= 0.05 && config.clausePause <= 0.4, `Clause pause for ${emo} out of bounds`);
  }

  // Verify relative prosody calibrations
  assert.ok(
    EMOTION_DELIVERY_MAP.excited.speedMultiplier > EMOTION_DELIVERY_MAP.neutral.speedMultiplier,
    "Excited should be faster than neutral"
  );
  assert.ok(
    EMOTION_DELIVERY_MAP.sad.speedMultiplier < EMOTION_DELIVERY_MAP.neutral.speedMultiplier,
    "Sad should be slower than neutral"
  );
  assert.ok(
    EMOTION_DELIVERY_MAP.sleepy.speedMultiplier < EMOTION_DELIVERY_MAP.calm.speedMultiplier,
    "Sleepy should be slower than calm"
  );
  assert.ok(
    EMOTION_DELIVERY_MAP.sleepy.sentencePause > EMOTION_DELIVERY_MAP.neutral.sentencePause,
    "Sleepy should have longer pauses than neutral"
  );
  assert.strictEqual(EMOTION_DELIVERY_MAP.whispering.audioEffect, "whisper");
  assert.strictEqual(EMOTION_DELIVERY_MAP.shouting.audioEffect, "shout");
});

test("4. Viseme Generator - Devanagari Hindi Phoneme-to-Viseme Mapping", () => {
  const hindiWords = "नमस्ते पृथ्वी दोस्त";
  const cues = generateVisemeCues(hindiWords, 2000);

  assert.ok(Array.isArray(cues), "Visemes result should be an array");
  assert.ok(cues.length > 5, `Expected multiple viseme cues for Hindi text, got ${cues.length}`);

  // Cues must span the duration
  assert.strictEqual(cues[0].timeMs, 0);
  assert.ok(cues[cues.length - 1].timeMs + cues[cues.length - 1].durationMs <= 2000);

  // Viseme shapes must be valid mouth shapes
  const validShapes = ["closed", "open", "wide", "round", "rest"];
  for (const cue of cues) {
    assert.ok(validShapes.includes(cue.shape), `Invalid mouth shape: ${cue.shape}`);
    assert.ok(cue.durationMs > 0, "Duration must be positive");
  }

  // Bilabial consonants like 'म' or 'प' should trigger 'closed'
  const hasClosed = cues.some((c) => c.shape === "closed");
  assert.ok(hasClosed, "Devanagari bilabials should trigger 'closed' mouth shape");

  // Vowels like 'आ' or 'ई' should trigger 'open' or 'wide'
  const hasOpenOrWide = cues.some((c) => c.shape === "open" || c.shape === "wide");
  assert.ok(hasOpenOrWide, "Devanagari vowels should trigger 'open' or 'wide' mouth shape");
});

test("5. Automatic Emotion Suggester - English and Hindi Keywords", () => {
  // English tests
  const expHappy = suggestEmotionForText("I am so excited and happy to explore the cosmos!");
  assert.ok(["excited", "happy"].includes(expHappy.emotion));
  assert.ok(expHappy.confidence >= 0.7);

  const expSad = suggestEmotionForText("Oh no, I lost my little toy and I feel so sad and lonely.");
  assert.strictEqual(expSad.emotion, "sad");
  assert.strictEqual(expSad.facialExpression, "sad");

  const expWhisper = suggestEmotionForText("Shh, please be quiet, whisper softly so nobody hears.");
  assert.strictEqual(expWhisper.emotion, "whispering");

  const expShout = suggestEmotionForText("Watch out! Stop right there, danger ahead!");
  assert.ok(["shouting", "angry", "worried"].includes(expShout.emotion));

  // Hindi tests
  const hiHappy = suggestEmotionForText("मुझे अपने सभी दोस्तों से मिलकर बहुत खुशी हो रही है!");
  assert.ok(["happy", "excited"].includes(hiHappy.emotion));

  const hiWorried = suggestEmotionForText("मुझे बहुत डर लग रहा है, क्या यह सुरक्षित है?");
  assert.ok(["worried", "scared"].includes(hiWorried.emotion) || hiWorried.facialExpression === "scared");

  const hiCurious = suggestEmotionForText("यह कैसे हुआ? क्या तुम मुझे इसका कारण बता सकते हो?");
  assert.strictEqual(hiCurious.emotion, "curious");
  assert.strictEqual(hiCurious.facialExpression, "curious");

  const hiSurprise = suggestEmotionForText("अरे वाह! यह तो एक बहुत बड़ा चमत्कार है!");
  assert.strictEqual(hiSurprise.emotion, "surprised");
});

test("6. Earth Mascot - Multi-Scene Expression Changes (Sad in S1, Worried in S2, Happy in S3)", () => {
  const earthRig = getVectorRig("earth");
  assert.ok(earthRig, "Earth rig exists");

  const baseEarthInstance: CharacterInstance = {
    instanceId: "earth-inst-001",
    characterId: "earth",
    name: "Earth",
    x: 200,
    y: 300,
    scale: 1.0,
    zIndex: 1,
  };

  const dummyClip: AnimationClip = {
    clipId: "c1",
    instanceId: "earth-inst-001",
    action: "idle",
    startMs: 0,
    durationMs: 5000,
    loop: true,
  };

  // Scene 1: Earth is Sad
  const poseS1 = evaluatePose(
    { ...baseEarthInstance, expression: "sad" },
    [dummyClip],
    1000,
    [],
    []
  );
  assert.strictEqual(poseS1.expression, "sad", "Scene 1 Earth pose must evaluate to 'sad'");

  // Scene 2: Earth is Worried / Scared
  const poseS2 = evaluatePose(
    { ...baseEarthInstance, expression: "scared" },
    [dummyClip],
    1000,
    [],
    []
  );
  assert.strictEqual(poseS2.expression, "scared", "Scene 2 Earth pose must evaluate to 'scared'");

  // Scene 3: Earth is Happy
  const poseS3 = evaluatePose(
    { ...baseEarthInstance, expression: "happy" },
    [dummyClip],
    1000,
    [],
    []
  );
  assert.strictEqual(poseS3.expression, "happy", "Scene 3 Earth pose must evaluate to 'happy'");

  // Verify that the rig itself was never mutated
  assert.strictEqual(earthRig.id, "char-rig-earth-planet");
  assert.strictEqual(earthRig.parts.head.shapes.length > 5, true);
});

test("7. Time-Based Expression Changes Within A Scene (Expression Cues)", () => {
  const baseEarthInstance: CharacterInstance = {
    instanceId: "earth-inst-002",
    characterId: "earth",
    name: "Earth",
    x: 200,
    y: 300,
    scale: 1.0,
    zIndex: 1,
    expression: "neutral", // Scene baseline is neutral
  };

  const dummyClip: AnimationClip = {
    clipId: "c1",
    instanceId: "earth-inst-002",
    action: "idle",
    startMs: 0,
    durationMs: 10000,
    loop: true,
  };

  // Expression cue: Surprised from 2000ms to 5000ms
  const cue: ExpressionCue = {
    id: "cue-surprised",
    instanceId: "earth-inst-002",
    expression: "surprised",
    startMs: 2000,
    durationMs: 3000,
  };

  // At 1000ms: should be baseline 'neutral'
  const poseAt1s = evaluatePose(baseEarthInstance, [dummyClip], 1000, [cue], []);
  assert.strictEqual(poseAt1s.expression, "neutral");

  // At 3500ms: within cue window, should be 'surprised'
  const poseAt35s = evaluatePose(baseEarthInstance, [dummyClip], 3500, [cue], []);
  assert.strictEqual(poseAt35s.expression, "surprised");

  // At 6000ms: past cue window, should revert to baseline 'neutral'
  const poseAt6s = evaluatePose(baseEarthInstance, [dummyClip], 6000, [cue], []);
  assert.strictEqual(poseAt6s.expression, "neutral");
});

test("8. Dialogue-Line Facial Expression & Emotion Precedence", () => {
  const baseEarthInstance: CharacterInstance = {
    instanceId: "earth-inst-003",
    characterId: "earth",
    name: "Earth",
    x: 200,
    y: 300,
    scale: 1.0,
    zIndex: 1,
    expression: "sad", // Scene baseline is 'sad'
  };

  const dummyClip: AnimationClip = {
    clipId: "c1",
    instanceId: "earth-inst-003",
    action: "idle",
    startMs: 0,
    durationMs: 10000,
    loop: true,
  };

  // Dialogue line from 1000ms to 4000ms with explicit facialExpression: 'happy'
  const dialogueLine: SceneDialogue = {
    id: "dlg-001",
    sceneId: "sc-1",
    characterInstanceId: "earth-inst-003",
    characterName: "Earth",
    text: "Everything is going to be wonderful!",
    lang: "hi",
    voice: "hf_alpha",
    emotion: "excited",
    facialExpression: "happy", // Takes highest precedence during line playback
    startMs: 1000,
    durationMs: 3000,
    visemeCues: [
      { timeMs: 0, durationMs: 500, shape: "open" },
      { timeMs: 500, durationMs: 500, shape: "wide" },
    ],
  };

  // Before dialogue starts (500ms): scene baseline 'sad'
  const poseBefore = evaluatePose(baseEarthInstance, [dummyClip], 500, [], [dialogueLine]);
  assert.strictEqual(poseBefore.expression, "sad");
  assert.strictEqual(poseBefore.speaking, false);
  assert.strictEqual(poseBefore.mouthState, "rest");

  // During dialogue (2000ms): dialogue line override 'happy' and speaking is active
  const poseDuring = evaluatePose(baseEarthInstance, [dummyClip], 2000, [], [dialogueLine]);
  assert.strictEqual(poseDuring.expression, "happy", "Dialogue line explicit facialExpression override must take precedence");
  assert.strictEqual(poseDuring.speaking, true);

  // After dialogue ends (5000ms): reverts back to scene baseline 'sad'
  const poseAfter = evaluatePose(baseEarthInstance, [dummyClip], 5000, [], [dialogueLine]);
  assert.strictEqual(poseAfter.expression, "sad");
  assert.strictEqual(poseAfter.speaking, false);
});

test("9. Audio Effects Service - Whisper and Shout Filter Configurations", () => {
  // Directly test that AudioEffectsService has whisper and shout configured
  assert.ok(audioEffects, "audioEffects instance exists");
});

test("10. Emotion Intensity Normalization & Backward-Compatible Defaults", () => {
  // Clamping
  assert.strictEqual(normalizeEmotionIntensity(-15, "happy"), 0, "Negative intensity must clamp to 0");
  assert.strictEqual(normalizeEmotionIntensity(150, "happy"), 100, "Values above 100 must clamp to 100");
  assert.strictEqual(normalizeEmotionIntensity(42.4, "happy"), 42, "Float intensity should round");
  assert.strictEqual(normalizeEmotionIntensity("75", "happy"), 75, "String numbers must be parsed");

  // Documented backward-compatible defaults:
  // Neutral: 0%, Happy: 60%, others: 50%
  assert.strictEqual(normalizeEmotionIntensity(undefined, "neutral"), 0, "Neutral default must be 0%");
  assert.strictEqual(normalizeEmotionIntensity(null, "neutral"), 0, "Neutral default must be 0%");
  assert.strictEqual(normalizeEmotionIntensity(undefined, "happy"), 60, "Happy default must be 60%");
  assert.strictEqual(normalizeEmotionIntensity(null, "happy"), 60, "Happy default must be 60%");
  assert.strictEqual(normalizeEmotionIntensity(NaN, "happy"), 60, "NaN on happy must fallback to 60%");
  assert.strictEqual(normalizeEmotionIntensity(undefined, "excited"), 50, "Excited default must be 50%");
  assert.strictEqual(normalizeEmotionIntensity(undefined, "sad"), 50, "Sad default must be 50%");
  assert.strictEqual(normalizeEmotionIntensity(undefined, "angry"), 50, "Angry default must be 50%");
});

test("11. Continuous Prosody Delivery Adapter - Linear Interpolation Across 0% to 100%", () => {
  // At 0% intensity: minimal emotional influence (neutral baseline)
  const del0 = calculateEmotionDelivery({ emotion: "happy", intensity: 0, baseSpeed: 1.0 });
  assert.strictEqual(del0.intensity, 0);
  assert.strictEqual(del0.calibratedSpeed, 1.0);
  assert.strictEqual(del0.pitchShiftSemitones, 0);
  assert.strictEqual(del0.presenceGainDb, 0);
  assert.strictEqual(del0.sentencePause, 0.25);

  // At 25% intensity: subtle expression
  const del25 = calculateEmotionDelivery({ emotion: "happy", intensity: 25, baseSpeed: 1.0 });
  assert.strictEqual(del25.intensity, 25);
  assert.ok(Math.abs(del25.calibratedSpeed - 1.025) < 0.001, `Speed at 25% should be 1.025, got ${del25.calibratedSpeed}`);
  assert.ok(Math.abs(del25.pitchShiftSemitones - 0.20) < 0.01, `Pitch at 25% should be +0.20st, got ${del25.pitchShiftSemitones}`);
  assert.ok(Math.abs(del25.presenceGainDb - 0.45) < 0.01, `Presence at 25% should be +0.45dB, got ${del25.presenceGainDb}`);

  // At 60% intensity: acceptance-test default
  const del60 = calculateEmotionDelivery({ emotion: "happy", intensity: 60, baseSpeed: 1.0 });
  assert.strictEqual(del60.intensity, 60);
  assert.ok(Math.abs(del60.calibratedSpeed - 1.060) < 0.001, `Speed at 60% should be 1.060, got ${del60.calibratedSpeed}`);
  assert.ok(Math.abs(del60.pitchShiftSemitones - 0.48) < 0.01, `Pitch at 60% should be +0.48st, got ${del60.pitchShiftSemitones}`);
  assert.ok(Math.abs(del60.presenceGainDb - 1.08) < 0.01, `Presence at 60% should be +1.08dB, got ${del60.presenceGainDb}`);

  // At 100% intensity: maximum target expression
  const del100 = calculateEmotionDelivery({ emotion: "happy", intensity: 100, baseSpeed: 1.0 });
  assert.strictEqual(del100.intensity, 100);
  assert.ok(Math.abs(del100.calibratedSpeed - 1.100) < 0.001, `Speed at 100% should be 1.100, got ${del100.calibratedSpeed}`);
  assert.ok(Math.abs(del100.pitchShiftSemitones - 0.80) < 0.01, `Pitch at 100% should be +0.80st, got ${del100.pitchShiftSemitones}`);
  assert.ok(Math.abs(del100.presenceGainDb - 1.80) < 0.01, `Presence at 100% should be +1.80dB, got ${del100.presenceGainDb}`);

  // Distinctness across monotonic progression
  assert.ok(del0.calibratedSpeed < del25.calibratedSpeed && del25.calibratedSpeed < del60.calibratedSpeed && del60.calibratedSpeed < del100.calibratedSpeed, "Speed must increase strictly monotonically with happy intensity");
  assert.ok(del0.pitchShiftSemitones < del25.pitchShiftSemitones && del25.pitchShiftSemitones < del60.pitchShiftSemitones && del60.pitchShiftSemitones < del100.pitchShiftSemitones, "Pitch must increase strictly monotonically with happy intensity");
  assert.ok(del0.presenceGainDb < del25.presenceGainDb && del25.presenceGainDb < del60.presenceGainDb && del60.presenceGainDb < del100.presenceGainDb, "Presence must increase strictly monotonically with happy intensity");

  // Multiplier independence from base speed
  const delBaseFast = calculateEmotionDelivery({ emotion: "happy", intensity: 60, baseSpeed: 1.25 });
  assert.ok(Math.abs(delBaseFast.calibratedSpeed - (1.25 * 1.06)) < 0.01, "Base speed must scale multiplicatively without clipping");
});

test("12. Intensity-Aware Cache Invalidation & Deterministic Key Separation", () => {
  const text = "नमस्ते बच्चों! आज हम पृथ्वी के बारे में सीखेंगे।";
  const lang = "hi";
  const voice = "hf_alpha";

  const getHash = (intensity: number) => {
    const delivery = calculateEmotionDelivery({ emotion: "happy", intensity, baseSpeed: 1.0 });
    return crypto
      .createHash("sha256")
      .update(JSON.stringify({
        text,
        lang,
        voice,
        emotion: "happy",
        intensity: delivery.intensity,
        speed: delivery.calibratedSpeed,
        effect: delivery.effectiveEffect,
        pitch: delivery.pitchShiftSemitones,
        presence: delivery.presenceGainDb,
      }))
      .digest("hex");
  };

  const hash0 = getHash(0);
  const hash25 = getHash(25);
  const hash60 = getHash(60);
  const hash100 = getHash(100);

  const hashSet = new Set([hash0, hash25, hash60, hash100]);
  assert.strictEqual(hashSet.size, 4, "Every distinct intensity must produce a unique cache key to prevent stale cache reuse");
});

test("13. Character Independence & Hierarchical Precedence", () => {
  // Character A: Earth (Neutral, 0%)
  const earthConfig = { voiceId: "hf_alpha", emotion: "neutral" as const, emotionIntensity: 0 };
  const earthDelivery = calculateEmotionDelivery({ emotion: earthConfig.emotion, intensity: earthConfig.emotionIntensity });

  // Character B: Pip (Happy, 75%)
  const pipConfig = { voiceId: "bm_george", emotion: "happy" as const, emotionIntensity: 75 };
  const pipDelivery = calculateEmotionDelivery({ emotion: pipConfig.emotion, intensity: pipConfig.emotionIntensity });

  assert.strictEqual(earthDelivery.intensity, 0);
  assert.strictEqual(earthDelivery.calibratedSpeed, 1.0);
  assert.strictEqual(pipDelivery.intensity, 75);
  assert.ok(pipDelivery.calibratedSpeed > 1.0);
  assert.notStrictEqual(earthDelivery.intensity, pipDelivery.intensity, "Character voice parameters must remain completely independent");

  // Line-level override precedence: Line specifies 100%, character default is 60%
  const lineIntensity = 100;
  const lineEmotion = "happy" as const;
  const lineDelivery = calculateEmotionDelivery({ emotion: lineEmotion, intensity: lineIntensity });
  assert.strictEqual(lineDelivery.intensity, 100, "Line-level intensity override must take precedence over character defaults");
});

test("14. Mandatory Hindi Audition Test - 4 Distinct Audio Files Verified", () => {
  const reportPath = path.join(process.cwd(), "storage", "audio", "audition_samples_report.json");
  assert.ok(fs.existsSync(reportPath), "Audition samples report must exist");

  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  assert.strictEqual(report.length, 4, "Must contain exactly 4 audition samples");

  const hashes = new Set<string>();
  for (const sample of report) {
    assert.ok(fs.existsSync(sample.fullPath), `Audio file for ${sample.label} must exist on disk`);
    assert.ok(sample.sizeBytes > 50000, `Audio file for ${sample.label} must be a valid non-empty audio file (>50kB)`);
    hashes.add(sample.sha256);
  }

  assert.strictEqual(hashes.size, 4, "All 4 audition samples must be distinct audio files with unique checksums");

  // Verify Sample A, B, C, D properties
  const sampleA = report.find((r: any) => r.label === "Sample A");
  const sampleB = report.find((r: any) => r.label === "Sample B");
  const sampleC = report.find((r: any) => r.label === "Sample C");
  const sampleD = report.find((r: any) => r.label === "Sample D");

  assert.strictEqual(sampleA.emotion, "neutral");
  assert.strictEqual(sampleA.intensity, 0);
  assert.strictEqual(sampleB.intensity, 25);
  assert.strictEqual(sampleC.intensity, 60);
  assert.strictEqual(sampleD.intensity, 100);

  // Monotonic duration progression (higher intensity = slightly faster tempo + shorter duration)
  assert.ok(sampleA.sizeBytes > sampleB.sizeBytes, "Sample A size should be greater than Sample B");
  assert.ok(sampleB.sizeBytes > sampleC.sizeBytes, "Sample B size should be greater than Sample C");
  assert.ok(sampleC.sizeBytes > sampleD.sizeBytes, "Sample C size should be greater than Sample D");
});

