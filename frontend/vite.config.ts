import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // 固定 IPv4 回环：wails3 壳的资源代理（ExternalAssetHandler）拨号 127.0.0.1，
    // 而 vite 默认 localhost 在本机只听 ::1 → dev 启动必现 "Proxy error ... connection refused"
    host: '127.0.0.1',
    port: 5173,
  },
})
