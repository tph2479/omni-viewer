// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Bun runtime globals (used in server routes)
	const Bun: {
		gc(synchronous: boolean): void;
		file(path: string): { slice(start: number, end: number): unknown };
	} | undefined;
}

// Third-party modules without @types
declare module 'yauzl-promise';
declare module 'heic-convert';

export {};
