import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { designoFilesPlugin } from './server/designoFilesPlugin.ts'

export default defineConfig({
  plugins: [vue(), designoFilesPlugin()],
  server: { port: 5320, strictPort: true }
})
