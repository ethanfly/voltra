// 标签页 store：每个标签持有独立的 Request 对象（互不串数据）
// dirty 表示"已保存过的请求被修改"或"未保存的新请求"，UI 显示圆点
import { reactive, computed, ref } from 'vue'
import type { ID, Request, HTTPResponse, WSMessageEvent } from '../types/models'
import { uid, newRequest, cloneDeep } from '../types/models'
import { scheduleSave, flushNow } from '../lib/persist'
import { WSService } from '../api/backend'
import { findRequest, currentProject, findNode, addRequest } from './workspace'
import { closeVarPage } from './ui-state'

export interface LiveTab {
  tabId: ID
  request: Request
  dirty: boolean
  /** 该请求是否已归属到树中（request.id 能 findRequest 到） */
  savedInTree: boolean
}

export const tabs = reactive({
  tabs: [] as LiveTab[],
  activeTabId: null as ID | null,
})

// 每标签的运行时状态（不持久化）
export const responses = reactive<Record<ID, HTTPResponse | null>>({})
export const wsConnIds = reactive<Record<ID, string>>({})
export const inFlight = reactive<Record<ID, { cancel: () => void } | null>>({})
// 发送并下载：独立于 inFlight（下载含原生保存对话框，UI 单独显示下载中/可取消）
export const downloads = reactive<Record<ID, { cancel: () => void } | null>>({})

/** ws 日志条目：消息帧 / 系统状态行（连接/重连/断开） */
export type WsLogItem =
  | { kind: 'msg'; msg: WSMessageEvent }
  | { kind: 'sys'; status: string; detail?: string; timestamp: number }
export const wsLogs = reactive<Record<ID, WsLogItem[]>>({})
export const wsStatuses = reactive<Record<ID, string>>({})

export const activeTab = computed(
  () => tabs.tabs.find((t) => t.tabId === tabs.activeTabId) ?? null,
)

export const activeRequest = computed(() => activeTab.value?.request ?? null)

function isSavedInTree(request: Request): boolean {
  return findRequest(request.id) !== null
}

/**
 * 打开一个请求：若已有同 request.id 的标签则直接激活；否则新建标签
 * fromHistory=true 时即使同 id 也新开一个标签（还原历史，不影响原标签）
 */
export function openRequest(request: Request, opts?: { fromHistory?: boolean }): LiveTab {
  if (!opts?.fromHistory) {
    const existing = tabs.tabs.find((t) => t.request.id === request.id)
    if (existing) {
      tabs.activeTabId = existing.tabId
      closeVarPage()
      return existing
    }
  }
  // 历史还原的是快照副本（即使原请求仍在树中），按未保存处理，Cmd+S 另存
  const tab: LiveTab = {
    tabId: uid(),
    request,
    dirty: false,
    savedInTree: opts?.fromHistory ? false : isSavedInTree(request),
  }
  tabs.tabs.push(tab)
  tabs.activeTabId = tab.tabId
  closeVarPage()
  scheduleSave('ui')
  return tab
}

/** 新建空请求标签（未保存，dirty=true） */
export function newEmptyRequest(protocol: 'http' | 'ws' = 'http'): LiveTab {
  const req = newRequest({ protocol, name: protocol === 'ws' ? '新建 WebSocket' : '新建请求' })
  const tab = openRequest(req)
  tab.dirty = true
  tab.savedInTree = false
  return tab
}

export function setActiveTab(tabId: ID) {
  if (tabs.tabs.some((t) => t.tabId === tabId)) {
    tabs.activeTabId = tabId
    closeVarPage() // 点任意请求标签即回到请求视图（变量整页打开时）
    scheduleSave('ui')
  }
}

export function closeTab(tabId: ID) {
  const i = tabs.tabs.findIndex((t) => t.tabId === tabId)
  if (i < 0) return
  const wasActive = tabs.activeTabId === tabId
  tabs.tabs.splice(i, 1)
  delete responses[tabId]
  // 关掉该标签的活跃 WS 连接（Go 侧中止重连），再清运行时状态
  const cid = wsConnIds[tabId]
  if (cid) void WSService.Close(cid).catch(() => {})
  delete wsConnIds[tabId]
  delete wsLogs[tabId]
  delete wsStatuses[tabId]
  delete inFlight[tabId]
  delete downloads[tabId]
  if (wasActive) {
    tabs.activeTabId = tabs.tabs[Math.min(i, tabs.tabs.length - 1)]?.tabId ?? null
  }
  scheduleSave('ui')
}

/** 中键关闭 / 右键关闭走这里；dirty 确认逻辑在 UI 层 */
export function markDirty(tabId: ID) {
  const t = tabs.tabs.find((x) => x.tabId === tabId)
  if (t) t.dirty = true
}

export function markSaved(tabId: ID) {
  const t = tabs.tabs.find((x) => x.tabId === tabId)
  if (t) {
    t.dirty = false
    t.savedInTree = true
  }
}

/** 拖拽排序：fromIdx 移到 toIdx */
export function moveTab(fromIdx: number, toIdx: number) {
  if (fromIdx === toIdx) return
  if (fromIdx < 0 || fromIdx >= tabs.tabs.length) return
  const [t] = tabs.tabs.splice(fromIdx, 1)
  tabs.tabs.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, t)
  scheduleSave('ui')
}

// ---------- 批量关闭（标签右键菜单用） ----------
export function closeTabsToLeft(tabId: ID) {
  const i = tabs.tabs.findIndex((t) => t.tabId === tabId)
  if (i < 0) return
  tabs.tabs.slice(0, i).map((t) => t.tabId).forEach(closeTab)
}
export function closeTabsToRight(tabId: ID) {
  const i = tabs.tabs.findIndex((t) => t.tabId === tabId)
  if (i < 0) return
  tabs.tabs.slice(i + 1).map((t) => t.tabId).forEach(closeTab)
}
export function closeOtherTabs(tabId: ID) {
  tabs.tabs
    .filter((t) => t.tabId !== tabId)
    .map((t) => t.tabId)
    .forEach(closeTab)
}

// ---------- 保存（标签右键菜单 / Cmd+S / 保存按钮共用） ----------
// 未归属树的请求 → 置 saveToTabId，由 App.vue 统一渲染"保存到集合"对话框
export const saveToTabId = ref<ID | null>(null)

export function saveTab(tabId: ID) {
  const t = tabs.tabs.find((x) => x.tabId === tabId)
  if (!t) return
  if (t.savedInTree) {
    void flushNow('projects').then(() => markSaved(tabId))
  } else {
    saveToTabId.value = tabId
  }
}

export function doSaveTo(tabId: ID, name: string, targetId: ID) {
  const p = currentProject.value
  if (!p) return
  const t = tabs.tabs.find((x) => x.tabId === tabId)
  if (!t) return
  // 目标可能是集合（findNode 只查集合内部），先按集合匹配
  let target = p.collections.find((c) => c.id === targetId) ?? null
  if (!target) {
    const n = findNode(p, targetId)
    if (n && n.kind !== 'request') target = n
  }
  if (!target) return
  // 克隆为新树节点（新 id），把当前标签切换到树节点（后续编辑直接落盘）
  const clone = cloneDeep(t.request)
  clone.id = uid()
  clone.name = name
  const node = addRequest(target, clone)
  t.request = node
  t.savedInTree = true
  markSaved(tabId)
  saveToTabId.value = null
}
