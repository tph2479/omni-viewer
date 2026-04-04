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
		entries: ['./src/routes/+layout.svelte', './src/routes/**/+page.svelte'],
		include: [
			'@skeletonlabs/skeleton-svelte',
			'lucide-svelte',
			'@skeletonlabs/skeleton-common',
			'@zag-js/svelte',
			'@zag-js/accordion',
			'@zag-js/avatar',
			'@zag-js/carousel',
			'@zag-js/collapsible',
			'@zag-js/combobox',
			'@zag-js/date-picker',
			'@zag-js/dialog',
			'@zag-js/file-upload',
			'@zag-js/floating-panel',
			'@zag-js/menu',
			'@zag-js/popover',
			'@zag-js/progress',
			'@zag-js/radio-group',
			'@zag-js/rating-group',
			'@zag-js/slider',
			'@zag-js/switch',
			'@zag-js/tabs',
			'@zag-js/tags-input',
			'@zag-js/toast',
			'@zag-js/toggle-group',
			'@zag-js/tooltip'
		],
		exclude: ['pdfjs-dist'],
	},
	assetsInclude: ['**/*.epub'],
});
