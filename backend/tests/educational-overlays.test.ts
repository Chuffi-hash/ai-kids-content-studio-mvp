import { test } from "node:test";
import assert from "node:assert";
import {
  EducationalOverlay,
  EducationalOverlayType,
  renderOverlaySvg,
  renderAllOverlaysSvg,
} from "../src/services/animation/educational-overlay.renderer.js";
import {
  VectorSceneData,
  VectorAnimationEngine,
} from "../src/services/animation/vector-animation.engine.js";
import { createStory, createScene, deleteStory } from "../src/services/database/database.service.js";
import { randomUUID } from "crypto";

test("Mixed-Media Educational Overlays - 1. Type Definitions & Default Attributes", () => {
  const types: EducationalOverlayType[] = [
    "location_pin",
    "route_line",
    "highlight_ring",
    "arrow_pointer",
    "callout_label",
  ];

  assert.strictEqual(types.length, 5, "Must support 5 educational overlay types");

  const pin: EducationalOverlay = {
    id: "pin-1",
    type: "location_pin",
    title: "Mount Everest",
    label: "Highest Peak on Earth",
    x: 640,
    y: 360,
    startMs: 500,
    durationMs: 4000,
    color: "#ef4444",
    layerPosition: "above_characters",
  };

  assert.strictEqual(pin.type, "location_pin");
  assert.strictEqual(pin.layerPosition, "above_characters");
  assert.strictEqual(pin.x, 640);
  assert.strictEqual(pin.y, 360);
});

test("Mixed-Media Educational Overlays - 2. Location Pin SVG Rendering", () => {
  const pin: EducationalOverlay = {
    id: "pin-himalayas",
    type: "location_pin",
    title: "Himalayas Base Camp",
    label: "Elevation: 5,364m",
    x: 400,
    y: 300,
    startMs: 1000,
    durationMs: 5000,
    color: "#f59e0b",
  };

  // Render before entrance (< 1000ms) -> should be hidden
  const preSvg = renderOverlaySvg(pin, 500);
  assert.strictEqual(preSvg, "", "Overlay should not render before startMs");

  // Render during active time (1500ms)
  const activeSvg = renderOverlaySvg(pin, 1500);
  assert.ok(activeSvg.includes('id="overlay-pin-himalayas"'), "Must contain overlay ID");
  assert.ok(activeSvg.includes("Ground Ripple"), "Must contain ground ripple");
  assert.ok(activeSvg.includes("Teardrop Pin Body"), "Must contain pin marker body");
  assert.ok(activeSvg.includes("Elevation: 5,364m"), "Must render label text");
  assert.ok(activeSvg.includes("#f59e0b"), "Must use specified pin color");

  // Render after duration has elapsed (> 6000ms)
  const postSvg = renderOverlaySvg(pin, 6500);
  assert.strictEqual(postSvg, "", "Overlay should not render after startMs + durationMs");
});

test("Mixed-Media Educational Overlays - 3. Progressive Route Line Drawing Calculation", () => {
  const route: EducationalOverlay = {
    id: "expedition-route",
    type: "route_line",
    title: "Explorer Trek",
    x: 200,
    y: 500,
    targetX: 800,
    targetY: 200,
    startMs: 0,
    durationMs: 6000,
    progressDurationMs: 2000, // Takes 2.0s to draw completely
    color: "#38bdf8",
    strokeWidth: 5,
    layerPosition: "below_characters",
  };

  // At t = 0ms (just started) -> dashoffset should be near total path length
  const svgStart = renderOverlaySvg(route, 0);
  assert.ok(svgStart.includes("stroke-dasharray"), "Route line must use dasharray for progressive drawing");
  assert.ok(svgStart.includes("#38bdf8"), "Must use cyan route color");

  // At t = 1000ms (50% progress)
  const svgMid = renderOverlaySvg(route, 1000);
  assert.ok(svgMid.includes("Active Traveling Tip Glow"), "Active drawing must render a traveling glowing tip beacon");

  // At t = 2500ms (100% progress, fully drawn)
  const svgFull = renderOverlaySvg(route, 2500);
  assert.ok(svgFull.includes('stroke-dashoffset="0"'), "Route line dashoffset must reach 0 when completed");
});

