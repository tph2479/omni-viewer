import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
	plugins: [
		tailwindcss(), 
		sveltekit(),
		viteStaticCopy({
			targets: [
				{
					src: './node_modules/pdfjs-dist/cmaps/*',
					dest: 'pdfjs/cmaps'
				},
				{
					src: './node_modules/pdfjs-dist/standard_fonts/*',
					dest: 'pdfjs/standard_fonts'
				}
			]
		})
	],
	server: {
		watch: {
			ignored: ['**/.thumbnails/**']
		}
	},
	optimizeDeps: {
		entries: ['./src/routes/+layout.svelte', './src/routes/**/+page.svelte'],
		exclude: ['pdfjs-dist'],
	},
});
