# AI Media Studio — 2D Animation Editor Roadmap

## 1. Project Vision

AI Media Studio is an existing full-stack story and media application. The goal is to **upgrade its existing editor in place**, not to create a second editor or a disconnected application.

The product is moving toward a deterministic, code-driven 2D animation workflow:
- Reusable vector characters assembled from SVG body parts.
- Background images and independently positioned scene objects.
- Animation actions and motion paths controlled by a shared timeline.
- Existing narration, music, and media generation retained where working.
- Real MP4 output through the existing backend assembly pipeline and FFmpeg.

The first product milestone is one complete flow: open an existing story, select a background, add a vector character, animate it, preview and scrub, save/reopen, and export a playable MP4.

## 2. Non-Negotiable Rules

1. Update the existing editor and screens in place. Do not create a duplicate editor route or standalone demo.
2. Inspect the current repository before making changes; do not assume file names or behavior without evidence.
3. Preserve existing projects, media, auth, APIs, and working features.
4. Reuse current services and models; avoid duplicate story/scene/character systems.
5. Preserve the editor's dark navy, blue, and purple visual style.
6. Every visible control must perform its advertised action; no fake progress or fake export results.
7. Distinguish still images, Ken Burns clips, AI-generated videos, and code-driven 2D animation.
8. The browser preview and exported video must use equivalent scene data, timing rules, and animation calculations.
9. Report test results honestly. A test file existing is not proof that it passed; a successful HTTP response is not proof that a playable MP4 was produced.
10. Do not introduce a custom PNG/SVG importer or full rigging editor until a later phase.

## 3. Current Repository Context

The following code is present in the repository at the time this README was reviewed:
- `frontend/src/pages/StoryDetailPage.tsx`: existing story editor and animation-data update handlers.
- `frontend/src/components/editor/animation/VectorSceneCanvas.tsx`: native SVG scene canvas, background image, character instances, and transform gizmo integration.
- `frontend/src/components/editor/animation/VectorCharacterRenderer.tsx`: SVG renderer for the vector rig's parts.
- `frontend/src/components/editor/animation/TransformGizmo.tsx`: transform and motion-path interactions.
- `frontend/src/utils/animationEngine.ts`: client-side timestamp-based pose evaluation.
- `frontend/src/types/animation.ts`: scene animation, character instance, clip, and vector-rig TypeScript contracts.
- `frontend/src/assets/characters/defaultCharacters.ts`: frontend Pip and Sammy rig definitions.
- `backend/src/services/animation/vector-animation.engine.ts`: backend pose evaluation, SVG frame generation, and Resvg rasterization.
- `backend/src/services/animation/templates/default-characters.ts`: backend Pip and Sammy rig definitions.
- `backend/src/services/video-assembly/video-assembly.service.ts`: FFmpeg scene and final movie assembly, including vector-scene handling.
- `backend/src/routes/content.ts`: scene update route accepts `animationData`.
- `backend/prisma/schema.prisma`: `Scene.animationData Json?` and `Character.canonicalAppearance Json?`.
- `backend/tests/vector-animation.test.ts`: automated unit tests for rig lookup, walking modes, wave/jump, and Resvg PNG rasterization.
- `backend/tests/verify-2d-animation-export.ts` and `backend/tests/verify-phase1-all-tests.ts`: scripts intended to perform broader integration/export verification.

These files confirm that relevant implementation code and test scripts exist. They do **not**, by themselves, prove the frontend/backend builds succeed, every editor interaction works, database changes are deployed, or a real MP4/audio export has been verified in the current environment. No current CI workflow run was found during this review. Run the documented commands and retain actual output when reporting pass/fail status.

## 4. Known Implementation Risks to Verify

The source review identified these concrete issues to investigate before adding more features:

