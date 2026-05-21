// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteCommonjs } from '@originjs/vite-plugin-commonjs'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

let commitHash = 'unknown'
let branchName = 'unknown'
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim()
  branchName = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
} catch (e) {
  console.warn('Could not retrieve git info:', e.message)
}

export default defineConfig({
  plugins: [viteCommonjs(), react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BRANCH_NAME__: JSON.stringify(branchName),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 3003,
    historyApiFallback: true,
  },
})