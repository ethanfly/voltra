<template>
  <div class="request-panel">
    <div class="request-bar">
      <select v-model="request.method" class="method-select">
        <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
      </select>
      <input
        class="url-input"
        type="text"
        v-model="request.url"
        placeholder="https://api.example.com/users"
        @keyup.enter="onSend"
      />
      <button class="send-btn" :disabled="loading" @click="onSend">
        {{ loading ? '请求中...' : '发送' }}
      </button>
    </div>

    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab"
        :class="['tab', { active: activeTab === tab }]"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </div>

    <div class="tab-content">
      <KvEditor v-if="activeTab === 'Query'" v-model="request.query" />
      <KvEditor v-else-if="activeTab === 'Headers'" v-model="request.headers" />
      <div v-else-if="activeTab === 'Body'" class="body-editor">
        <select v-model="request.bodyType" class="body-type-select">
          <option value="none">none</option>
          <option value="json">JSON</option>
          <option value="x-www-form-urlencoded">x-www-form-urlencoded</option>
          <option value="raw">raw</option>
        </select>
        <textarea
          v-if="request.bodyType !== 'none'"
          v-model="request.body"
          class="body-textarea"
          placeholder="请求体内容"
        ></textarea>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import KvEditor from './KvEditor.vue'
import type { HTTPRequestModel, HTTPResponseModel } from '../types/models'
import { HTTPService } from '../api/backend'

const props = defineProps<{ request: HTTPRequestModel }>()
const emit = defineEmits<{ (e: 'response', resp: HTTPResponseModel): void }>()

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const tabs = ['Query', 'Headers', 'Body'] as const
const activeTab = ref<(typeof tabs)[number]>('Query')
const loading = ref(false)

async function onSend() {
  if (!props.request.url) return
  loading.value = true
  try {
    // 对应 Go 侧 HTTPService.SendRequest 方法，由 wails 自动生成的绑定负责跨语言调用
    const resp: HTTPResponseModel = await HTTPService.SendRequest(props.request)
    emit('response', resp)
  } catch (err) {
    emit('response', {
      statusCode: 0,
      status: '',
      headers: [],
      body: '',
      sizeBytes: 0,
      durationMs: 0,
      error: String(err),
    })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.request-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.request-bar {
  display: flex;
  gap: 8px;
}
.method-select {
  width: 110px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-weight: 500;
}
.url-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 14px;
}
.send-btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  background: #534ab7;
  color: white;
  font-weight: 500;
  cursor: pointer;
}
.send-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #eee;
}
.tab {
  border: none;
  background: transparent;
  padding: 8px 14px;
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
.tab-content {
  min-height: 120px;
}
.body-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.body-type-select {
  width: 220px;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid #ddd;
}
.body-textarea {
  width: 100%;
  min-height: 160px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 13px;
  resize: vertical;
}
</style>
