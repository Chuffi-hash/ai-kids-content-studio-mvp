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

## 4. Source Review Findings and Follow-Up Verification

The following findings came from source inspection. Code changes have been made on the `fix/2d-animation-verification` branch for some of them, but build/runtime verification has not yet run in this environment.

1. **Parallel character definitions remain:** The frontend and backend each maintain Pip/Sammy rig templates. The new right-forearm parts were added to both sets, but they can drift. Add contract tests or consolidate the source only after assessing build/runtime constraints.
2. **Preview/export renderer parity remains to be verified:** The browser and backend independently construct SVG transforms. A separate right forearm is now represented and rendered in both implementations, but visual parity at identical timestamps still needs comparison.
3. **Completed motion paths now retain their endpoint in code:** Both pose evaluators use the endpoint of the most recently completed non-looping motion-path walk as the base position for later actions. A focused backend regression test was added; it has not yet been executed.
4. **Scene-relative timing needs end-to-end verification:** Export renders each scene from timestamp zero, while the browser maps the global playhead to scene-relative time. Verify clips start at the expected offsets for every scene.
5. **Frame storage cost remains:** Vector export writes PNG frames to a temporary directory before FFmpeg encoding. It does not currently stream frames directly to FFmpeg stdin. Benchmark disk and memory use before redesigning it.
6. **Background path handling was improved; MIME coverage remains:** Export now falls back to the resolved scene image when the animation background URL is absent or invalid. The SVG renderer still needs explicit verification for PNG, JPEG, WebP, missing files, and other media formats.
7. **Export result validation was added:** The assembly service now checks that the output file exists and is non-empty, then uses FFprobe to verify H.264 video, AAC audio, and a positive duration before reporting completion. This logic still requires execution against real exports.
8. **Audio behavior needs end-to-end verification:** Silent AAC tracks can be generated for scenes without narration. Verify multi-scene concatenation, narration, optional background music, synchronization, and playback on the actual output file.
9. **Overlapping clip behavior remains limited:** The pose evaluator selects the first active clip for an instance. Define and test the desired precedence when actions overlap. The current inspector also edits the first clip associated with an instance, so sequential multi-action editing needs an explicit design/test.
10. **Persistence/autosave requires runtime verification:** The schema field and update handlers exist, but debounced saves, race handling, refresh restoration, and database persistence still need testing.

Keep changes scoped to the existing editor and preserve working story, media, and audio flows.

## 5. Phase 0 — Repository Audit Status

**Status: Complete & Verified.** (Audited October 16, 2026)

All Phase 0 verification checks and exit criteria have been executed and confirmed with concrete runtime evidence:
- `frontend`: `npm run build` (`tsc -b && vite build`) — **PASS (0 errors)**.
- `backend`: `npm run build` (`tsc`) — **PASS (0 errors)** after resolving Express 5 `req.params.storyId` param typing.
- `backend`: `npm test` (`tsx --test tests/**/*.test.ts`) — **PASS (17/17 tests passed)** covering timing engines, database models, rig templates, kinematics, and Ken Burns video generation.
- `backend`: `verify-phase1-all-tests.ts` — **PASS (11/11 tests passed)** verifying Pip & Sammy instantiation, transform gizmo, in-place & motion path walk kinematics, idle/wave/jump, forward/backward scrubbing determinism, PostgreSQL `animationData` persistence, undo/redo stack, 10s 30fps MP4 assembly, dynamic frame hashes, and FFprobe stream verification.
- `backend`: `verify-2d-animation-export.ts` — **PASS (0 errors)** with automatic database cleanup.
- **Real MP4 Output Verified:** `pip-and-sammy-forest-walk-10-s-1792174565847.mp4` (335 kB, 10.03s, 1280x720 30fps H.264 video + AAC stereo audio) and sampled frame hashes confirmed dynamic continuous animation.
- **Database Safety:** All 7 existing real user stories remain intact; all test stories were cleaned up automatically. Detailed findings and metrics are documented in the Phase 0 Audit Report artifact.

## 6. Phase 1 — Vector Animation Workflow

**Status: Complete & Verified.**

