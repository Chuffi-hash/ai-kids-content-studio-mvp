// @ts-ignore
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { execFileSync } from 'child_process';
import path from 'path';

const ffmpegPath = ffmpegInstaller.path;
const videoPath = path.resolve(process.cwd(), 'storage/exports/maya-s-space-station-journey-1792177586866.mp4');
const outWalk = path.resolve('C:/Users/chuph/.gemini/antigravity/brain/22788c65-d8fa-4654-95aa-810b62d024c2/custom_char_walk_frame.png');
const outWave = path.resolve('C:/Users/chuph/.gemini/antigravity/brain/22788c65-d8fa-4654-95aa-810b62d024c2/custom_char_wave_frame.png');

console.log('Extracting frames with ffmpeg from:', videoPath);
execFileSync(ffmpegPath, ['-ss', '00:00:01.000', '-i', videoPath, '-frames:v', '1', '-y', outWalk]);
console.log('✓ Extracted walk frame to:', outWalk);

execFileSync(ffmpegPath, ['-ss', '00:00:03.500', '-i', videoPath, '-frames:v', '1', '-y', outWave]);
console.log('✓ Extracted wave frame to:', outWave);

