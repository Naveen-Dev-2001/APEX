import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(),
  viteStaticCopy({
    targets: [
      {
        src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
        dest: ''
      }
    ]
  })
  ],
  server: {
    port: 4000,
    historyApiFallback: true,
  },
  optimizeDeps: {
    include: ['react-pdf', 'pdfjs-dist']
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
    }
  }
})
