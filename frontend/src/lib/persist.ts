// 持久化：启动加载（bootstrap）+ 防抖落盘（scheduleSave/flushAll）
//
// bootstrap 顺序（任一步异常都吞掉降级为空，绝不崩）：
//   Settings → Projects（解析失败 → QuarantineCorruptFile → []）
//   → 迁移（projects 为空 && 旧 collections.json 非空 → 包一个默认 Project → BackupFile）
//   → Environments（全局变量）→ History → UIState
import { StorageService } from '../api/backend'
import type {
  Project,
  Variable,
  HistoryEntry,
  AppSettings,
  UIState,
  Collection,
  TreeNode,
} from '../types/models'
import { defaultSettings, newProject, newCollection } from '../types/models'
import { workspace, findRequest } from '../stores/workspace'
import { env } from '../stores/env'
import { historyStore } from '../stores/history'
import { settings, applyTheme, initThemeWatcher } from '../stores/settings'
import { uiState, SIDEBAR_MIN, SIDEBAR_MAX } from '../stores/ui-state'
import { tabs } from '../stores/tabs'

// ---------- 小工具 ----------

function tryParse<T>(raw: string, fallback: T): T {
  if (!raw || !raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function quarantine(filename: string) {
  try {
    await StorageService.QuarantineCorruptFile(filename)
  } catch {
    /* 隔离失败也不影响启动 */
  }
}

// ---------- 启动加载 ----------

let bootstrapped = false

export async function bootstrap(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true

  // 1. 设置
  try {
    const raw = await StorageService.LoadSettings()
    const parsed = tryParse<Partial<AppSettings>>(raw, {})
    if (raw && raw.trim() && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
      await quarantine('settings.json')
    } else {
      Object.assign(settings, defaultSettings(), parsed)
    }
  } catch {
    /* 保持默认 */
  }
  initThemeWatcher()
  applyTheme()

  // 2. 项目（含旧 collections.json 迁移）
  try {
    const raw = await StorageService.LoadProjects()
    const parsed = tryParse<Project[]>(raw, null as unknown as Project[])
    if (raw && raw.trim() && (!Array.isArray(parsed))) {
      await quarantine('projects.json')
      workspace.projects = []
    } else if (Array.isArray(parsed)) {
      workspace.projects = parsed
    }
  } catch {
    workspace.projects = []
  }

  if (workspace.projects.length === 0) {
    await migrateLegacyCollections()
  }
  if (!workspace.currentProjectId) {
    workspace.currentProjectId = workspace.projects[0]?.id ?? null
  }

  // 3. 全局变量（environments.json）
  try {
    const raw = await StorageService.LoadEnvironments()
    const parsed = tryParse<Variable[]>(raw, null as unknown as Variable[])
    if (raw && raw.trim() && !Array.isArray(parsed)) {
      await quarantine('environments.json')
    } else if (Array.isArray(parsed)) {
      env.globalVars = parsed
    }
  } catch {
    env.globalVars = []
  }

  // 4. 历史
  try {
    const raw = await StorageService.LoadHistory()
    const parsed = tryParse<HistoryEntry[]>(raw, null as unknown as HistoryEntry[])
    if (raw && raw.trim() && !Array.isArray(parsed)) {
      await quarantine('history.json')
    } else if (Array.isArray(parsed)) {
      historyStore.entries = parsed
    }
  } catch {
    historyStore.entries = []
  }

  // 5. UI 状态
  try {
    const raw = await StorageService.LoadUIState()
    const st = tryParse<Partial<UIState>>(raw, {})
    if (raw && raw.trim() && (st === null || typeof st !== 'object' || Array.isArray(st))) {
      await quarantine('ui-state.json')
    } else {
      if (st.currentProjectId && workspace.projects.some((p) => p.id === st.currentProjectId)) {
        workspace.currentProjectId = st.currentProjectId
      }
      if (Array.isArray(st.openTabs)) {
        for (const t of st.openTabs) {
          if (t && t.tabId && t.request) {
            tabs.tabs.push({
              tabId: t.tabId,
              request: t.request,
              dirty: false,
              savedInTree: findRequest(t.request.id) !== null,
            })
          }
        }
      }
      const hasActive = tabs.tabs.some((t) => t.tabId === st.activeTabId)
      tabs.activeTabId = hasActive ? (st.activeTabId ?? null) : (tabs.tabs[0]?.tabId ?? null)
      if (typeof st.sidebarWidth === 'number') {
        uiState.sidebarWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, st.sidebarWidth))
      }
      if (typeof st.splitRatio === 'number') {
        uiState.splitRatio = Math.min(0.9, Math.max(0.1, st.splitRatio))
      }
      if (Array.isArray(st.expandedNodeIds)) uiState.expandedNodeIds = st.expandedNodeIds
      if (Array.isArray(st.wsSnippets)) uiState.wsSnippets = st.wsSnippets
    }
  } catch {
    /* 保持默认 */
  }
}

