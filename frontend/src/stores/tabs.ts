// 标签页 store：每个标签持有独立的 Request 对象（互不串数据）
// dirty 表示"已保存过的请求被修改"或"未保存的新请求"，UI 显示圆点
import { reactive, computed } from 'vue'
import type { ID, Request, HTTPResponse } from '../types/models'
import { uid, newRequest } from '../types/models'
import { scheduleSave } from '../lib/persist'
import { findRequest } from './workspace'

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
      return existing
    }
  }
  const tab: LiveTab = {
    tabId: uid(),
    request,
    dirty: false,
    savedInTree: isSavedInTree(request),
  }
  tabs.tabs.push(tab)
  tabs.activeTabId = tab.tabId
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
    scheduleSave('ui')
  }
}

export function closeTab(tabId: ID) {
  const i = tabs.tabs.findIndex((t) => t.tabId === tabId)
  if (i < 0) return
  const wasActive = tabs.activeTabId === tabId
  tabs.tabs.splice(i, 1)
  delete responses[tabId]
  delete wsConnIds[tabId]
  delete inFlight[tabId]
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
