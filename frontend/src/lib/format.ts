// 响应格式化纯函数：JSON 美化 / 字节数 / 语言探测 / 二进制 hex 摘要
export type BodyLang = 'json' | 'xml' | 'html' | 'javascript' | 'text'

export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return null
  }
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B'
  if (n < 1024) return n + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return v.toFixed(v >= 100 ? 0 : 1) + ' ' + units[i]
}

/** 先按 Content-Type，再按内容特征兜底 */
export function detectLang(contentType: string, text: string): BodyLang {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('json')) return 'json'
  if (ct.includes('xml') || ct.includes('yaml')) return 'xml'
  if (ct.includes('html')) return 'html'
  if (ct.includes('javascript')) return 'javascript'
  const s = (text || '').trimStart().slice(0, 256)
  if (s.startsWith('{') || s.startsWith('[')) return 'json'
  if (s.startsWith('<')) {
    if (s.toLowerCase().includes('<html')) return 'html'
    if (s.startsWith('<?xml')) return 'xml'
  }
  return 'text'
}

/** 二进制响应（base64）前 N 字节的 hex 摘要；解码失败返回空串 */
export function binaryHexSummary(b64: string, maxBytes = 64): string {
  try {
    // 取能完整解码、且覆盖 maxBytes 的最小 4 的倍数前缀
    const cut = Math.min(b64.length, Math.floor((Math.ceil((maxBytes * 4) / 3) / 4) * 4))
    const bin = atob(b64.slice(0, cut))
    const out: string[] = []
    for (let i = 0; i < bin.length && i < maxBytes; i++) {
      out.push(bin.charCodeAt(i).toString(16).padStart(2, '0'))
    }
    return out.join(' ')
  } catch {
    return ''
  }
}
