import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { VideoAssemblyService } from '../src/services/video-assembly/video-assembly.service.js';
import fs from 'fs';
// @ts-ignore
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function testRealExport() {
  const service = new VideoAssemblyService();
  const storyId = 'story-b4fcc99f-b7bc-41a3-8c33-528871bf28b5';
  console.log('--- Starting Real Video Assembly Export Verification ---');
  console.log('Target Story ID:', storyId);

  const job = service.startExportJob({
    storyId,
    resolution: '720p',
    fps: 30,
    backgroundMusic: 'gentle-storybook',
    musicVolume: 0.2,
  });

  console.log('Export Job ID:', job.id);

  while (true) {
    await new Promise((r) => setTimeout(r, 1000));
    const current = service.getJob(job.id);
    if (!current) throw new Error('Job not found');

    console.log(`[Status: ${current.status}] Progress: ${current.progress}% — ${current.stage}`);

    if (current.status === 'completed') {
      const outputPath = path.join(process.cwd(), current.downloadUrl!.replace(/^\//, ''));
      console.log('Export Completed! File location:', outputPath);

      if (!fs.existsSync(outputPath)) {
        throw new Error(`Output file not found at ${outputPath}`);
      }

      const stat = fs.statSync(outputPath);
      console.log('Exported Video Size on Disk:', stat.size, 'bytes');

      const { stdout } = await execFileAsync(ffprobeStatic.path, [
        '-v', 'error',
        '-show_entries', 'format=duration,size:stream=codec_name,codec_type',
        '-of', 'json',
        outputPath,
      ]);

      console.log('FFprobe Stream Verification Output:');
      console.log(stdout);

      const probeData = JSON.parse(stdout);
      const hasVideo = probeData.streams?.some((s: any) => s.codec_type === 'video' && s.codec_name === 'h264');
      const hasAudio = probeData.streams?.some((s: any) => s.codec_type === 'audio' && s.codec_name === 'aac');
      const duration = parseFloat(probeData.format?.duration || '0');

      console.log(`Validation -> Video Stream (H.264): ${hasVideo}`);
      console.log(`Validation -> Audio Stream (AAC): ${hasAudio}`);
      console.log(`Validation -> Total Duration: ${duration.toFixed(2)} seconds`);

      if (!hasVideo || !hasAudio || duration <= 0) {
        throw new Error('Video validation failed: Missing audio/video streams or invalid duration');
      }

      console.log('--- Real Video Assembly & Export Verification SUCCEEDED ---');
      process.exit(0);
    } else if (current.status === 'failed') {
      console.error('Export Failed:', current.error);
      process.exit(1);
    }
  }
}

testRealExport().catch((err) => {
  console.error('Fatal Verification Error:', err);
  process.exit(1);
});
