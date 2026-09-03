<script setup lang="ts">
// 响应状态行：状态码（色）/ 状态文本 / 耗时 / 大小 / 截断警告
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { formatBytes } from '../../lib/format'
import type { HTTPResponseModel } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ response: HTTPResponseModel }>()
const L = computed(() => t())

const statusClass = computed(() => {
  const c = props.response.statusCode
  if (c >= 200 && c < 300) return 'status-2xx'
  if (c >= 300 && c < 400) return 'status-3xx'
  if (c >= 400 && c < 500) return 'status-4xx'
  if (c >= 500) return 'status-5xx'
  return 'status-3xx'
})
</script>

<template>
  <div class="sl">
    <!-- resp.Status 已含状态码（Go "200 OK"），直接渲染，缺失时退回 statusCode -->
    <span :class="['sl-status', statusClass]">
      {{ response.status || response.statusCode }}
    </span>
    <span class="sl-meta">{{ response.durationMs }} ms</span>
    <span class="sl-meta">{{ formatBytes(response.sizeBytes) }}</span>
    <span v-if="response.truncated" class="sl-warn">
      <AlertTriangle :size="12" /> {{ L.response.body.truncated }}
    </span>
  </div>
</template>

<style scoped>
.sl {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px 8px;
  font-size: 12px;
}
.sl-status {
  font-weight: 700;
  font-size: 14px;
}
.sl-meta {
  color: var(--text-dim);
}
.sl-warn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--warn);
}
</style>
