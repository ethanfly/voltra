<script setup lang="ts">
// 响应头表格（只读）
import type { HTTPResponseModel } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ response: HTTPResponseModel }>()
const L = t()
const headers = props.response.headers ?? []
</script>

<template>
  <div v-if="headers.length === 0" class="hh-empty">{{ L.response.body.headersEmpty }}</div>
  <div v-else class="hh">
    <div v-for="(h, i) in headers" :key="i" class="hh-row">
      <span class="hh-key">{{ h.key }}</span>
      <span class="hh-val">{{ h.value }}</span>
    </div>
  </div>
</template>

<style scoped>
.hh {
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.hh-row {
  display: flex;
  gap: 12px;
  padding: 4px 10px;
  font-size: 12px;
  font-family: var(--mono);
  border-bottom: 1px solid var(--border);
}
.hh-row:nth-child(odd) {
  background: var(--bg-well);
}
.hh-key {
  color: var(--brand);
  min-width: 180px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hh-val {
  color: var(--text);
  word-break: break-all;
  white-space: pre-wrap;
}
.hh-empty {
  font-size: 12px;
  color: var(--text-faint);
  padding: 12px 10px;
}
</style>
