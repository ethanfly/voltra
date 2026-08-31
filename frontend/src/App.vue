<template>
  <div class="app-shell">
    <header class="app-header">
      <span class="app-logo">⚡ Voltra</span>
      <nav class="mode-switch">
        <button :class="['mode-btn', { active: mode === 'http' }]" @click="mode = 'http'">HTTP 请求</button>
        <button :class="['mode-btn', { active: mode === 'ws' }]" @click="mode = 'ws'">WebSocket</button>
      </nav>
    </header>

    <main class="app-main">
      <template v-if="mode === 'http'">
        <RequestPanel :request="request" @response="onResponse" />
        <div class="divider"></div>
        <ResponsePanel :response="response" />
      </template>
      <template v-else>
        <WSPanel />
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import RequestPanel from './components/RequestPanel.vue'
import ResponsePanel from './components/ResponsePanel.vue'
import WSPanel from './components/WSPanel.vue'
import { emptyRequest } from './types/models'
import type { HTTPResponseModel } from './types/models'

const mode = ref<'http' | 'ws'>('http')
const request = reactive(emptyRequest())
const response = ref<HTTPResponseModel | null>(null)

function onResponse(resp: HTTPResponseModel) {
  response.value = resp
}
</script>

<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #2c2c2a;
}
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid #eee;
}
.app-logo {
  font-weight: 500;
  font-size: 16px;
  color: #534ab7;
}
.mode-switch {
  display: flex;
  gap: 4px;
}
.mode-btn {
  border: 1px solid transparent;
  background: transparent;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
}
.mode-btn.active {
  background: #eeedfe;
  color: #534ab7;
  font-weight: 500;
}
.app-main {
  flex: 1;
  overflow: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.divider {
  height: 1px;
  background: #eee;
}
</style>
