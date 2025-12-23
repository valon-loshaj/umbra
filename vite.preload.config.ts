import { builtinModules } from 'module'

import { defineConfig } from 'vite'

// https://vitejs.dev/config
// Preload scripts must be CommonJS for Electron's sandboxed execution context
export default defineConfig({
	build: {
		rollupOptions: {
			external: [
				'electron',
				// Node.js built-in modules
				...builtinModules,
				...builtinModules.map((m) => `node:${m}`),
			],
			output: {
				// Preload must be CommonJS - Electron sandboxed preload doesn't support ESM
				format: 'cjs',
			},
		},
	},
})