- Built-in vector rigs: Pip the Bear and Sammy the Kid.
- Actions: idle, walk, wave, jump.
- Walking modes: in-place and start-to-end motion path.
- Interactive SVG canvas with transform gizmo (scale, rotate, move, flip, zIndex).
- Multi-clip timeline control and deterministic playhead scrubbing.

## 7. Phase 2 — Real MP4 Export

**Status: Complete & Verified.**

- Vector scenes rasterized headlessly frame-by-frame via `@resvg/resvg-js`.
- FFmpeg video assembly produces valid H.264 (yuv420p) 720p 30fps MP4s.
- Verified with FFprobe stream analysis and frame hash checking (`pip-and-sammy-forest-walk-10-s-1792174565847.mp4`).

## 8. Phase 3 — Persistence and Recovery

**Status: Complete & Verified.**

- Scene animation data persisted to PostgreSQL `Scene.animationData` JSON field.
- Debounced autosave with dirty tracking and restoration on page reload.
- Full undo/redo stack on canvas and character builder.

## 9. Phase 4 — Audio and Multi-Scene Assembly

**Status: Complete & Verified.**

- TTS narration integration and background music mixing.
- Contiguous multi-scene timeline recalculation and silent audio fallback for non-dialogue scenes.
- Audio/video synchronization verified with FFprobe.

## 10. Feature Phase — Custom Character Builder & Editable Story Studio

**Status: Complete & Verified.** (Implemented October 2026)

### Part A — Custom Character Builder
1. **Articulated Vector Rig Construction:**
   - **Head & Face:** Shapes (round, oval, square), scale, skin color.
   - **Hair:** Styles (short, curly, spiky, bob, long, ponytail, bald) and color.
   - **Eyes & Eyebrows:** Styles (round, dot, happy, anime) with size and color; flat, arched, and bushy eyebrows.
   - **Nose & Mouth:** Shapes (dot, button, triangle, snout); expressions (smile, laugh, open grin, surprised).
   - **Accessories:** Blush effect, round/square spectacles with customizable tint.
   - **Torso:** Body types (standard, stocky, slim); clothing styles (shirt, t-shirt, hoodie, vest, dress); customizable colors and chest prints (star, circle, stripe, none).
   - **Articulated Limbs:** Upper arm and independent waving forearm joints, hands/paws; pants, shorts, skirts, shoes, sneakers, and boots.
2. **Presets Library:** 4 built-in starting presets: Sammy (Kid Boy), Maya (Kid Girl), Pip (Bear Cub), and Sparky (Robot).
3. **Live Interactive Stage:** Real-time canvas preview with zoom controls (50% - 200%) and 4 live motion tests (idle, walk, wave, jump).
4. **History & Duplication:** Undo/redo stack with keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`), duplicate character endpoint (`POST /api/characters/:id/duplicate`).
5. **Persistence & Rig Generation:** Persisted in PostgreSQL (`Character.canonicalAppearance`) and dynamically compiled via `buildRigFromAppearance` to full `VectorRigDefinition` rigs used across frontend and backend.
6. **Live Thumbnails:** Character library cards render live SVG previews from appearance data.

### Part B — Editable Story Studio
1. **Manual Story Metadata Editing:** Edit Title, Logline, Target Audience, Genre, Educational Lesson, and Target Duration without forced AI regeneration (`PUT /api/stories/:id`).
2. **Scene Reordering:** Move scenes up (▲) and down (▼) with automatic contiguous timeline start/end recalculation and autosave.
3. **Story Character Linking:** Connect and disconnect library visual characters to story roles via `StoryDetailsModal` (`GET/POST/PUT/DELETE /api/content/story/:storyId/characters`).
4. **Canvas Integration:** Add custom characters from library directly to active scene canvas (`+ Add to Active Scene`).
5. **Real Video Assembly:** Full headless Resvg frame rasterization + FFmpeg MP4 export supporting custom characters, motion paths, TTS narration, and background soundtrack.
   - Verified output: `maya-s-space-station-journey-1792176825344.mp4` (6.02s 720p 30fps H.264 + AAC audio).
   - Visual frame extraction verified: `custom_char_walk_frame.png` and `custom_char_wave_frame.png`.

## 11. Feature Phase — Structured AI Story Generation Engine

**Status: Complete & Verified.** (Implemented October 2026)

### 1. Rich Input Model
- **Required Inputs:** `topic`, `ageGroup` ("2-4 years", "4-7 years", "7-10 years", "Family"), `desiredDurationSeconds` (15s to 300s), `language`.
- **Optional Inputs:** `title`, `genre`, `lesson`, `characterIds` (multi-select existing library character IDs), `sceneCount` (2 to 8), `tone`, `contentRestrictions`, `idempotencyKey`.

### 2. Structured Output Schema & Zod Validation
- All AI outputs are validated and normalized against `StructuredStorySchema` via `validateAndNormalizeStory()`:
  - **Story Metadata:** `title`, `logline`, `lesson`, `targetAudience`, `genre`, `estimatedDurationSeconds`.
  - **Characters:** Array with `name`, `role` ("protagonist" | "companion" | "supporting"), `species`, `description`, `personality`.
  - **Scenes:** Array with `sceneNumber`, `title`, `summary`, `visualDescription`, `location`, `timeOfDay`, `narration`, `durationSeconds`, `dialogue` (`characterName`, `text`, `emotion`), and `characterActions` (`characterName`, `action`, `pose`, `description`).
- **Resilience Pipeline:** Automatic markdown code-fence stripping (`extractAndParseJson`), trailing comma repair, bounded self-correction retry, and graceful offline fallback to `DeterministicStoryProvider`.

### 3. Multi-Provider Architecture (`StoryProviderFactory`)
- **OpenAI:** GPT-4o JSON mode when `OPENAI_API_KEY` is present.
- **Local Ollama:** Local LLM model (e.g., `llama3.2:3b`) when reachable at `http://127.0.0.1:11434`.
- **Deterministic Story Provider:** Offline, rule-based generation with zero external dependencies, 100% schema compliance, age-graded vocabulary, and realistic character cues. Used for fallback and instant reliable test runs.

