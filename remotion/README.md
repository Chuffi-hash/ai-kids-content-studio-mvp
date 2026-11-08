# Remotion renderer — optional export engine

Remotion is integrated as an **optional server-side renderer** in AI Kids Content Studio. FFmpeg remains the default and continues to own final audio mastering and background-music ducking.

## How the integration works

1. The existing backend loads the story and selected scenes through the current database services.
2. For scenes with vector characters, the existing `VectorAnimationEngine` renders the frames. This preserves the project's custom rigs, motion paths, expressions, visemes/lip sync, camera transforms and SVG educational overlays instead of creating a second animation system.
3. Still images and existing scene video clips are copied into a temporary Remotion public-asset folder.
4. Remotion composes all scenes on one timeline, places narration and dialogue audio at their existing offsets, and renders an H.264 MP4 with AAC audio.
5. The existing FFmpeg finalization stage applies the background soundtrack/audio ducking and loudness mastering, then performs the current output validation.

The generated manifest and copied assets are temporary export-job files. They are removed by the existing export cleanup path. Source story, scene, character and animation records are not rewritten by the renderer.

## Install on the backend host

Remotion is a separate package so the normal backend dependency tree and default FFmpeg export are not coupled to it.

```bash
cd remotion
npm install
npm run ensure-browser
npm test
npm run typecheck
```

The backend must be able to locate this directory. When the backend is not started from the repository's `backend/` directory, configure `REMOTION_PACKAGE_DIR` to the absolute path of the repository's `remotion/` directory.

For Linux containers/servers, install the Chromium system libraries required by Remotion as described in the [official Docker guide](https://www.remotion.dev/docs/docker). Keep Remotion packages on compatible versions and ensure Chrome Headless Shell can launch.

## Use it in the editor

Open a story, choose **Export Video**, and select one of:

- **FFmpeg** — current default, unchanged.
- **Remotion** — experimental timeline renderer.

Remotion renders into the same export-job lifecycle and output storage as FFmpeg. If Remotion is not installed or the browser cannot launch, the selected Remotion export fails with an actionable error; it does not silently fall back to FFmpeg.

## Standalone composition smoke test

After installing dependencies:

```bash
cd remotion
npm run render -- example.manifest.json output/pilot.mp4 public
```

The example is a simple title-card timeline. Runtime rendering also creates the one-second silent WAV used to guarantee an audio stream. The project export route supplies real scene assets and real dialogue/narration tracks.

## Editor preview, templates and AI Director

- The React editor now has a **Remotion Player** preview mode backed by the read-only `/api/production/story/:storyId/remotion-preview` manifest endpoint.
- Reusable presentation presets are available: Kids Story, Moral Story, Educational Explainer, Nursery Learning, and Intro / Outro. Subtitle themes include speech bubble, karaoke word emphasis, classic, and minimal.
- Dialogue word timing is estimated proportionally from each line's duration when no provider-supplied alignment exists. This is a visual timing approximation, not forced alignment; connect a real word aligner for production-grade karaoke synchronization.
- `POST /api/content/story/director` starts the prompt-to-story pipeline. It creates a structured story, generates missing scene backgrounds, and queues the Remotion export. Poll the returned `statusUrl`; its `exportJob` reports the actual video render status.
- `POST /api/production/story/:storyId/export-variations` queues multiple aspect-ratio exports from the same story. Existing `formatVariants` position overrides are applied where present.

## Current scope and limitations

- Existing vector character animation is rasterized to deterministic PNG frames by the current animation engine; Remotion handles timeline composition/encoding. This preserves visual behavior but does not yet make character rigs editable as native Remotion React layers.
- Existing vector scene overlays are baked into those rendered frames.
- Dialogue/narration timing and per-line volume are transferred to the Remotion timeline. Volume is capped at 1.0 in this first adapter to match Remotion's standard audio gain range.
- Existing background music, ducking and final loudness mastering remain in FFmpeg.
- Pre-rendered video clips are muted in Remotion and placed as visual scene assets; they are not looped if the source clip is shorter than the scene duration.
- Scene transitions are currently hard cuts. Render cancellation UI and pixel-diff preview tests are not implemented yet.
- Batch aspect-ratio variations are supported. Automatic Hindi/English audio regeneration and short/long story recuts are not yet part of the variation endpoint.
- Word highlighting currently uses estimated timing unless actual word-level timestamps are supplied.
- Rendering creates PNG frame assets for vector scenes and can be disk-intensive. The adapter defaults to a maximum of 36,000 timeline frames and a 30-minute worker timeout. Configure `REMOTION_MAX_TOTAL_FRAMES` and `REMOTION_RENDER_TIMEOUT_MS` only after measuring host capacity.

## Licensing

Remotion is source-available under its own license, not a conventional OSI open-source license. Before using the automated renderer in a commercial deployment, review the current [Remotion License](https://www.remotion.dev/docs/license) and determine the applicable individual/team/company license.
