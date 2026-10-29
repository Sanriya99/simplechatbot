import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.OPENWEBUI_URL || 'http://localhost:8080'

  if (!env.OPENWEBUI_API_KEY) {
    console.warn('\n[chatbot] OPENWEBUI_API_KEY is not set in frontend/.env - requests will be rejected.\n')
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // Forward /api/* to Open WebUI and attach the API key server-side,
        // so the key never reaches the browser.
        '/api': {
          target,
          changeOrigin: true,
          headers: { Authorization: `Bearer ${env.OPENWEBUI_API_KEY || ''}` },
        },
      },
    },
  }
})
