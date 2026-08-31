<script setup lang="ts">
// WS 时间线：气泡（收到左/发出右/系统居中）+ JSON 自动格式化 + 二进制 hex 摘要
// + 心跳标记 + 过滤（文本/方向/隐藏心跳）+ 清空 + 导出 JSON
import { computed, ref, watch } from 'vue'
import { Search, Trash2, Download, Zap } from 'lucide-vue-next'
import Segmented from '../common/Segmented.vue'
import { wsLogs } from '../../stores/tabs'
import { StorageService } from '../../api/backend'
import { prettyJson, binaryHexSummary } from '../../lib/format'
import { t } from '../../locales/zh-CN'
import type { LiveTab } from '../../stores/tabs'

const props = defineProps<{ tab: LiveTab }>()
const L = computed(() => t())

const items = computed(() => wsLogs[props.tab.tabId] ?? [])

const filter = ref('')
const dir = ref<'all' | 'in' | 'out'>('all')
const hideHb = ref(false)

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return items.value.filter((it) => {
    if (it.kind === 'sys') return !q
    const m = it.msg
    if (hideHb.value && m.isHeartbeat) return false
    if (dir.value !== 'all' && m.direction !== dir.value) return false
    if (q && !m.message.toLowerCase().includes(q)) return false
    return true
  })
})

const dirOptions = computed(() => [
  { value: 'all', label: L.value.ws.all },
  { value: 'in', label: L.value.ws.incoming },
  { value: 'out', label: L.value.ws.outgoing },
])

function onClear() {
  const log = wsLogs[props.tab.tabId]
  if (log) log.length = 0
}

async function onExport() {
  const msgs = shown.value
    .filter((it) => it.kind === 'msg')
    .map((it) => (it.kind === 'msg' ? it.msg : null))
    .filter((x) => x !== null)
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const name = `ws-log-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
  await StorageService.SaveFile(name, JSON.stringify(msgs, null, 2))
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 文本消息：JSON 则格式化，二进制（base64）则 hex 摘要 */
function displayOf(msg: { message: string; isBinary: boolean; isBase64: boolean }): {
  text: string
  json: boolean
  binary: boolean
} {
  if (msg.isBinary || msg.isBase64) {
    return { text: binaryHexSummary(msg.message), json: false, binary: true }
  }
  const pretty = prettyJson(msg.message)
  return pretty !== null ? { text: pretty, json: true, binary: false } : { text: msg.message, json: false, binary: false }
}

// 新消息到底部自动滚动
const listEl = ref<HTMLElement | null>(null)
watch(
  () => items.value.length,
  () => {
    const el = listEl.value
    if (el) el.scrollTop = el.scrollHeight
  },
)
</script>

<template>
  <div class="wt">
    <div class="wt-bar">
      <div class="wt-filter">
        <Search :size="12" />
        <input v-model="filter" :placeholder="L.ws.filterPlaceholder" />
      </div>
      <Segmented :options="dirOptions" :model-value="dir" @update:model-value="dir = $event as 'all' | 'in' | 'out'" />
      <label class="wt-hb">
        <input type="checkbox" v-model="hideHb" />
        {{ L.ws.hideHeartbeat }}
      </label>
      <div class="wt-flex"></div>
      <button class="icon-btn" :title="L.ws.clear" @click="onClear">
        <Trash2 :size="13" />
      </button>
      <button class="icon-btn" :title="L.ws.export" @click="onExport">
        <Download :size="13" />
      </button>
    </div>

    <div ref="listEl" class="wt-list">
      <div v-if="shown.length === 0" class="wt-empty">{{ items.length === 0 ? L.ws.noMessages : L.ws.filter }}</div>
      <template v-for="(it, i) in shown" :key="i">
        <div v-if="it.kind === 'sys'" class="wt-sys">
          [{{ it.status }}] {{ it.detail ?? '' }}
        </div>
        <div v-else :class="['wt-row', it.msg.direction === 'out' ? 'wt-out' : 'wt-in']">
          <div :class="['wt-bubble', it.msg.isHeartbeat ? 'wt-hb-msg' : '']">
            <span v-if="it.msg.isHeartbeat" class="wt-hb-tag">
              <Zap :size="10" /> {{ L.ws.heartbeatTag }}
            </span>
            <pre v-if="displayOf(it.msg).json" class="wt-json">{{ displayOf(it.msg).text }}</pre>
            <code v-else-if="displayOf(it.msg).binary" class="wt-hex">{{ displayOf(it.msg).text }}</code>
            <span v-else class="wt-text">{{ displayOf(it.msg).text }}</span>
            <span class="wt-time">{{ fmtTime(it.msg.timestamp) }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wt {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}
.wt-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  flex-wrap: wrap;
}
.wt-filter {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-sunken);
  color: var(--text-faint);
  width: 180px;
}
.wt-filter input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
}
.wt-hb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
}
.wt-hb input {
  accent-color: var(--brand);
  margin: 0;
}
.wt-flex {
  flex: 1;
}
.wt-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wt-empty {
  color: var(--text-faint);
  font-size: 12px;
  text-align: center;
  padding: 20px 0;
}
.wt-sys {
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
  padding: 2px 0;
}
.wt-row {
  display: flex;
}
.wt-out {
  justify-content: flex-end;
}
.wt-bubble {
  max-width: 78%;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-family: var(--mono);
  color: var(--text);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.wt-in .wt-bubble {
  background: var(--bg-sunken);
  border: 1px solid var(--border);
}
.wt-out .wt-bubble {
  background: var(--brand-weak);
  border: 1px solid transparent;
}
.wt-json {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--mono);
  font-size: 12px;
}
.wt-text {
  white-space: pre-wrap;
  word-break: break-all;
}
.wt-hex {
  font-size: 10px;
  color: var(--text-dim);
  word-break: break-all;
}
.wt-hb-msg {
  opacity: 0.65;
}
.wt-hb-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--warn);
  font-family: var(--sans);
}
.wt-time {
  align-self: flex-end;
  font-size: 10px;
  color: var(--text-faint);
}
</style>
