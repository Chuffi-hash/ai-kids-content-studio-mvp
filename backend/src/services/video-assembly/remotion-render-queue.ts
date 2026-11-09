/**
 * Global Render Queue for Remotion video export jobs.
 * Ensures resource-safe concurrency (defaulting to 1 active Chromium render at a time)
 * while keeping additional jobs cleanly queued with visible progress stages.
 */
export class RemotionRenderQueue {
  private static instance: RemotionRenderQueue;
  private maxConcurrency: number;
  private activeCount: number = 0;
  private queue: Array<{
    jobId: string;
    task: () => Promise<any>;
    onQueuePositionChange?: (position: number, totalQueued: number) => void;
    resolve: (val: any) => void;
    reject: (err: any) => void;
  }> = [];

  private constructor() {
    const envLimit = Number(process.env.REMOTION_MAX_CONCURRENT_RENDERS);
    this.maxConcurrency = Number.isInteger(envLimit) && envLimit > 0 ? envLimit : 1;
    console.log(`[RemotionRenderQueue] Initialized with maxConcurrency = ${this.maxConcurrency}`);
  }

  public static getInstance(): RemotionRenderQueue {
    if (!RemotionRenderQueue.instance) {
      RemotionRenderQueue.instance = new RemotionRenderQueue();
    }
    return RemotionRenderQueue.instance;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public setMaxConcurrency(limit: number): void {
    if (limit > 0) {
      this.maxConcurrency = limit;
      this.processNext();
    }
  }

  /**
   * Cancels a queued task if it hasn't started running yet.
   */
  public cancel(jobId: string): boolean {
    const idx = this.queue.findIndex((item) => item.jobId === jobId);
    if (idx !== -1) {
      const removed = this.queue.splice(idx, 1)[0];
      removed.reject(new Error(`Render job ${jobId} was cancelled before execution`));
      this.queue.forEach((item, pos) => {
        item.onQueuePositionChange?.(pos + 1, this.queue.length);
      });
      return true;
    }
    return false;
  }

  /**
   * Enqueues a render task and runs it when a slot is available.
   */
  public enqueue<T>(options: {
    jobId: string;
    task: () => Promise<T>;
    onQueuePositionChange?: (position: number, totalQueued: number) => void;
  }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item = {
        jobId: options.jobId,
        task: options.task,
        onQueuePositionChange: options.onQueuePositionChange,
        resolve,
        reject,
      };

      if (this.activeCount < this.maxConcurrency) {
        this.runTask(item);
      } else {
        this.queue.push(item);
        const pos = this.queue.length;
        console.log(`[RemotionRenderQueue] Job ${options.jobId} queued at position ${pos} (active: ${this.activeCount}/${this.maxConcurrency})`);
        item.onQueuePositionChange?.(pos, this.queue.length);
      }
    });
  }

  private async runTask(item: {
    jobId: string;
    task: () => Promise<any>;
    resolve: (val: any) => void;
    reject: (err: any) => void;
  }): Promise<void> {
    this.activeCount += 1;
    console.log(`[RemotionRenderQueue] Starting render for job ${item.jobId} (active: ${this.activeCount}/${this.maxConcurrency})`);

    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1);
      console.log(`[RemotionRenderQueue] Finished render for job ${item.jobId} (active: ${this.activeCount}/${this.maxConcurrency}, queued: ${this.queue.length})`);
      this.processNext();
    }
  }

  private processNext(): void {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const nextItem = this.queue.shift();
    if (!nextItem) return;

    // Notify remaining queued jobs of their updated queue position
    this.queue.forEach((queuedItem, idx) => {
      queuedItem.onQueuePositionChange?.(idx + 1, this.queue.length);
    });

    this.runTask(nextItem);
  }
}

