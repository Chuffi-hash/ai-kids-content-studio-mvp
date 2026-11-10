import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['remotion', '@remotion/player', 'react', 'react-dom'],
    alias: {
      remotion: path.resolve(__dirname, 'node_modules/remotion'),
      '@remotion/player': path.resolve(__dirname, 'node_modules/@remotion/player'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
});
