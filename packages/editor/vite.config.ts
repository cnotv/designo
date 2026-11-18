import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { designoFilesPlugin } from './server/designoFilesPlugin.ts'

export default defineConfig({
  plugins: [vue(), tailwindcss(), designoFilesPlugin()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Vite's dev pre-bundling would move harfbuzzjs away from its .wasm file, which it finds beside
  // itself, so the dev server serves it from node_modules as it is.
  optimizeDeps: { exclude: ['harfbuzzjs'] },
  server: { port: 5320, strictPort: true }
})
