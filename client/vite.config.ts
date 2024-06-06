import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (!URL.canParse(env.VITE_WS_URL)) {
    throw new Error('Environment variable VITE_WS_URL is missing!')
  }

  return {
    plugins: [react(), TanStackRouterVite()],
    resolve: {
      alias: {
        '@': '/src'
      }
    }
  }
})
