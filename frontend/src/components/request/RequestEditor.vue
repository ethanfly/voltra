<script setup lang="ts">
// 请求编辑器容器：UrlBar + 六个编辑页（Params/Headers/Body/Auth/Scripts/Settings）
// 深监听 request 变化 → dirty 圆点 + 已归属树的请求自动 debounce 落盘
// Cmd+S（window capture，抢在 CM6 之前）：已归属 → 立即落盘；未归属 → SaveToDialog
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import UrlBar from './UrlBar.vue'
import ParamsTab from './ParamsTab.vue'
import HeadersTab from './HeadersTab.vue'
import BodyTab from './BodyTab.vue'
import AuthTab from './AuthTab.vue'
import ScriptsTab from './ScriptsTab.vue'
import SettingsTab from './SettingsTab.vue'
import SaveToDialog from '../tree/SaveToDialog.vue'
import { tabs, markDirty, markSaved, responses } from '../../stores/tabs'
import { currentProject, findNode, addRequest } from '../../stores/workspace'
import { scheduleSave, flushNow } from '../../lib/persist'
import { sendRequest, cancelRequest, isSending } from '../../lib/send'
import { uid, cloneDeep } from '../../types/models'
import type { LiveTab } from '../../stores/tabs'
import type { ID } from '../../types/models'
import { t } from '../../locales/zh-CN'

const props = defineProps<{ tab: LiveTab }>()

const L = computed(() => t())

// 每个 LiveTab 记住自己停留在哪个编辑页（不持久化）
// 必须 reactive(new Map())：普通 Map 的 get/set 不被 Vue 追踪，
// computed setter 写入后不会触发重渲染——点 tab 看似没反应（实测 bug）
const editorTabByTabId = reactive(new Map<ID, string>())
const activeEditTab = computed<string>({
  get: () => editorTabByTabId.get(props.tab.tabId) ?? 'params',
  set: (v) => editorTabByTabId.set(props.tab.tabId, v),
})

const editTabs = computed(() => {
  const r = props.tab.request
  const pc = r.params.filter((p) => p.enabled).length
  const hc = r.headers.filter((h) => h.enabled).length
  return [
    { id: 'params', label: L.value.request.tabs.params, count: pc },
    { id: 'headers', label: L.value.request.tabs.headers, count: hc },
    { id: 'body', label: L.value.request.tabs.body, count: 0 },
    { id: 'auth', label: L.value.request.tabs.auth, count: 0 },
    { id: 'scripts', label: L.value.request.tabs.scripts, count: 0 },
    { id: 'settings', label: L.value.request.tabs.settings, count: 0 },
  ]
})

// ---------- 编辑 → dirty + 落盘 ----------
// request 对象引用变化 = 切标签 / 保存后换绑树节点，不算编辑
watch(
  () => props.tab.request,
  (newReq, oldReq) => {
    if (oldReq && newReq !== oldReq) return
    markDirty(props.tab.tabId)
    if (props.tab.savedInTree) scheduleSave('projects')
  },
  { deep: true },
)

// ---------- 发送 ----------
const sending = computed(() => isSending(props.tab.tabId))

async function onSend() {
  try {
    const resp = await sendRequest(props.tab.tabId)
    responses[props.tab.tabId] = resp
  } catch (e) {
    console.error('send failed', e)
    // 异常也进响应区（错误卡），不能只打 console——否则响应区永远空着，用户以为没发送
    responses[props.tab.tabId] = {
      statusCode: 0,
      status: '',
      headers: [],
      body: '',
      bodyEncoding: 'utf8',
      contentType: '',
      sizeBytes: 0,
      durationMs: 0,
      error: e instanceof Error ? e.message : String(e),
      errorKind: 'other',
      timings: { dnsMs: 0, tcpMs: 0, tlsMs: 0, ttfbMs: 0, downloadMs: 0 },
    }
  }
}
function onCancel() {
  cancelRequest(props.tab.tabId)
}

// ---------- 保存 ----------
const saveTo = ref(false)

function onSave() {
  if (props.tab.savedInTree) {
    void flushNow('projects')
    markSaved(props.tab.tabId)
  } else {
    saveTo.value = true
  }
}

function doSaveTo(name: string, targetId: ID) {
  const p = currentProject.value
  if (!p) return
  // 目标可能是集合（findNode 只查集合内部），先按集合匹配
  let target = p.collections.find((c) => c.id === targetId) ?? null
  if (!target) {
    const n = findNode(p, targetId)
    if (n && n.kind !== 'request') target = n
  }
  if (!target) return
  // 克隆为新树节点（新 id），把当前标签切换到树节点（后续编辑直接落盘）
  const clone = cloneDeep(props.tab.request)
  clone.id = uid()
  clone.name = name
  const node = addRequest(target, clone)
  const t = tabs.tabs.find((x) => x.tabId === props.tab.tabId)
  if (!t) return
  t.request = node
  t.savedInTree = true
  markSaved(t.tabId)
}

// ---------- Cmd+S（capture 阶段抢在编辑器内部 keymap 前） ----------
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
  <div class="re">
    <UrlBar
      :request="tab.request"
      :sending="sending"
      @send="onSend"
      @cancel="onCancel"
      @save="onSave"
    />

    <div class="re-tabs">
      <button
        v-for="et in editTabs"
        :key="et.id"
        :class="['re-tab', { active: activeEditTab === et.id }]"
        @click="activeEditTab = et.id"
      >
        {{ et.label }}
        <span v-if="et.count > 0" class="re-tab-count">{{ et.count }}</span>
      </button>
    </div>

    <div class="re-body">
      <ParamsTab v-if="activeEditTab === 'params'" :request="tab.request" />
      <HeadersTab v-else-if="activeEditTab === 'headers'" :request="tab.request" />
      <BodyTab v-else-if="activeEditTab === 'body'" :request="tab.request" />
      <AuthTab v-else-if="activeEditTab === 'auth'" :request="tab.request" />
      <ScriptsTab v-else-if="activeEditTab === 'scripts'" :request="tab.request" />
      <SettingsTab v-else :request="tab.request" />
    </div>

    <SaveToDialog v-if="saveTo" :name="tab.request.name" @save="doSaveTo" @close="saveTo = false" />
  </div>
</template>

<style scoped>
.re {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.re-tabs {
  display: flex;
  gap: 2px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
}
.re-tab {
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
  transition: color var(--ease);
}
.re-tab:hover {
  color: var(--text);
}
.re-tab.active {
  color: var(--text);
  border-bottom-color: var(--brand);
}
.re-tab-count {
  font-size: 10px;
  background: var(--bg-sunken);
  border-radius: 8px;
  padding: 0 5px;
  color: var(--text-faint);
}
.re-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.re-body :deep(.ce) {
  flex: 1;
  min-height: 0;
}
</style>
