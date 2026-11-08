/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { APP_NAME } from './src/config/app'

// Sets the document <title> (and any %APP_NAME% placeholder) from APP_NAME.
const appNameHtml = (): Plugin => ({
  name: 'app-name-html',
  transformIndexHtml(html) {
    return html
      .replace(/%APP_NAME%/g, APP_NAME)
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${APP_NAME}</title>`)
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), appNameHtml()],
  server: {
    port: 3000,
    host: true,
    open: true
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
