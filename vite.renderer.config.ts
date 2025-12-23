import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig(async () => {
  const react = await import('@vitejs/plugin-react');

  return {
    root: 'src/renderer',
    plugins: [react.default()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    optimizeDeps: {
      include: ['monaco-editor'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            monaco: ['monaco-editor'],
          },
        },
      },
    },
  };
});
