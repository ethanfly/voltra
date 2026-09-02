<script setup lang="ts">
// WS 请求区：WS 青标 + URL（变量高亮）+ 保存 + 连接/断开 + 状态灯
// + 握手请求头（KvEditor，支持变量/继承）+ 自动重连/心跳开关（WS-2/3）
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Save, Loader2 } from 'lucide-vue-next'
import KvEditor from '../common/KvEditor.vue'
import { WSService } from '../../api/backend'
import { wsConnIds, wsStatuses, wsLogs, markDirty, saveTab } from '../../stores/tabs'
import { resolveAll } from '../../stores/env'
import { mergedHeaders } from '../../lib/send'
import { scheduleSave } from '../../lib/persist'
import { missingIn, varTitle } from '../../lib/var-ui'
import { t } from '../../locales/zh-CN'
import type { LiveTab } from '../../stores/tabs'

const props = defineProps<{ tab: LiveTab }>()
const L = computed(() => t())

const connId = computed(() => wsConnIds[props.tab.tabId] ?? '')
const connecting = ref(false)

type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed'
const status = computed<Status>(() => {
  if (connecting.value) return 'connecting'
  if (!connId.value) return 'idle'
  return (wsStatuses[props.tab.tabId] as Status) ?? 'connecting'
})
const statusText = computed(() => {
  const map: Record<Status, string> = {
    idle: L.value.ws.notConnected,
    connecting: L.value.ws.connecting,
    connected: L.value.ws.connected,
    reconnecting: L.value.ws.reconnecting,
    error: L.value.ws.error,
    closed: L.value.ws.closed,
  }
  return map[status.value]
})

async function onConnect() {
  const req = props.tab.request
  if (!req.url.trim() || connecting.value) return
  const url = resolveAll(req, req.url).text
  const headers = mergedHeaders(req)
    .filter((h) => h.enabled)
    .map((h) => ({
      key: resolveAll(req, h.key).text,
      value: resolveAll(req, h.value).text,
      enabled: true,
    }))
  connecting.value = true
  try {
    const id = await WSService.Connect(url, headers, {
      autoReconnect: autoReconnect.value,
      reconnectIntervalMs: 3000,
      heartbeatEnabled: heartbeat.value,
      heartbeatIntervalMs: 30000,
      heartbeatMessage: '',
    })
    wsConnIds[props.tab.tabId] = id
    wsStatuses[props.tab.tabId] = 'connecting'
  } catch (e) {
    wsStatuses[props.tab.tabId] = 'error'
    const log = wsLogs[props.tab.tabId] ?? (wsLogs[props.tab.tabId] = [])
    log.push({ kind: 'sys', status: 'error', detail: String(e), timestamp: Date.now() })
  } finally {
    connecting.value = false
  }
}

async function onDisconnect() {
  const cid = connId.value
  if (!cid) return
  await WSService.Close(cid).catch(() => {})
  delete wsConnIds[props.tab.tabId]
}

// ---------- 重连 / 心跳（连接中可运行时切换） ----------
const autoReconnect = ref(false)
const heartbeat = ref(false)
function onToggleReconnect() {
  const cid = connId.value
  if (cid) void WSService.SetAutoReconnect(cid, autoReconnect.value).catch(() => {})
}
function onToggleHeartbeat() {
  const cid = connId.value
  if (cid) void WSService.SetHeartbeat(cid, heartbeat.value).catch(() => {})
}

// ---------- 编辑跟踪 / 保存（与 RequestEditor 同语义） ----------
watch(
  () => props.tab.request,
  (n, o) => {
    if (o && n !== o) return // 切标签/保存换绑不算编辑
    markDirty(props.tab.tabId)
    if (props.tab.savedInTree) scheduleSave('projects')
  },
  { deep: true },
)

function onSave() {
  saveTab(props.tab.tabId)
}

// Cmd+S（仅 ws 标签激活时本组件挂载，捕获阶段拦截 CM6/输入框默认行为）
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    e.stopPropagation()
    onSave()
  }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="we">
    <div class="we-url">
      <span class="we-chip m-WS">WS</span>
      <input
        class="we-in"
        :class="{ 'we-in-bad': missingIn(tab.request.url).length > 0 }"
        v-model="tab.request.url"
        :title="varTitle(tab.request.url)"
        :placeholder="L.ws.urlPlaceholder"
        spellcheck="false"
      />
      <button class="icon-btn" :title="L.request.save" @click="onSave">
        <Save :size="14" />
      </button>
      <button v-if="connId" class="btn btn-danger" @click="onDisconnect">{{ L.ws.disconnect }}</button>
      <button
        v-else
        class="btn btn-primary"
        :disabled="connecting || !tab.request.url.trim()"
        @click="onConnect"
      >
        <Loader2 v-if="connecting" :size="13" class="spin" /> {{ L.ws.connect }}
      </button>
    </div>

    <div class="we-status">
      <span :class="['ws-dot', 'ws-dot-' + status]"></span>
      <span class="we-status-text">{{ statusText }}</span>
      <div class="we-flex"></div>
      <label class="we-tgl">
        <input type="checkbox" v-model="autoReconnect" @change="onToggleReconnect" />
        {{ L.ws.autoReconnect }}
      </label>
      <label class="we-tgl">
        <input type="checkbox" v-model="heartbeat" @change="onToggleHeartbeat" />
        {{ L.ws.heartbeat }}
      </label>
    </div>

    <div class="we-headers">
      <div class="we-sec">{{ L.ws.handshakeHeaders }}</div>
      <KvEditor :model-value="tab.request.headers" :description="true" />
    </div>
  </div>
</template>

<style scoped>
.we {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 4px;
}
.we-url {
  display: flex;
  align-items: center;
  gap: 8px;
}
.we-chip {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.we-in {
  flex: 1;
  min-width: 0;
  height: var(--input-h);
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  color: var(--text);
  font-size: 12px;
  font-family: var(--mono);
  outline: none;
}
.we-in:focus {
  border-color: var(--brand);
}
.we-in-bad {
  color: var(--error);
  text-decoration: underline wavy var(--error);
}
.we-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-dim);
}
.we-status-text {
  color: var(--text-dim);
}
.we-flex {
  flex: 1;
}
.we-tgl {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
}
.we-tgl input {
  accent-color: var(--brand);
  margin: 0;
}
.ws-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-faint);
  flex-shrink: 0;
}
.ws-dot-connecting {
  background: var(--brand);
  animation: ws-pulse 1s ease-in-out infinite;
}
.ws-dot-connected {
  background: var(--ok);
}
.ws-dot-reconnecting {
  background: var(--warn);
  animation: ws-pulse 1s ease-in-out infinite;
}
.ws-dot-error {
  background: var(--error);
}
@keyframes ws-pulse {
  50% {
    opacity: 0.3;
  }
}
.we-headers {
  border-top: 1px solid var(--border);
}
.we-sec {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-faint);
  padding: 8px 12px 0;
}
</style>
