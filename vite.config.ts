import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  /**
   * Pin PostCSS config resolution to this directory.
   *
   * Vite otherwise walks up the tree and picks up any `postcss.config.js` in an
   * ancestor folder. This machine happens to have an unrelated Tailwind config
   * at `D:\postcss.config.js`, which would break the build with a confusing
   * "Cannot find module 'tailwindcss'" error. EventFlow uses plain CSS, so an
   * empty inline config is correct and keeps the build hermetic.
   */
  css: {
    postcss: { plugins: [] },
  },
  server: {
    port: 5199,
    strictPort: true,
  },
  preview: {
    port: 5199,
    strictPort: true,
  },
})
