// 历史记录 store（history.json，默认上限 500 条，按日期分组倒序展示）
import { reactive, computed } from 'vue'
import type { HistoryEntry } from '../types/models'
import { scheduleSave } from '../lib/persist'
import { settings } from './settings'

export const historyStore = reactive({
  entries: [] as HistoryEntry[],
})

/** 新增一条历史（最新的在前），超过上限裁剪 */
export function addHistory(entry: HistoryEntry) {
  historyStore.entries.unshift(entry)
  const limit = settings.historyLimit > 0 ? settings.historyLimit : 500
  if (historyStore.entries.length > limit) {
    historyStore.entries.length = limit
  }
  scheduleSave('history')
}

export function clearHistory() {
  historyStore.entries = []
  scheduleSave('history')
}

export interface HistoryGroup {
  /** 展示用日期，如 "2026-08-31" / "昨天" */
  label: string
  date: string
  entries: HistoryEntry[]
}

/** 按日期分组（组内保持 sentAt 倒序） */
export const grouped = computed<HistoryGroup[]>(() => {
  const groups: HistoryGroup[] = []
  const byDate = new Map<string, HistoryGroup>()
  const now = new Date()
  const dayMs = 24 * 3600 * 1000
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }
  for (const e of historyStore.entries) {
    const d = new Date(e.sentAt)
    const date = fmt(d)
    let g = byDate.get(date)
    if (!g) {
      const diff = Math.floor((now.getTime() - d.getTime()) / dayMs)
      const label = date === fmt(now) ? '今天' : diff === 1 ? '昨天' : date
      g = { label, date, entries: [] }
      byDate.set(date, g)
      groups.push(g)
    }
    g.entries.push(e)
  }
  return groups
})
