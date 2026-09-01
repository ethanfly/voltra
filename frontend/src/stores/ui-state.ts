// UI 状态 store（ui-state.json：侧栏宽度、分栏比例、展开节点、WS 常用片段）
import { reactive, ref } from 'vue'
import type { ID, WsSnippet } from '../types/models'
import { uid } from '../types/models'
import { scheduleSave } from '../lib/persist'

export type PanelKind = 'collections' | 'history' | 'environments' | 'settings'

/** 侧栏当前面板（不落盘，重启回到 collections） */
export const activePanel = ref<PanelKind>('collections')
/** 侧栏是否折叠（不落盘） */
export const sidebarCollapsed = ref(false)

// ---------- 生成代码抽屉（不落盘） ----------

export const codegenOpen = ref(false)
/** 指定请求节点 id；null = 当前激活标签的请求 */
export const codegenTargetId = ref<ID | null>(null)

export function openCodegen(requestId?: ID) {
  codegenTargetId.value = requestId ?? null
  codegenOpen.value = true
}

export function closeCodegen() {
  codegenOpen.value = false
}

// ---------- 变量/环境编辑整页（主编辑区，替代侧栏里挤占的三级变量表） ----------
// 页面始终显示"当前环境"（env.currentEnvId，标题栏切换）的变量 + 项目级 + 全局变量；
// 这里只记开关，重启后可还原。打开整页时激活的请求标签保持选中，点标签即回到请求视图
export const varPage = reactive({ open: false })

export function openVarPage() {
  if (varPage.open) return
  varPage.open = true
  scheduleSave('ui')
}
export function closeVarPage() {
  if (!varPage.open) return
  varPage.open = false
  scheduleSave('ui')
}

export const SIDEBAR_MIN = 240
export const SIDEBAR_MAX = 480

export const uiState = reactive({
  sidebarWidth: 280,
  splitRatio: 0.5, // 请求区占上半部分的比例（横向分栏时）
  expandedNodeIds: [] as ID[],
  wsSnippets: [] as WsSnippet[],
})

export function setSidebarWidth(w: number) {
  uiState.sidebarWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)))
  scheduleSave('ui')
}

export function setSplitRatio(r: number) {
  uiState.splitRatio = Math.min(0.9, Math.max(0.1, r))
  scheduleSave('ui')
}

export function isExpanded(id: ID): boolean {
  return uiState.expandedNodeIds.includes(id)
}

export function setExpanded(id: ID, expanded: boolean) {
  const i = uiState.expandedNodeIds.indexOf(id)
  if (expanded && i < 0) uiState.expandedNodeIds.push(id)
  if (!expanded && i >= 0) uiState.expandedNodeIds.splice(i, 1)
  scheduleSave('ui')
}

export function toggleExpanded(id: ID) {
  setExpanded(id, !isExpanded(id))
}

// ---------- WS 常用片段（WS-4） ----------

export function addWsSnippet(name: string, content: string): WsSnippet {
  const s: WsSnippet = { id: uid(), name, content }
  uiState.wsSnippets.push(s)
  scheduleSave('ui')
  return s
}

export function removeWsSnippet(id: ID) {
  const i = uiState.wsSnippets.findIndex((s) => s.id === id)
  if (i >= 0) uiState.wsSnippets.splice(i, 1)
  scheduleSave('ui')
}
