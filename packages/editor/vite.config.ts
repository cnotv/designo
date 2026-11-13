import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { designoFilesPlugin } from './server/designoFilesPlugin.ts'

export default defineConfig({
  plugins: [vue(), tailwindcss(), designoFilesPlugin()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5320, strictPort: true }
})
