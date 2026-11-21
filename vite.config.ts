import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '^/_trendly/npr/[0-9]+/podcast\\.xml$': {
        target: 'https://feeds.npr.org',
        changeOrigin: true,
        headers: { cookie: '', authorization: '' },
        rewrite: path => path.replace('/_trendly/npr', ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          markdown: ['react-markdown', 'remark-gfm'],
          yaml: ['yaml'],
        },
      },
    },
  },
})
