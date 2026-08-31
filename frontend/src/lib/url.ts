// URL 工具（纯函数）：scheme 补全预览、URL ↔ Query 表格双向同步
// 注意：normalizeUrlPreview 与 Go 侧 services/http_service.go 的 normalizeURL 规则一致，
// 前者只用于输入框实时预览，真正发送时的补全以 Go 侧为准
import type { KVPair } from '../types/models'

/** 与 Go 侧 hostWithoutPort 一致：localhost:3000 → localhost、[::1]:8080 → [::1] */
function hostWithoutPort(h: string): string {
  if (h.startsWith('[')) {
    const j = h.indexOf(']')
    return j >= 0 ? h.slice(0, j + 1) : h
  }
  const i = h.lastIndexOf(':')
  return i >= 0 ? h.slice(0, i) : h
}

/** 无 scheme 时补全：本地地址（localhost/127.x/::1/0.0.0.0/.local/裸端口）→ http，其余 → https */
export function normalizeUrlPreview(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (s.includes('://')) return s
  let host = s
  // 与 Go 侧一致：只在 / ? # 处截断（冒号不算，否则 ::1 会被切坏）
  const cut = s.search(/[/#?]/)
  if (cut >= 0) host = s.slice(0, cut)
  const h = host.toLowerCase()
  const hnp = hostWithoutPort(h)
  const isLocal =
    hnp === 'localhost' ||
    hnp.startsWith('127.') ||
    hnp === '[::1]' ||
    hnp === '::1' ||
    hnp === '0.0.0.0' ||
    hnp.endsWith('.local') ||
    h.startsWith(':')
  return (isLocal ? 'http' : 'https') + '://' + s
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '))
  } catch {
    return s
  }
}

/** 把 URL 的 query 部分拆成表格行（保序、解码），baseUrl 不含 '?' */
export function splitUrlToQuery(url: string): { baseUrl: string; pairs: KVPair[] } {
  const qIdx = url.indexOf('?')
  if (qIdx < 0) return { baseUrl: url, pairs: [] }
  const pairs: KVPair[] = []
  for (const seg of url.slice(qIdx + 1).split('&')) {
    if (seg === '') continue
    const eq = seg.indexOf('=')
    const k = eq >= 0 ? seg.slice(0, eq) : seg
    const v = eq >= 0 ? seg.slice(eq + 1) : ''
    pairs.push({ key: safeDecode(k), value: safeDecode(v), enabled: true })
  }
  return { baseUrl: url.slice(0, qIdx), pairs }
}

/**
 * 与 Go 侧 url.QueryEscape 语义一致：空格 → +，! ' ( ) * 也转义，
 * 其余同 encodeURIComponent。这样前端预览与 Go 实际编码逐字符一致，
 * 且 split → merge 往返幂等
 */
export function queryEscape(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

/** 把（启用的）query 行拼回 URL，保序、百分号编码；与 Go 侧 buildURLWithQuery 语义一致 */
export function mergeQueryToUrl(baseUrl: string, pairs: KVPair[]): string {
  const parts = pairs
    .filter((p) => p.enabled && p.key !== '')
    .map((p) => `${queryEscape(p.key)}=${queryEscape(p.value)}`)
  if (parts.length === 0) return baseUrl
  return baseUrl + (baseUrl.includes('?') ? '&' : '?') + parts.join('&')
}
