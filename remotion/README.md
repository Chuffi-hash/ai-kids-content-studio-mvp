# Remotion rendering pilot

An **optional**, isolated Remotion renderer. The existing React editor, vector rig engine, Fish/Kokoro/Google TTS and FFmpeg exports remain unchanged.

## What this first integration does

Renders a scene manifest into H.264 MP4 using Remotion: ordered scenes, aspect ratios (16:9, 9:16, 1:1, 4:5), 720p/1080p, camera zoom/pan, background images, narration audio, captions and timed text overlays.

**Not yet supported:** existing articulated vector character rigs, expressions, visemes/lip sync, dialogue mixing, educational SVG overlays, editor parity, automatic DB/story loading, export-job UI. Do not switch production exports to this renderer until those are implemented and visually compared with FFmpeg.

## Run

Requires Node.js, npm, and Chromium/Chrome availability supported by Remotion.

```bash
cd remotion
npm install
npm run typecheck
npm run render -- example.manifest.json output/pilot.mp4
```

Supply `backgroundUrl` and `narrationUrl` as **absolute HTTP(S) URLs accessible to the rendering browser**. For assets in the existing backend storage, run the backend and use its reachable URL (e.g. `http://localhost:5000/storage/...`). No arbitrary local file paths are accepted in manifests. Keep the backend running during render.

## Next integration step

Add a backend manifest adapter that reads existing scenes, their effective durations, background URLs and audio URLs without modifying data. Then add an opt-in Remotion export mode alongside FFmpeg and reuse the existing export job/status interface. For character parity, extract a shared frame-time animation evaluator or render the current SVG animation data with a dedicated Remotion component; do not reimplement character motion independently.

## License

Remotion is source-available under its own license. Review https://www.remotion.dev/docs/license before deploying a commercial automated rendering service.
