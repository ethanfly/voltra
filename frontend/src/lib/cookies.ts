// Set-Cookie 解析（纯函数）
import type { KVPair } from '../types/models'

export interface CookieInfo {
  name: string
  value: string
  domain?: string
  path?: string
  /** 原样字符串（含逗号，如 "Wed, 21 Oct 2026 07:28:00 GMT"） */
  expires?: string
  maxAge?: number
  httpOnly: boolean
  secure: boolean
  sameSite?: string
}

/** 解析一行 Set-Cookie；首段无 = 视为畸形返回 null */
export function parseSetCookie(line: string): CookieInfo | null {
  const segs = line.split(';').map((s) => s.trim())
  const first = segs.shift()
  if (!first) return null
  const eq = first.indexOf('=')
  if (eq <= 0) return null
  const c: CookieInfo = {
    name: first.slice(0, eq),
    value: first.slice(eq + 1),
    httpOnly: false,
    secure: false,
  }
  for (const s of segs) {
    const i = s.indexOf('=')
    const k = (i >= 0 ? s.slice(0, i) : s).trim().toLowerCase()
    const v = i >= 0 ? s.slice(i + 1).trim() : ''
    switch (k) {
      case 'domain':
        c.domain = v
        break
      case 'path':
        c.path = v
        break
      case 'expires':
        c.expires = v
        break
      case 'max-age':
        c.maxAge = Number(v)
        break
      case 'httponly':
        c.httpOnly = true
        break
      case 'secure':
        c.secure = true
        break
      case 'samesite':
        c.sameSite = v
        break
    }
  }
  return c
}

/** 一条 header 值里可能塞了多个 cookie；按顶层逗号切分。
 *  仅当逗号后的新段形如 `name=`（cookie 名后紧跟等号）才切分，
 *  避免误切 Expires=Wed, 21 Oct… 里的逗号 */
function splitCookieLine(value: string): string[] {
  const parts: string[] = []
  let start = 0
  for (let i = value.indexOf(','); i >= 0; i = value.indexOf(',', i + 1)) {
    if (/^\s*[A-Za-z0-9._$!*-]+=/.test(value.slice(i + 1))) {
      parts.push(value.slice(start, i))
      start = i + 1
    }
  }
  parts.push(value.slice(start))
  return parts.map((s) => s.trim()).filter(Boolean)
}

/** 从响应 headers 里取出全部 Set-Cookie 并解析 */
export function parseSetCookies(headers: KVPair[] | null): CookieInfo[] {
  const out: CookieInfo[] = []
  for (const h of headers ?? []) {
    if (h.key.toLowerCase() !== 'set-cookie') continue
    for (const seg of splitCookieLine(h.value)) {
      const c = parseSetCookie(seg)
      if (c) out.push(c)
    }
  }
  return out
}