test("Mixed-Media Educational Overlays - 4. Highlight Ring Pulsing Animation", () => {
  const ring: EducationalOverlay = {
    id: "focus-zone",
    type: "highlight_ring",
    title: "Biodiversity Hotspot",
    x: 700,
    y: 350,
    radius: 80,
    startMs: 0,
    durationMs: 5000,
    pulseSpeedMs: 1500,
    color: "#10b981",
  };

  const ringSvg = renderOverlaySvg(ring, 750);
  assert.ok(ringSvg.includes('id="overlay-focus-zone"'), "Highlight ring must render with ID");
  assert.ok(ringSvg.includes("Expanding Radar Wave"), "Highlight ring must render expanding radar wave");
  assert.ok(ringSvg.includes("#10b981"), "Must use emerald green color");
});

test("Mixed-Media Educational Overlays - 5. Directional Arrow Orientation & Bobbing", () => {
  const arrow: EducationalOverlay = {
    id: "pointer-arrow",
    type: "arrow_pointer",
    x: 300,
    y: 400,
    targetX: 600,
    targetY: 200,
    startMs: 0,
    durationMs: 4000,
    color: "#ec4899",
  };

  const arrowSvg = renderOverlaySvg(arrow, 1200);
  assert.ok(arrowSvg.includes('id="overlay-pointer-arrow"'), "Directional arrow must render with ID");
  assert.ok(arrowSvg.includes("Arrow Head"), "Arrow must have arrowhead polygon");
  assert.ok(arrowSvg.includes("<polygon"), "Arrow must render polygon arrowhead");
  assert.ok(arrowSvg.includes("#ec4899"), "Arrow must use pink color");
});

test("Mixed-Media Educational Overlays - 6. Educational Callout Label with Leader Line", () => {
  const callout: EducationalOverlay = {
    id: "fact-badge",
    type: "callout_label",
    title: "Glacial Ice Reservoir",
    label: "Contains 75% of Earth's freshwater",
    x: 500,
    y: 220,
    targetX: 420,
    targetY: 340,
    hasConnectorLine: true,
    startMs: 0,
    durationMs: 5000,
    color: "#67e8f9",
  };

  const calloutSvg = renderOverlaySvg(callout, 1000);
  assert.ok(calloutSvg.includes("Leader Line to Target"), "Callout with hasConnectorLine must render leader line");
  assert.ok(calloutSvg.includes("Glacial Ice Reservoir"), "Callout must render title");
  assert.ok(calloutSvg.includes("Contains 75% of Earth"), "Callout must render factual text");
});

test("Mixed-Media Educational Overlays - 7. Layer Depth Separation (Below vs Above Characters)", () => {
  const overlays: EducationalOverlay[] = [
    {
      id: "under-map-route",
      type: "route_line",
      x: 100,
      y: 500,
      targetX: 900,
      targetY: 500,
      startMs: 0,
      durationMs: 5000,
      layerPosition: "below_characters",
    },
    {
      id: "over-badge",
      type: "callout_label",
      x: 500,
      y: 200,
      label: "Foreground Note",
      startMs: 0,
      durationMs: 5000,
      layerPosition: "above_characters",
    },
  ];

  const belowSvg = renderAllOverlaysSvg(overlays, 1000, "below_characters");
  assert.ok(belowSvg.includes("under-map-route"), "Under-map route must be in below-characters layer");
  assert.ok(!belowSvg.includes("over-badge"), "Foreground note must NOT be in below-characters layer");

  const aboveSvg = renderAllOverlaysSvg(overlays, 1000, "above_characters");
  assert.ok(!aboveSvg.includes("under-map-route"), "Under-map route must NOT be in above-characters layer");
  assert.ok(aboveSvg.includes("over-badge"), "Foreground note must be in above-characters layer");
});

