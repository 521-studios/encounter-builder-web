import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In production the SPA is served from the same CloudFront distribution that
// routes /api/* to the Lambda backends, so API calls are same-origin. In local
// dev there's no CloudFront, so proxy /api to the staging edge (which fronts the
// staging API + registers localhost:5173 as an OIDC redirect). Override the
// target with VITE_API_PROXY if pointing elsewhere.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_PROXY || 'https://encounters.staging.521studios.com'
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
