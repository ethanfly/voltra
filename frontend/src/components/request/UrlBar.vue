<script setup lang="ts">
// URL 栏：方法选择 + URL 输入 + 保存 + 发送/取消
// scheme 灰显：无 scheme 时前置一个 8ch 的灰显 "http(s)://" 片段，
// 输入文字透明、下层 <pre> 镜像同文本（像素对齐），长文本滚动时同步镜像
import { computed, ref } from 'vue'
import { Save, Send, Loader2, X } from 'lucide-vue-next'
import MethodPicker from './MethodPicker.vue'
import type { Request } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ request: Request; sending: boolean }>()
const emit = defineEmits<{
  (e: 'send'): void
  (e: 'cancel'): void
  (e: 'save'): void
}>()

const L = computed(() => t())

const hasTypedScheme = computed(() => props.request.url.includes('://'))
/** 需要灰显补全的 scheme（本地地址 http，其余 https，与 Go normalizeURL 一致） */
const hintScheme = computed(() => {
  if (hasTypedScheme.value || !props.request.url.trim()) return ''
  const host = props.request.url.trim().split(/[/#?]/)[0].toLowerCase()
  const hnp = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.slice(0, host.lastIndexOf(':'))
  const isLocal =
    hnp === 'localhost' ||
    hnp.startsWith('127.') ||
    hnp === '[::1]' ||
    hnp === '::1' ||
    hnp === '0.0.0.0' ||
    hnp.endsWith('.local') ||
    host.startsWith(':')
  return isLocal ? 'http://' : 'https://'
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !props.sending) emit('send')
}

const inputEl = ref<HTMLInputElement | null>(null)
const mirrorEl = ref<HTMLElement | null>(null)
function syncScroll() {
  const el = inputEl.value
  if (el && mirrorEl.value) mirrorEl.value.style.transform = `translateX(${-el.scrollLeft}px)`
}
</script>

<template>
  <div class="ub">
    <MethodPicker v-model="request.method" />
    <div class="ub-box">
      <span v-if="hintScheme" class="ub-scheme" aria-hidden="true">{{ hintScheme }}</span>
      <pre
        ref="mirrorEl"
        class="ub-mirror"
        aria-hidden="true"
        :style="{ paddingInlineStart: hintScheme ? 'calc(10px + 8ch)' : '10px' }"
        >{{ request.url }}</pre
      >
      <input
        ref="inputEl"
        class="ub-in"
        v-model="request.url"
        spellcheck="false"
        autocomplete="off"
        :style="{ paddingInlineStart: hintScheme ? 'calc(10px + 8ch)' : '10px' }"
        :placeholder="L.request.urlPlaceholder"
        @keydown="onKey"
        @scroll="syncScroll"
      />
    </div>
    <button class="icon-btn" :title="L.request.save" @click="emit('save')">
      <Save :size="14" />
    </button>
    <button v-if="sending" class="btn btn-danger ub-send" @click="emit('cancel')">
      <X :size="13" /> {{ L.request.cancel }}
    </button>
    <button v-else class="btn btn-primary ub-send" @click="emit('send')">
      <Loader2 v-if="sending" :size="13" class="spin" />
      <Send v-else :size="13" /> {{ L.request.send }}
    </button>
  </div>
</template>

<style scoped>
.ub {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 8px;
}
.ub-box {
  position: relative;
  flex: 1;
  min-width: 0;
  height: var(--urlbar-h);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  transition: border-color var(--ease);
  overflow: hidden;
}
.ub-box:focus-within {
  border-color: var(--brand);
}
.ub-scheme,
.ub-mirror,
.ub-in {
  font-family: var(--mono);
  font-size: 13px;
  line-height: var(--urlbar-h);
  white-space: nowrap;
}
.ub-scheme {
  position: absolute;
  inset: 0 auto 0 10px;
  color: var(--text-faint);
  pointer-events: none;
  width: 8ch;
}
.ub-mirror {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0 10px;
  box-sizing: border-box;
  color: var(--text);
  overflow: hidden;
  pointer-events: none;
  will-change: transform;
}
.ub-in {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0 10px;
  box-sizing: border-box;
  border: none;
  background: transparent;
  color: transparent;
  caret-color: var(--brand);
  outline: none;
}
.ub-in::placeholder {
  color: var(--text-faint);
}
.ub-send {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