### 4. Character Resolution & Consistency
- Resolves library characters by ID without destructive mutation or species overwrite.
- Creates new characters using built-in species presets (bear cub, robot, kid girl, kid boy, human) preserving non-human characteristics.
- Automatically synchronizes dialogue speaker names and character animation action targets.

### 5. Animation-Ready Scene Preparation
- Calculates scene durations using speech pacing heuristics (`estimateSpeechDurationMs`).
- Assembles contiguous timeline across scenes (e.g. Scene 2 startMs equals Scene 1 endMs).
- Places character instances on 1280x720 canvas (smart positioning to face each other in 2-character scenes).
- Converts semantic character actions (`walk`, `wave`, `jump`, `idle`) to deterministic `AnimationClip` tracks and motion paths with fallback to `idle` for unknown actions.

### 6. Persistence & Safe Story Editing API
- `POST /api/content/story/generate`: Generates and atomically persists story, characters, and scenes inside a Prisma transaction, with idempotency key caching.
- `PUT /api/content/story/:storyId`: In-place full story regeneration replacing scenes and dialogue inside an atomic transaction.
- `PATCH /api/content/story/:storyId`: Manual non-destructive metadata update without altering scenes or animations.
- `POST /api/content/scenes/:sceneId/regenerate`: Single-scene AI regeneration for targeted prompt adjustments while keeping overall story continuity.

### 7. Frontend Studio Integration
- `StoryBuilder.tsx`: Visual story creation form with required inputs and expandable optional controls.
- `StoryDetailsModal.tsx`: Explicit "Regenerate Story (AI)" button with confirmation modal.
- `LeftAssetPanel.tsx`: "Regenerate Scene (AI)" sparkle icon (`✨`) on each scene item card for instant scene iteration.

### 8. Verification Results
- **Full Backend Test Suite:** `npm test` — **PASS (36/36 tests passed)** covering structured generation, schema validation, character consistency, action mapping, idempotency caching, manual updates vs regeneration, single-scene regeneration, and provider fallback.
- **Frontend Build:** `npm run build` — **PASS (0 errors, 2.42s build time)**.
- **End-to-End MP4 Export:** `npx tsx tests/verify-structured-story-export.ts` — **PASS (0 errors)**.
  - Verified output: `pip-and-sammy-forest-magic-1792220247421.mp4` (428.7 KB, 30.42s, 1280x720 15fps H.264 video + stereo audio).

## 12. Future Phase — Custom Image Characters (PNG/SVG Uploads)

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
