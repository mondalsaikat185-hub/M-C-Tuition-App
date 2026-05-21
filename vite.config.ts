import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        manifest: {
          name: 'Mondal Coaching',
          short_name: 'Target App',
          description: 'Mondal Coaching Live Portal',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          start_url: '/?v=2',
          icons: [
            {
              src: '/pwa-192x192.png?v=2',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/pwa-512x512.png?v=2',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/pwa-512x512.png?v=2',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: false,
          clientsClaim: true
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
