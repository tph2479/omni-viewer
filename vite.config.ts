import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		watch: {
			ignored: ['**/.thumbnails/**']
		}
	},
	optimizeDeps: {
		exclude: ['pdfjs-dist'],
	},
	// foliate-js ships native ES modules with relative dynamic imports.
	// Excluding them prevents Vite from rewriting the paths during pre-bundling.
	assetsInclude: ['**/*.epub'],
});