1. **Parallel character definitions:** The frontend and backend each have their own Pip/Sammy rig templates. Changes may drift unless tests compare key contract details or the definitions are consolidated safely.
2. **Preview/export rendering differences:** The browser renderer and backend independently build SVG transforms. Verify that both produce equivalent part rotations, pivot transforms, body motion, scaling, rotation, flip, and layering at the same timestamp.
3. **Forearm rendering:** The frontend and backend pose evaluators produce forearm angles, but renderer code combines the right forearm angle into the right-arm rotation and does not visibly render the optional forearm part as a separate joint. Wave motion may therefore differ from the intended articulated result.
4. **Scene-relative timing:** Export renders frame timestamps from zero, while the browser canvas derives time from the timeline playhead and scene start. Verify clip offsets are interpreted consistently for all scenes.
5. **Frame storage cost:** The vector export currently writes every PNG frame to a temporary directory before FFmpeg encoding. This is not the direct stdin streaming described by earlier drafts; benchmark resource use before changing the pipeline.
6. **Background paths and MIME types:** Backend SVG rendering resolves local asset paths and currently maps PNG to image/png and other file extensions to image/jpeg. Test JPEG/WebP/other supported backgrounds and missing files.
7. **Export completion checks:** The assembly service sets a completed status after FFmpeg/copy operations. Verify the resulting file exists, is non-empty, and has valid streams before reporting success.
8. **Audio behavior:** The scene renderer can create a silent AAC track when there is no narration file. Verify the final master audio logic handles silent segments, narration, and optional background music without dropping or misaligning audio.
9. **Overlapping clips:** The pose evaluator selects the first active clip for an instance. Define expected behavior for overlapping actions and test it.
10. **Persistence/autosave:** The data model and update handlers exist; verify debounced saves, race handling, reload restoration, and database persistence rather than assuming them from the presence of handlers.

Fix confirmed defects in priority order and keep changes scoped to the existing implementation.

## 5. Phase 0 — Repository Audit Status

**Status: Code inspection started; runtime verification pending.**

Before changing architecture, run:
- `cd frontend && npm run build`
- `cd backend && npm test`
- `cd backend && npm run build`
- The appropriate existing vector-animation and export verification scripts using a configured, safe test database and valid media assets.

Inspect the test scripts before execution. Integration scripts that create database records, call TTS providers, or generate exports must use a safe development/test environment and must clean up their temporary records/files. Do not run destructive database commands against user data.

Record command output, failures, environment requirements, and whether an actual MP4 was opened/probed. Do not mark Phase 0 complete until the audit report has evidence.

## 6. Phase 1 — Vector Animation Workflow

**Goal:** One background + one built-in vector character + animation + timeline preview/scrubbing.

Use the current editor and components. Reuse:
- Existing character asset panel and Pip/Sammy vector templates.
- Existing SVG canvas and transform gizmo.
- Existing animation types and pose functions.
- Existing scene update/persistence pathway.

Verify or implement:
- Add a built-in vector rig to an existing scene.
- Position, scale, rotate, flip, and adjust z-order.
- Actions: idle, walk, wave, jump.
- Walking in-place and along a start-to-end path.
- Clip start time, duration, loop, and speed.
- Timeline selection and deterministic playhead scrubbing.
- Correct selection/inspector state and usable layout.

Do not add new editor routes. Keep custom asset upload, rigging UI, and sprite-sheet tooling out of Phase 1.

**Exit criteria:** Unit and frontend build checks pass; editing operations work in the existing editor; the same scene timestamp produces repeatable poses.

## 7. Phase 2 — Real MP4 Export

**Goal:** Render a short, real MP4 from the same scene and animation model.

Reuse the existing `VectorAnimationEngine` and `VideoAssemblyService` unless tests show a safe change is necessary.

Verify:
- Frame timestamps use the configured frame rate and scene-relative time.
- Background and animated character are rendered for each frame.
- FFmpeg generates a real H.264/yuv420p MP4.
- Actual duration and frame rate are correct.
- The file exists, has non-zero size, and passes ffprobe checks.
- The output can be opened and played.
- The exported poses match the browser preview at selected timestamps.

