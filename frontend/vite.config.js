// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

export default defineConfig({
  plugins: [viteCommonjs(), react(), tailwindcss()],
  server: {
    port: 3003,
    historyApiFallback: true,
  },
})