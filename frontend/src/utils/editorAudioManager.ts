import { EditorScene } from '../types/editor';
import { resolveAssetUrl } from './urlHelper';

interface ActiveAudioTrack {
  id: string;
  type: 'narration' | 'dialogue' | 'music';
  url: string;
  globalStartMs: number;
  durationMs: number;
  element: HTMLAudioElement;
  hasError?: boolean;
}

export class EditorAudioManager {
  private audioElementCache = new Map<string, HTMLAudioElement>();
  private activeTracks = new Map<string, ActiveAudioTrack>();
  private musicElement: HTMLAudioElement | null = null;
  private currentMusicUrl: string | null = null;

  /**
   * Retrieves or creates a cached HTMLAudioElement for a given URL.
   */
  private getOrCreateAudio(rawUrl: string): HTMLAudioElement {
    const resolvedUrl = resolveAssetUrl(rawUrl);
    let el = this.audioElementCache.get(resolvedUrl);
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.src = resolvedUrl;
      el.addEventListener('error', (e) => {
        console.warn(`[EditorAudio] Failed to load audio asset from: ${resolvedUrl}`, e);
      });
      this.audioElementCache.set(resolvedUrl, el);
    }
    return el;
  }

  /**
   * Synchronizes all audio tracks with the current editor timeline playback state.
   */
  public syncPlayback(options: {
    scenes: EditorScene[];
    currentTimeMs: number;
    isPlaying: boolean;
    masterVolume: number; // 0.0 - 1.0
    isMuted: boolean;
    selectedMusic: string | null;
    musicVolume: number; // 0.0 - 1.0
  }): void {
    const {
      scenes,
      currentTimeMs,
      isPlaying,
      masterVolume,
      isMuted,
      selectedMusic,
      musicVolume,
    } = options;

    const effectiveMasterVolume = isMuted ? 0 : Math.max(0, Math.min(1, masterVolume));

    // -------------------------------------------------------------
    // 1. Background Soundtrack / Music
    // -------------------------------------------------------------
    if (selectedMusic && selectedMusic !== 'none') {
      const musicPath = selectedMusic.startsWith('/storage/')
        ? selectedMusic
        : `/storage/music/${selectedMusic}.mp3`;
      const resolvedMusicUrl = resolveAssetUrl(musicPath);

      if (this.currentMusicUrl !== resolvedMusicUrl || !this.musicElement) {
        if (this.musicElement) {
          this.musicElement.pause();
        }
        this.musicElement = this.getOrCreateAudio(musicPath);
        this.musicElement.loop = true;
        this.currentMusicUrl = resolvedMusicUrl;
      }

      const effectiveMusicVolume = effectiveMasterVolume * Math.max(0, Math.min(1, musicVolume));
      this.musicElement.volume = effectiveMusicVolume;
      this.musicElement.muted = effectiveMusicVolume === 0;

      if (isPlaying) {
        // Calculate music offset relative to start of timeline
        if (this.musicElement.duration && Number.isFinite(this.musicElement.duration) && this.musicElement.duration > 0) {
          const expectedMusicSec = (currentTimeMs / 1000) % this.musicElement.duration;
          if (Math.abs(this.musicElement.currentTime - expectedMusicSec) > 0.4) {
            this.musicElement.currentTime = expectedMusicSec;
          }
        }
        if (this.musicElement.paused) {
          this.musicElement.play().catch((err) => {
            console.warn('[EditorAudio] Soundtrack playback deferred/interrupted:', err);
          });
        }
      } else {
        if (!this.musicElement.paused) {
          this.musicElement.pause();
        }
      }
    } else {
      if (this.musicElement && !this.musicElement.paused) {
        this.musicElement.pause();
      }
    }

    // -------------------------------------------------------------
    // 2. Collect All Desired Audio Clips for the Story
    // -------------------------------------------------------------
    interface ScheduledClip {
      id: string;
      type: 'narration' | 'dialogue';
      rawUrl: string;
      globalStartMs: number;
      durationMs: number;
    }

    const scheduledClips: ScheduledClip[] = [];

    for (const scene of scenes) {
      // Narration
      if (scene.audioUrl) {
        const narrDuration = scene.actualAudioDurationMs || (scene.endMs - scene.startMs);
        scheduledClips.push({
          id: `narr-${scene.sceneId}`,
          type: 'narration',
          rawUrl: scene.audioUrl,
          globalStartMs: scene.startMs,
          durationMs: narrDuration,
        });
      }

      // Character Dialogues
      const dialogues = scene.animationData?.dialogueLines || [];
      for (const dlg of dialogues) {
        if (dlg.audioUrl) {
          const dlgStartMs = scene.startMs + (dlg.startMs || 0);
          const dlgDuration = dlg.durationMs || 3000;
          scheduledClips.push({
            id: `dlg-${dlg.id}`,
            type: 'dialogue',
            rawUrl: dlg.audioUrl,
            globalStartMs: dlgStartMs,
            durationMs: dlgDuration,
          });
        }
      }
    }

    // -------------------------------------------------------------
    // 3. Reconcile Active vs Inactive Clips at currentTimeMs
    // -------------------------------------------------------------
    const activeIdsThisFrame = new Set<string>();

    for (const clip of scheduledClips) {
      const clipStart = clip.globalStartMs;
      const clipEnd = clip.globalStartMs + clip.durationMs;
      const isWithinWindow = currentTimeMs >= clipStart && currentTimeMs < clipEnd;

      if (isWithinWindow) {
        activeIdsThisFrame.add(clip.id);
        const offsetSec = Math.max(0, (currentTimeMs - clipStart) / 1000);

        let activeTrack = this.activeTracks.get(clip.id);
        if (!activeTrack) {
          const element = this.getOrCreateAudio(clip.rawUrl);
          activeTrack = {
            id: clip.id,
            type: clip.type,
            url: clip.rawUrl,
            globalStartMs: clipStart,
            durationMs: clip.durationMs,
            element,
          };
          this.activeTracks.set(clip.id, activeTrack);
        }

        activeTrack.element.volume = effectiveMasterVolume;
        activeTrack.element.muted = effectiveMasterVolume === 0;

        if (isPlaying) {
          // If out of sync by more than 200ms, resync currentTime
          if (Math.abs(activeTrack.element.currentTime - offsetSec) > 0.25) {
            try {
              activeTrack.element.currentTime = offsetSec;
            } catch (err) {
              console.warn(`[EditorAudio] Error setting currentTime on ${clip.id}:`, err);
            }
          }
          if (activeTrack.element.paused) {
            activeTrack.element.play().catch((err) => {
              console.warn(`[EditorAudio] Playback interrupted on ${clip.id}:`, err);
            });
          }
        } else {
          // Paused state: keep audio at the scrubbed position
          if (!activeTrack.element.paused) {
            activeTrack.element.pause();
          }
          if (Math.abs(activeTrack.element.currentTime - offsetSec) > 0.25) {
            try {
              activeTrack.element.currentTime = offsetSec;
            } catch {}
          }
        }
      }
    }

    // Stop and pause any tracks that are no longer active
    for (const [id, track] of this.activeTracks.entries()) {
      if (!activeIdsThisFrame.has(id)) {
        if (!track.element.paused) {
          track.element.pause();
        }
        try {
          track.element.currentTime = 0;
        } catch {}
        this.activeTracks.delete(id);
      }
    }
  }

  /**
   * Immediately stops and pauses all active audio clips and soundtrack.
   */
  public stopAll(): void {
    if (this.musicElement && !this.musicElement.paused) {
      this.musicElement.pause();
    }
    for (const track of this.activeTracks.values()) {
      if (!track.element.paused) {
        track.element.pause();
      }
      try {
        track.element.currentTime = 0;
      } catch {}
    }
    this.activeTracks.clear();
  }

  /**
   * Completely clean up all audio elements.
   */
  public destroy(): void {
    this.stopAll();
    for (const el of this.audioElementCache.values()) {
      el.pause();
      el.src = '';
    }
    this.audioElementCache.clear();
    this.musicElement = null;
  }
}

