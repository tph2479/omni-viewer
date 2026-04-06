export class Semaphore {
	// Store the resolve function and the abort handler together
	private queue: { resolve: () => void; onAbort?: () => void }[] = [];
	private activeCount = 0;
	private concurrency: number;

	constructor(concurrency: number) {
		this.concurrency = concurrency;
	}

	async acquire(signal?: AbortSignal): Promise<void> {
		if (this.activeCount < this.concurrency) {
			this.activeCount++;
			return;
		}

		return new Promise<void>((resolve, reject) => {
			const onAbort = () => {
				const idx = this.queue.findIndex(item => item.resolve === resolve);
				if (idx > -1) {
					this.queue.splice(idx, 1);
					reject(new Error('Aborted'));
				}
			};

			if (signal) {
				if (signal.aborted) return reject(new Error('Aborted'));
				signal.addEventListener('abort', onAbort, { once: true });
			}

			this.queue.push({
				resolve: () => {
					if (signal) signal.removeEventListener('abort', onAbort);
					resolve();
				},
				onAbort // Keep track of this to remove it manually if needed
			});
		});
	}

	release(): void {
		if (this.queue.length > 0) {
			const next = this.queue.shift();
			// We don't decrement/increment activeCount here 
			// because we are handing the "slot" directly to the next task.
			if (next) next.resolve();
		} else {
			this.activeCount--;
		}
	}

	async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
		await this.acquire(signal);
		try {
			return await fn();
		} finally {
			this.release();
		}
	}
}

// Global semaphore for all CPU/IO intensive tasks
import os from 'node:os';
const cpus = os.cpus()?.length || 4;
// Limit concurrency to half of CPUs to leave room for the main thread and watcher
export const globalTaskSemaphore = new Semaphore(Math.max(2, Math.floor(cpus / 2)));