/** 旧版 collections.json（TreeNode[] 或 {items}）→ 包进一个默认 Project 的集合里 */
async function migrateLegacyCollections() {
  let legacy = ''
  try {
    legacy = await StorageService.LoadCollections()
  } catch {
    return
  }
  if (!legacy || !legacy.trim() || legacy.trim() === '[]') return
  const parsed = tryParse<TreeNode[] | { items: TreeNode[] }>(legacy, null as unknown as TreeNode[])
  if (parsed === null) {
    await quarantine('collections.json')
    return
  }
  const items: TreeNode[] = Array.isArray(parsed) ? parsed : (parsed.items ?? [])
  const coll: Collection = newCollection({ name: '导入的集合', items })
  const p: Project = newProject({ name: '导入的项目', collections: [coll] })
  workspace.projects = [p]
  workspace.currentProjectId = p.id
  try {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    await StorageService.BackupFile('collections.json', `.migrated-${stamp}`)
    await StorageService.SaveProjects(JSON.stringify(workspace.projects))
  } catch {
    /* 迁移落盘失败：内存里已有数据，下次启动再试 */
  }
}

// ---------- 防抖落盘 ----------

export type SaveKind = 'projects' | 'env' | 'history' | 'settings' | 'ui'

const timers = new Map<SaveKind, number>()
const pending = new Set<SaveKind>()

const DEFAULT_DEBOUNCE_MS = 500
const UI_DEBOUNCE_MS = 1000

export function scheduleSave(kind: SaveKind) {
  const delay = kind === 'ui' ? UI_DEBOUNCE_MS : DEFAULT_DEBOUNCE_MS
  const old = timers.get(kind)
  if (old !== undefined) window.clearTimeout(old)
  pending.add(kind)
  timers.set(
    kind,
    window.setTimeout(() => {
      void flushSave(kind)
    }, delay),
  )
}

export function collectUIState(): UIState {
  return {
    currentProjectId: workspace.currentProjectId,
    openTabs: tabs.tabs.map((t) => ({ tabId: t.tabId, request: t.request })),
    activeTabId: tabs.activeTabId,
    sidebarWidth: uiState.sidebarWidth,
    splitRatio: uiState.splitRatio,
    expandedNodeIds: uiState.expandedNodeIds,
    wsSnippets: uiState.wsSnippets,
  }
}

async function flushSave(kind: SaveKind) {
  timers.delete(kind)
  pending.delete(kind)
  try {
    switch (kind) {
      case 'projects':
        await StorageService.SaveProjects(JSON.stringify(workspace.projects))
        break
      case 'env':
        await StorageService.SaveEnvironments(JSON.stringify(env.globalVars))
        break
      case 'history':
        await StorageService.SaveHistory(JSON.stringify(historyStore.entries))
        break
      case 'settings':
        await StorageService.SaveSettings(JSON.stringify(settings))
        break
      case 'ui':
        await StorageService.SaveUIState(JSON.stringify(collectUIState()))
        break
    }
  } catch (e) {
    console.error(`[persist] 保存 ${kind} 失败`, e)
  }
}

/** 立即落盘所有待保存项（退出前 / 用户主动保存时调用） */
export async function flushAll() {
  const kinds = [...new Set<SaveKind>([...timers.keys(), ...pending])]
  for (const k of kinds) {
    const t = timers.get(k)
    if (t !== undefined) window.clearTimeout(t)
    await flushSave(k)
  }
}

// 退出兜底（Wails 桌面窗口关闭会触发 beforeunload，异步尽力而为）
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void flushAll()
  })
}
