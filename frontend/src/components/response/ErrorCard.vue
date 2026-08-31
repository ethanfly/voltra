<script setup lang="ts">
// 错误卡：按 errorKind 给出中文标题 / 原因 / 操作 + 原始错误详情
import { computed } from 'vue'
import { AlertTriangle, RotateCw } from 'lucide-vue-next'
import type { HTTPResponseModel } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ response: HTTPResponseModel }>()
const emit = defineEmits<{ (e: 'retry'): void }>()
const L = computed(() => t())

const kind = computed(() => props.response.errorKind ?? 'other')
const text = computed(() => L.value.errorKind[kind.value] ?? L.value.errorKind.other)
</script>

<template>
  <div class="ec">
    <div class="ec-head">
      <AlertTriangle :size="16" class="ec-ico" />
      <span class="ec-title">{{ text.title }}</span>
    </div>
    <p class="ec-reason">{{ text.reason }}</p>
    <button class="btn btn-primary" @click="emit('retry')">
      <RotateCw :size="12" /> {{ text.action }}
    </button>
    <details v-if="response.error" class="ec-detail">
      <summary>原始错误</summary>
      <pre>{{ response.error }}</pre>
    </details>
  </div>
</template>

<style scoped>
.ec {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin: 20px auto 0;
  max-width: 420px;
  width: 100%;
}
.ec-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ec-ico {
  color: var(--error);
}
.ec-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.ec-reason {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
}
.ec-detail {
  width: 100%;
  font-size: 11px;
  color: var(--text-faint);
}
.ec-detail summary {
  cursor: pointer;
  user-select: none;
}
.ec-detail pre {
  margin: 6px 0 0;
  padding: 8px;
  background: var(--bg-sunken);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-family: var(--mono);
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-dim);
}
</style>