test("Mixed-Media Educational Overlays - 8. Full Scene SVG Integration & Resvg Headless PNG Rasterization", async () => {
  const sceneData: VectorSceneData = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    characterInstances: [
      {
        instanceId: "inst-earth-guide",
        characterId: "earth",
        assetType: "vector_rig",
        name: "Terra",
        x: 300,
        y: 500,
        scale: 1.0,
        rotation: 0,
        flipX: false,
        zIndex: 2,
        expression: "happy",
      },
    ],
    animationClips: [
      {
        clipId: "clip-idle",
        instanceId: "inst-earth-guide",
        action: "idle",
        startMs: 0,
        durationMs: 4000,
        loop: true,
      },
    ],
    overlays: [
      {
        id: "bg-route",
        type: "route_line",
        x: 150,
        y: 550,
        targetX: 850,
        targetY: 350,
        startMs: 0,
        durationMs: 4000,
        layerPosition: "below_characters",
        color: "#38bdf8",
      },
      {
        id: "fg-pin",
        type: "location_pin",
        title: "Summit",
        label: "Camp 4",
        x: 850,
        y: 350,
        startMs: 500,
        durationMs: 3500,
        layerPosition: "above_characters",
        color: "#ef4444",
      },
    ],
  };

  const engine = new VectorAnimationEngine();
  const svg = engine.generateSvgFrame({
    animationData: sceneData,
    timestampSec: 1.0,
  });

  assert.ok(svg.includes('id="below-characters-overlays-layer"'), "Scene SVG must contain below-characters overlay layer");
  assert.ok(svg.includes('id="above-characters-overlays-layer"'), "Scene SVG must contain above-characters overlay layer");
  assert.ok(svg.includes("bg-route"), "Scene SVG must include route overlay");
  assert.ok(svg.includes("fg-pin"), "Scene SVG must include pin overlay");
  assert.ok(svg.includes("char-inst-earth-guide"), "Scene SVG must include Earth character rig");

  // Rasterize to PNG buffer via @resvg/resvg-js
  const pngBuffer = engine.rasterizeSvgToPng(svg, 1280);
  assert.ok(pngBuffer && pngBuffer.length > 0, "Resvg must render frame to valid buffer");
  // Check PNG magic header: 0x89 'P' 'N' 'G'
  assert.strictEqual(pngBuffer[0], 0x89);
  assert.strictEqual(pngBuffer[1], 0x50);
  assert.strictEqual(pngBuffer[2], 0x4e);
  assert.strictEqual(pngBuffer[3], 0x47);
});

test("Mixed-Media Educational Overlays - 9. Backward Compatibility without Overlays", () => {
  const sceneWithoutOverlays: VectorSceneData = {
    version: 1,
    viewport: { width: 1280, height: 720 },
    characterInstances: [],
    animationClips: [],
  };

  const engine = new VectorAnimationEngine();
  const svg = engine.generateSvgFrame({
    animationData: sceneWithoutOverlays,
    timestampSec: 1.0,
  });
  assert.ok(svg.includes("<svg"), "Must generate valid SVG frame");
  assert.ok(!svg.includes("below-characters-overlays-layer"), "Must not have unnecessary empty below-characters layer");
  assert.ok(!svg.includes("above-characters-overlays-layer"), "Must not have unnecessary empty above-characters layer");
});

test("Mixed-Media Educational Overlays - 10. Database Json Persistence Compatibility", async () => {
  const uniqueStoryId = `story-overlay-test-${Date.now()}`;
  const story = await createStory({
    storyId: uniqueStoryId,
    title: "Overlays Persistence Test",
    logline: "Testing overlay persistence in Prisma Json field",
    lesson: "Geography is fun",
    theme: "educational",
    targetDuration: 30,
    scenes: [],
    characters: [],
  });

  const overlayList: EducationalOverlay[] = [
    {
      id: "pin-persisted",
      type: "location_pin",
      title: "Amazon Rainforest",
      x: 520,
      y: 410,
      startMs: 0,
      durationMs: 4000,
    },
    {
      id: "ring-persisted",
      type: "highlight_ring",
      x: 520,
      y: 410,
      radius: 90,
      startMs: 0,
      durationMs: 4000,
    },
  ];

  const scene = await createScene({
    sceneId: `sc-overlay-${Date.now()}`,
    storyId: story.storyId,
    order: 1,
    number: 1,
    title: "Amazon Expedition",
    narration: "We journey into the lungs of our planet.",
    startMs: 0,
    endMs: 5000,
    estimatedDurationMs: 5000,
    animationData: {
      version: 1,
      viewport: { width: 1280, height: 720 },
      characterInstances: [],
      animationClips: [],
      overlays: overlayList,
    } as any,
  });

  assert.ok(scene.animationData, "Scene animationData must exist");
  const storedAnimData = scene.animationData as any;
  assert.ok(Array.isArray(storedAnimData.overlays), "Overlays array must be preserved in Json field");
  assert.strictEqual(storedAnimData.overlays.length, 2);
  assert.strictEqual(storedAnimData.overlays[0].id, "pin-persisted");
  assert.strictEqual(storedAnimData.overlays[1].type, "highlight_ring");

  // Clean up
  await deleteStory(story.storyId);
});

