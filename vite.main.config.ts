import { builtinModules } from 'module'

import { defineConfig } from 'vite'

// https://vitejs.dev/config
export default defineConfig({
	build: {
		rollupOptions: {
			external: [
				'electron',
				// Native modules that can't be bundled
				'@lancedb/lancedb',
				'@xenova/transformers',
				// Node.js built-in modules
				...builtinModules,
				...builtinModules.map((m) => `node:${m}`),
			],
			output: {
				// CommonJS for Node.js (no "type": "module" in package.json)
				format: 'cjs',
			},
		},
	},
})
