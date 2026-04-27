import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          xlsx: ['xlsx']
        }
      }
    }
  },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Listino PDF Extractor',
        short_name: 'ListinoPDF',
        description: 'Estrae listini Cormach (e simili) da PDF in Excel multi-foglio',
        theme_color: '#0b3d91',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'it-IT',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      }
    })
  ]
});