Do not claim direct FFmpeg stdin streaming unless it has actually been implemented; the current repository writes PNG frames to a temporary directory and then encodes them from an image sequence.

**Exit criteria:** A short MP4 is generated and independently probed/played; frame motion is confirmed, not inferred from job status.

## 8. Phase 3 — Persistence and Recovery

**Goal:** Reliable save and restore of character instances, transforms, and animation clips.

Reuse the existing `Scene.animationData Json?` field and scene update route if adequate. Avoid unnecessary schema migrations.

Verify:
- Animation changes are saved to the correct scene.
- Refresh/reopen restores background, instances, transforms, clips, and timing.
- Rapid edits do not cause stale requests to overwrite newer state.
- Save failures are visible and retryable.
- Undo/redo restores the actual animation state.

**Exit criteria:** Save/reload integration test passes against a safe development/test database.

## 9. Phase 4 — Audio and Multi-Scene Assembly

**Goal:** Existing narration and background music remain synchronized in mixed animated and non-animated scenes.

Verify:
- Actual narration audio URL/path resolves correctly.
- Audio duration is checked against scene duration.
- Silent scenes remain valid.
- Music mixing uses the intended volume.
- Concatenated segments maintain compatible codec, resolution, frame rate, and timebase.
- Final MP4 has expected video/audio streams and playable sound.

**Exit criteria:** A multi-scene export with narration and optional music passes ffprobe checks and is listened to manually.

## 10. Future Phase — Custom Image Characters

**Not part of Phase 1 unless equivalent support already exists.**

Design for future support of:
- Transparent PNG sprites.
- Static SVG assets.
- Layered images and separated limbs.
- Sprite sheets.
- Rigged characters.

Keep reusable asset definitions separate from their scene instances. Keep generic transforms and motion paths format-agnostic. Flat images may move, scale, rotate, flip, bob, or shake; do not claim independent limb animation without separated parts or a rig.

Future workflow: select/upload an asset, drag it onto the existing canvas, manipulate the scene object, add supported motion clips to the timeline, preview, and export.

## 11. Tests and Definition of Done

Use actual results, not assumptions. Minimum verification:
1. Built-in Pip and Sammy resolve correctly.
2. In-place walk keeps the root position fixed while limb angles change.
3. Motion-path walk reaches start, midpoint, and end positions correctly.
4. Reverse movement orientation behaves as expected.
5. Wave and jump poses change correctly over time.
6. SVG frame rasterizes into a valid PNG.
7. Canvas selection and transform controls work.
8. Scene animation data persists and reloads.
9. Exported MP4 has correct codec, dimensions, frame rate, and duration.
10. Animated frames visibly differ at sampled timestamps.
11. Narration/music are present and synchronized where configured.
12. Existing story/scene/image/audio/video workflows still work.

The initial animation milestone is complete only when the existing editor can compose and preview an animated scene, save and reload it, and export an actual playable MP4 whose motion matches the preview.

## 12. Instructions for Coding Agents

- Read this document, then inspect the current source before editing.
- Make focused changes to the existing editor; do not duplicate it.
- Do not assume that an existing test script passed just because it exists.
- Avoid database resets and destructive operations.
- Do not silently remove old data or generated media.
- Do not introduce a new animation/rendering dependency without an explicit reason and a build/test check.
- Update this README when implementation status changes, and only mark an item verified when evidence exists.
- Report files changed, commands run, output, remaining blockers, and known limitations.

## 13. Architectural Direction

1. Deterministic, time-based animation.
2. Vector-first built-in characters.
3. Format-agnostic scene-object transforms for later custom assets.
4. Reuse the existing editor, timeline, data model, storage, and video assembly where possible.
5. Keep browser preview and backend export calculations equivalent.
6. Validate the real rendering output and audio streams.
7. Preserve working AI image generation, TTS, Ken Burns clips, and existing CRUD workflows.
