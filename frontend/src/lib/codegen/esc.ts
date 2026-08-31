// 各语言字符串转义与公共小工具（纯函数，供 generators 使用）
import { queryEscape } from '../url'

/** Shell 单引号串：' → '\''（单引号内无转义，只能断开重开） */
export function sh(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

/** JSON 字符串字面量 —— 对 JS/TS/Go/Kotlin/Swift 都是合法的字面量形式 */
export function jsStr(s: string): string {
  return JSON.stringify(s)
}

/** Python 双引号串：反斜杠/引号/换行转义，CJK 保留原样 */
export function pyStr(s: string): string {
  return (
    '"' +
    s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t') +
    '"'
  )
}

/** Java/Kotlin 双引号串（规则与 pyStr 相同） */
export function javaStr(s: string): string {
  return pyStr(s)
}

/** C# 双引号串 */
export function csStr(s: string): string {
  return pyStr(s)
}

/** PHP 单引号串：只转义 \\ 和 \' */
export function phpStr(s: string): string {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

/** Ruby 单引号串：只转义 \\ 和 \' */
export function rubyStr(s: string): string {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

/** URL query 值编码（与 Go 侧 url.QueryEscape 一致：空格 → +） */
export function urlenc(s: string): string {
  return queryEscape(s)
}

/** urlencoded 行拼成 application/x-www-form-urlencoded 串（保序） */
export function urlencodedString(pairs: { key: string; value: string }[]): string {
  return pairs.map((p) => `${urlenc(p.key)}=${urlenc(p.value)}`).join('&')
}

/** GraphQL body → JSON 文本（variables 是合法 JSON 时解析为对象，否则原样嵌入字符串） */
export function graphqlBodyText(g: { query: string; variables: string }): string {
  let vars: unknown
  if (g.variables.trim()) {
    try {
      vars = JSON.parse(g.variables)
    } catch {
      vars = g.variables
    }
  }
  const obj: Record<string, unknown> = { query: g.query }
  if (vars !== undefined) obj.variables = vars
  return JSON.stringify(obj)
}

/** 手工拆 URL（兼容 {{host}} 等 new URL 解析不了的地址） */
export function splitUrl(url: string): { scheme: string; host: string; port: string; path: string } {
  const i = url.indexOf('://')
  const scheme = i >= 0 ? url.slice(0, i) : 'https'
  const rest = i >= 0 ? url.slice(i + 3) : url
  const j = rest.search(/[/#?]/)
  const hostPort = j >= 0 ? rest.slice(0, j) : rest
  const path = j >= 0 ? rest.slice(j) : ''
  let host = hostPort
  let port = ''
  if (hostPort.startsWith('[')) {
    const k = hostPort.indexOf(']')
    host = k >= 0 ? hostPort.slice(0, k + 1) : hostPort
    if (k >= 0 && hostPort[k + 1] === ':') port = hostPort.slice(k + 2)
  } else {
    const k = hostPort.lastIndexOf(':')
    if (k >= 0) {
      host = hostPort.slice(0, k)
      port = hostPort.slice(k + 1)
    }
  }
  return { scheme, host, port: port || (scheme === 'http' ? '80' : '443'), path }
}

/** 非 ASCII 安全的 base64（basic auth 用） */
export function b64Unicode(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
}

/** 是否含未替换的 {{变量}} */
export function hasVars(s: string): boolean {
  return /\{\{[^}]*\}\}/.test(s)
}
