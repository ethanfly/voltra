<script setup lang="ts">
// 响应查看器容器：空态 / 错误卡（按 errorKind 中文）/ 状态行 + Body·Headers·Cookies
import { computed, ref, watch } from 'vue'
import EmptyState from '../common/EmptyState.vue'
import StatusLine from './StatusLine.vue'
import BodyTab from './BodyTab.vue'
import HeadersTab from './HeadersTab.vue'
import CookiesTab from './CookiesTab.vue'
import ErrorCard from './ErrorCard.vue'
import { parseSetCookies } from '../../lib/cookies'
import type { HTTPResponseModel } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ response: HTTPResponseModel | null }>()
const emit = defineEmits<{ (e: 'retry'): void }>()
const L = computed(() => t())

const hasError = computed(() => !!props.response?.errorKind || !!props.response?.error)

type Tab = 'body' | 'headers' | 'cookies'
const active = ref<Tab>('body')
// 新响应到达时回到 Body 页
watch(
  () => props.response,
  () => (active.value = 'body'),
)

const tabs = computed(() => {
  const r = props.response
  if (!r || hasError.value) return []
  return [
    { id: 'body', label: L.value.response.tabs.body, count: 0 },
    { id: 'headers', label: L.value.response.tabs.headers, count: r.headers?.length ?? 0 },
    { id: 'cookies', label: L.value.response.tabs.cookies, count: parseSetCookies(r.headers).length },
  ]
})
</script>

<template>
  <div class="rv">
    <EmptyState v-if="!response" :title="L.response.empty" />

    <ErrorCard v-else-if="hasError" :response="response!" @retry="emit('retry')" />

    <template v-else>
      <StatusLine :response="response!" />
      <div class="rv-tabs">
        <button
          v-for="tb in tabs"
          :key="tb.id"
          :class="['rv-tab', { active: active === tb.id }]"
          @click="active = tb.id as Tab"
        >
          {{ tb.label }}
          <span v-if="tb.count > 0" class="rv-tab-count">{{ tb.count }}</span>
        </button>
      </div>
      <div class="rv-body">
        <BodyTab v-if="active === 'body'" :response="response!" />
        <HeadersTab v-else-if="active === 'headers'" :response="response!" />
        <CookiesTab v-else :response="response!" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.rv {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.rv-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--border);
}
.rv-tab {
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  padding: 7px 10px 8px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.rv-tab:hover {
  color: var(--text);
}
.rv-tab.active {
  color: var(--text);
  border-bottom-color: var(--brand);
}
.rv-tab-count {
  font-size: 10px;
  background: var(--bg-sunken);
  border-radius: 8px;
  padding: 0 5px;
  color: var(--text-faint);
}
.rv-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}
</style>
