// 历史 store：倒序 + 上限裁剪 + 日期分组 + 清空
import { describe, it, expect, beforeEach } from 'vitest'
import { historyStore, addHistory, clearHistory, grouped } from '../src/stores/history'
import { settings } from '../src/stores/settings'
import { newRequest, uid } from '../src/types/models'
import type { HistoryEntry } from '../src/types/models'

function entry(name: string, sentAt: number, statusCode = 200): HistoryEntry {
  return {
    id: uid(),
    requestSnapshot: newRequest({ name, url: `https://example.com/${name}`, protocol: 'http' }),
    responseSummary: { statusCode, durationMs: 10, sizeBytes: 100 },
    sentAt,
  }
}

const now = Date.now()
const dayMs = 24 * 3600 * 1000

beforeEach(() => {
  clearHistory()
  settings.historyLimit = 500
})

describe('addHistory', () => {
  it('最新的在前', () => {
    addHistory(entry('a', now - 2000))
    addHistory(entry('b', now - 1000))
    addHistory(entry('c', now))
    expect(historyStore.entries.map((e) => e.requestSnapshot.name)).toEqual(['c', 'b', 'a'])
  })

  it('超过上限裁剪最旧（默认 500）', () => {
    for (let i = 0; i < 502; i++) addHistory(entry(`r${i}`, now - (502 - i) * 1000))
    expect(historyStore.entries).toHaveLength(500)
    // 最旧的 r0/r1 被裁掉，最新保留
    expect(historyStore.entries[0].requestSnapshot.name).toBe('r501')
    expect(historyStore.entries.some((e) => e.requestSnapshot.name === 'r0')).toBe(false)
  })

  it('尊重设置的上限', () => {
    settings.historyLimit = 3
    addHistory(entry('a', now - 3000))
    addHistory(entry('b', now - 2000))
    addHistory(entry('c', now - 1000))
    addHistory(entry('d', now))
    expect(historyStore.entries.map((e) => e.requestSnapshot.name)).toEqual(['d', 'c', 'b'])
  })

  it('上限 0 表示用默认 500', () => {
    settings.historyLimit = 0
    expect(historyStore.entries).toHaveLength(0)
    addHistory(entry('a', now))
    expect(historyStore.entries).toHaveLength(1)
  })
})

function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('grouped', () => {
  it('今天/昨天/更早 分组，组内倒序', () => {
    addHistory(entry('old', now - 3 * dayMs))
    addHistory(entry('y2', now - dayMs - 1800 * 1000))
    addHistory(entry('y1', now - dayMs - 600 * 1000))
    addHistory(entry('t1', now - 300 * 1000))
    addHistory(entry('t2', now))
    const g = grouped.value
    expect(g.map((x) => x.label)).toEqual(['今天', '昨天', fmtLocal(new Date(now - 3 * dayMs))])
    expect(g[0].entries.map((e) => e.requestSnapshot.name)).toEqual(['t2', 't1'])
    expect(g[1].entries.map((e) => e.requestSnapshot.name)).toEqual(['y1', 'y2'])
  })

  it('空历史无分组', () => {
    expect(grouped.value).toEqual([])
  })
})

describe('clearHistory', () => {
  it('清空全部', () => {
    addHistory(entry('a', now))
    clearHistory()
    expect(historyStore.entries).toEqual([])
  })
})
