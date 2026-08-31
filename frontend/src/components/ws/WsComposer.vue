<script setup lang="ts">
// WS 发送区：Text / JSON（CM6 + 合法性校验）/ Binary（Base64）
// + 常用片段（下拉插入 / 存当前内容 / 删除）；未连接时禁用发送
import { computed, ref, watch } from 'vue'
import { Send, Bookmark, ListPlus, X } from 'lucide-vue-next'
import Segmented from '../common/Segmented.vue'
import Dropdown from '../common/Dropdown.vue'
import CodeEditor from '../common/CodeEditor.vue'
import { WSService } from '../../api/backend'
import { wsConnIds, wsLogs } from '../../stores/tabs'
import { resolveAll } from '../../stores/env'
import { uiState, addWsSnippet, removeWsSnippet } from '../../stores/ui-state'
import { t } from '../../locales/zh-CN'
import type { LiveTab } from '../../stores/tabs'

const props = defineProps<{ tab: LiveTab }>()
const L = computed(() => t())

const connected = computed(() => !!wsConnIds[props.tab.tabId])

type Mode = 'text' | 'json' | 'binary'
const mode = ref<Mode>('text')
const modeOptions = computed(() => [
  { value: 'text', label: L.value.ws.sendText },
  { value: 'json', label: L.value.ws.sendJson },
  { value: 'binary', label: L.value.ws.sendBinary },
])

const textBuf = ref('')
const jsonBuf = ref('')
const b64Buf = ref('')

const jsonOk = computed(() => {
  const s = jsonBuf.value.trim()
  if (!s) return false
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
})

/** 当前模式的缓冲区（片段插入 / 存片段共用） */
const currentBuf = computed({
  get: () => (mode.value === 'text' ? textBuf.value : mode.value === 'json' ? jsonBuf.value : b64Buf.value),
  set: (v: string) => {
    if (mode.value === 'text') textBuf.value = v
    else if (mode.value === 'json') jsonBuf.value = v
    else b64Buf.value = v
  },
})

const canSend = computed(() => {
  if (!connected.value) return false
  if (mode.value === 'json') return jsonOk.value
  return currentBuf.value.trim().length > 0
})

async function onSend() {
  const cid = wsConnIds[props.tab.tabId]
  if (!cid || !canSend.value) return
  const log = wsLogs[props.tab.tabId] ?? (wsLogs[props.tab.tabId] = [])
  try {
    if (mode.value === 'binary') {
      await WSService.SendBinary(cid, b64Buf.value.trim())
      b64Buf.value = ''
    } else {
      const raw = mode.value === 'text' ? textBuf.value : jsonBuf.value
      await WSService.Send(cid, resolveAll(props.tab.request, raw).text)
      if (mode.value === 'text') textBuf.value = ''
      else jsonBuf.value = ''
    }
  } catch (e) {
    log.push({ kind: 'sys', status: 'error', detail: String(e), timestamp: Date.now() })
  }
}

function onTextKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()
    void onSend()
  }
}

// ---------- 常用片段 ----------
function applySnippet(content: string) {
  currentBuf.value = content
}
function saveSnippet() {
  const s = currentBuf.value
  if (!s.trim()) return
  addWsSnippet(s.slice(0, 12) || L.value.ws.snippet, s)
}
watch(
  () => mode.value,
  (m) => {
    // 切到 JSON 模式时给个最小骨架，方便直接改
    if (m === 'json' && !jsonBuf.value.trim()) jsonBuf.value = '{}'
  },
)
</script>

<template>
  <div class="wc">
    <div class="wc-bar">
      <Segmented :options="modeOptions" :model-value="mode" @update:model-value="mode = $event as Mode" />
      <Dropdown>
        <template #trigger="{ open }">
          <button class="icon-btn" :title="L.ws.snippet" :class="{ on: open }">
            <Bookmark :size="13" />
          </button>
        </template>
        <template #default="{ close }">
          <div class="wc-snip-head">{{ L.ws.snippet }}</div>
          <div v-if="uiState.wsSnippets.length === 0" class="wc-snip-empty">{{ L.ws.emptySnippet }}</div>
          <div
            v-for="s in uiState.wsSnippets"
            :key="s.id"
            class="wc-snip"
            :title="s.content"
            @click="applySnippet(s.content); close()"
          >
            <span class="wc-snip-name">{{ s.name }}</span>
            <button class="wc-snip-x" :title="L.ws.removeSnippet" @click.stop="removeWsSnippet(s.id)">
              <X :size="11" />
            </button>
          </div>
          <div class="wc-snip-foot">
            <button class="btn" :disabled="!currentBuf.trim()" @click="saveSnippet(); close()">
              <ListPlus :size="12" /> {{ L.ws.saveSnippet }}
            </button>
          </div>
        </template>
      </Dropdown>
      <div class="wc-flex"></div>
      <button class="btn btn-primary" :disabled="!canSend" @click="onSend">
        <Send :size="13" /> {{ L.ws.send }}
      </button>
    </div>

    <div class="wc-body">
      <input
        v-if="mode === 'text'"
        v-model="textBuf"
        class="wc-in"
        :placeholder="L.ws.sendPlaceholder"
        @keydown="onTextKey"
      />
      <div v-else-if="mode === 'json'" class="wc-json">
        <CodeEditor v-model="jsonBuf" language="json" :height="88" />
        <span v-if="jsonBuf.trim() && !jsonOk" class="wc-json-bad">{{ L.ws.jsonInvalid }}</span>
      </div>
      <input
        v-else
        v-model="b64Buf"
        class="wc-in wc-in-mono"
        :placeholder="L.ws.binaryHint"
        spellcheck="false"
      />
    </div>
  </div>
</template>

<style scoped>
.wc {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
  padding: 8px 12px 10px;
  gap: 6px;
}
.wc-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wc-flex {
  flex: 1;
}
.wc-body {
  position: relative;
}
.wc-in {
  width: 100%;
  box-sizing: border-box;
  height: var(--input-h);
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  color: var(--text);
  font-size: 12px;
  outline: none;
}
.wc-in:focus {
  border-color: var(--brand);
}
.wc-in-mono {
  font-family: var(--mono);
}
.wc-json {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.wc-json-bad {
  position: absolute;
  right: 8px;
  bottom: 6px;
  font-size: 11px;
  color: var(--error);
}
.wc-snip-head {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-faint);
  padding: 4px 8px;
}
.wc-snip-empty {
  font-size: 12px;
  color: var(--text-faint);
  padding: 4px 8px 8px;
}
.wc-snip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
}
.wc-snip:hover {
  background: var(--bg-sunken);
}
.wc-snip-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
}
.wc-snip-x {
  border: none;
  background: none;
  color: var(--text-faint);
  cursor: pointer;
  display: inline-flex;
  padding: 2px;
  border-radius: var(--radius-sm);
}
.wc-snip-x:hover {
  color: var(--error);
  background: var(--error-weak);
}
.wc-snip-foot {
  padding: 6px 4px 2px;
  border-top: 1px solid var(--border);
}
.wc-snip-foot .btn {
  font-size: 11px;
}
</style>
