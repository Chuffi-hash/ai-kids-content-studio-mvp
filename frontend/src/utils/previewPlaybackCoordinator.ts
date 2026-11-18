/**
 * Centralized Preview Playback Coordinator (Frontend)
 *
 * Ensures only ONE preview audio sample (voice audition, narration preview, dialogue preview)
 * plays at any given time across the Simple Editor, DialogueInspector, and PropertiesInspector.
 * Automatically halts any previously playing sample before starting a new one.
 */

class PreviewPlaybackCoordinator {
  private currentAudio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private activeId: string | null = null;
  private onEndCallbacks: Set<() => void> = new Set();

  /**
   * Starts playback of an audio URL. Stops any currently playing preview.
   */
  async play(options: {
    url: string;
    id?: string;
    volume?: number;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }): Promise<void> {
    const { url, id = url, volume = 1.0, onEnd, onError } = options;

    // Halt any active preview playback
    this.stopAll();

    try {
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, volume));
      this.currentAudio = audio;
      this.currentUrl = url;
      this.activeId = id;

      const cleanup = () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          this.currentUrl = null;
          this.activeId = null;
        }
        if (onEnd) {
          onEnd();
        }
        this.notifyEnd();
      };

      audio.onended = cleanup;
      audio.onerror = (e) => {
        cleanup();
        if (onError) onError(e);
      };

      await audio.play();
    } catch (err) {
      this.stopAll();
      if (onError) {
        onError(err);
      } else {
        console.warn('[PreviewCoordinator] Failed to play audio:', err);
      }
    }
  }

  /**
   * Halts all active preview playback immediately.
   */
  stopAll(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
      } catch (err) {
        // Ignore abort errors
      }
      this.currentAudio = null;
      this.currentUrl = null;
      this.activeId = null;
    }
    this.notifyEnd();
  }

  /**
   * Checks if a specific URL or ID is currently playing.
   */
  isPlaying(idOrUrl?: string): boolean {
    if (!this.currentAudio || this.currentAudio.paused) {
      return false;
    }
    if (!idOrUrl) {
      return true;
    }
    return this.activeId === idOrUrl || this.currentUrl === idOrUrl;
  }

  getCurrentId(): string | null {
    return this.activeId;
  }

  getCurrentUrl(): string | null {
    return this.currentUrl;
  }

  subscribe(onEnd: () => void): () => void {
    this.onEndCallbacks.add(onEnd);
    return () => {
      this.onEndCallbacks.delete(onEnd);
    };
  }

  private notifyEnd(): void {
    this.onEndCallbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        // ignore
      }
    });
  }
}

export const previewCoordinator = new PreviewPlaybackCoordinator();
