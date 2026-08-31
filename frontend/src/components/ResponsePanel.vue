<template>
  <div class="response-panel" v-if="response">
    <div v-if="response.error" class="response-error">请求出错：{{ response.error }}</div>
    <template v-else>
      <div class="response-meta">
        <span :class="['status', statusClass]">{{ response.statusCode }} {{ response.status }}</span>
        <span class="meta-item">耗时 {{ response.durationMs }} ms</span>
        <span class="meta-item">大小 {{ formatSize(response.sizeBytes) }}</span>
      </div>
      <div class="tabs">
        <button :class="['tab', { active: activeTab === 'Body' }]" @click="activeTab = 'Body'">Body</button>
        <button :class="['tab', { active: activeTab === 'Headers' }]" @click="activeTab = 'Headers'">
          Headers ({{ response.headers.length }})
        </button>
      </div>
      <pre v-if="activeTab === 'Body'" class="response-body">{{ response.body }}</pre>
      <div v-else class="response-headers">
        <div v-for="h in response.headers" :key="h.key" class="header-row">
          <span class="header-key">{{ h.key }}</span>
          <span class="header-value">{{ h.value }}</span>
        </div>
      </div>
    </template>
  </div>
  <div v-else class="response-empty">发送请求后，响应会展示在这里</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HTTPResponseModel } from '../types/models'

const props = defineProps<{ response: HTTPResponseModel | null }>()
const activeTab = ref<'Body' | 'Headers'>('Body')

const statusClass = computed(() => {
  const code = props.response?.statusCode ?? 0
  if (code >= 200 && code < 300) return 'status-success'
  if (code >= 400) return 'status-error'
  return 'status-neutral'
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}
</script>

<style scoped>
.response-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.response-empty {
  color: #999;
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}
.response-error {
  color: #a32d2d;
  font-size: 13px;
}
.response-meta {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 13px;
}
.status {
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
}
.status-success {
  background: #eaf3de;
  color: #3b6d11;
}
.status-error {
  background: #fcebeb;
  color: #a32d2d;
}
.status-neutral {
  background: #f1efe8;
  color: #5f5e5a;
}
.meta-item {
  color: #888780;
}
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #eee;
}
.tab {
  border: none;
  background: transparent;
  padding: 6px 12px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tab.active {
  color: #534ab7;
  border-bottom-color: #534ab7;
  font-weight: 500;
}
.response-body {
  background: #f8f8f6;
  border-radius: 6px;
  padding: 12px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 13px;
  max-height: 360px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.response-headers {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.header-row {
  display: flex;
  gap: 12px;
  font-size: 13px;
}
.header-key {
  color: #534ab7;
  min-width: 160px;
}
.header-value {
  color: #444;
  word-break: break-all;
}
</style>
