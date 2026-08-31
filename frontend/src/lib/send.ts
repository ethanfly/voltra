// 发送管线：PRD Request →（变量替换 + 继承合并 + auth 注入）→ 绑定层 HTTPRequest
// 同时管理 inFlight 取消与历史记录写入
import { HTTPService } from '../api/backend'
import type {
  Request,
  AuthConfig,
  KVPair,
  FormField,
  HTTPResponse,
} from '../types/models'
import { uid } from '../types/models'
import { resolveAll } from '../stores/env'
import { tabs, inFlight } from '../stores/tabs'
import { findRequest, nodeAncestors } from '../stores/workspace'
import type { Collection, Folder } from '../types/models'
import { addHistory } from '../stores/history'

/** 继承的祖先链（auth=inherit / 公共 header 合并用） */
export function ancestorsOf(request: Request): (Collection | Folder)[] {
  const loc = findRequest(request.id)
  if (!loc) return []
  return nodeAncestors(loc.project, request.id)
}

/** 继承合并后的最终 auth（自身 inherit 时取最近的非 undefined 祖先） */
export function effectiveAuth(request: Request): AuthConfig {
  if (request.auth.type !== 'inherit') return request.auth
  const chain = ancestorsOf(request).slice().reverse() // 直接父级优先
  for (const a of chain) {
    const auth = a.auth
    if (auth && auth.type !== 'none' && auth.type !== 'inherit') return auth
  }
  return { type: 'none' }
}

/** 合并公共 header：祖先在前（内层覆盖外层），自身请求 header 最后覆盖；key 忽略大小写 */
export function mergedHeaders(request: Request): KVPair[] {
  const out: KVPair[] = []
  const seen = new Map<string, number>() // lowerKey → out 下标
  const put = (kv: KVPair) => {
    const k = kv.key.trim().toLowerCase()
    if (!k) return
    const i = seen.get(k)
    if (i !== undefined) out[i] = { ...kv }
    else {
      seen.set(k, out.length)
      out.push({ ...kv })
    }
  }
  for (const a of ancestorsOf(request)) {
    for (const h of a.headers ?? []) if (h.enabled) put(h)
  }
  for (const h of request.headers) if (h.enabled) put(h)
  return out
}

/** 被祖先定义、且自身未覆盖的 key（HeadersTab 灰显"继承"用；保留原始大小写） */
export function inheritedHeaderKeys(request: Request): Set<string> {
  const own = new Set(request.headers.map((h) => h.key.trim().toLowerCase()))
  const seen = new Set<string>()
  const out = new Set<string>()
  for (const a of ancestorsOf(request)) {
    for (const h of a.headers ?? []) {
      const k = h.key.trim()
      const lk = k.toLowerCase()
      if (k && !own.has(lk) && !seen.has(lk)) {
        seen.add(lk)
        out.add(k)
      }
    }
  }
  return out
}

function resolveText(request: Request, text: string): string {
  return resolveAll(request, text).text
}

function b64Unicode(s: string): string {
  // 非 ASCII 安全（中文用户名等）
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
}

/** auth 注入产生的 header / query 行 */
function authInjections(request: Request): { headers: KVPair[]; query: KVPair[] } {
  const auth = effectiveAuth(request)
  const headers: KVPair[] = []
  const query: KVPair[] = []
  if (auth.type === 'bearer' && auth.bearer?.token) {
    headers.push({ key: 'Authorization', value: 'Bearer ' + resolveText(request, auth.bearer.token), enabled: true })
  } else if (auth.type === 'basic' && auth.basic) {
    const raw = resolveText(request, auth.basic.username) + ':' + resolveText(request, auth.basic.password)
    headers.push({ key: 'Authorization', value: 'Basic ' + b64Unicode(raw), enabled: true })
  } else if (auth.type === 'apikey' && auth.apikey) {
    const key = resolveText(request, auth.apikey.key)
    const value = resolveText(request, auth.apikey.value)
    if (auth.apikey.in === 'query') {
      query.push({ key, value, enabled: true })
    } else if (key) {
      headers.push({ key, value, enabled: true })
    }
  }
  return { headers, query }
}

/** 组装绑定层 HTTPRequest（变量已替换、header 已合并、auth 已注入） */
export function buildGoRequest(request: Request): {
  method: string
  url: string
  headers: KVPair[]
  query: KVPair[]
  body: string
  bodyType: string
  rawLang: string
  urlEncoded: KVPair[]
  formData: FormField[]
  binaryPath: string
  graphql: { query: string; variables: string } | null
  timeoutMs: number
  followRedirects: boolean
  maxRedirects: number
  insecureSkipTlsVerify: boolean
  sendCookies: boolean
} {
  const body = request.body
  const inj = authInjections(request)

  const headers = mergedHeaders(request)
  for (const h of inj.headers) {
    const i = headers.findIndex((x) => x.key.trim().toLowerCase() === h.key.trim().toLowerCase())
    if (i >= 0) headers[i] = h
    else headers.push(h)
  }

  const query: KVPair[] = []
  for (const q of request.params) {
    if (q.enabled) query.push({ ...q, key: resolveText(request, q.key), value: resolveText(request, q.value) })
  }
  for (const q of inj.query) {
    const i = query.findIndex((x) => x.key.trim().toLowerCase() === q.key.trim().toLowerCase())
    if (i >= 0) query[i] = q
    else query.push(q)
  }

  let formData: FormField[] = []
  if (body.type === 'form-data' && body.formData) {
    formData = body.formData.map((f) => ({
      key: resolveText(request, f.key),
      value: f.type === 'file' ? '' : resolveText(request, f.value),
      enabled: f.enabled,
      type: f.type,
      filePath: f.type === 'file' ? (f.filePath ?? '') : undefined,
    }))
  }

  return {
    method: request.method || 'GET',
    url: resolveText(request, request.url),
    headers,
    query,
    body: body.type === 'raw' ? resolveText(request, body.raw ?? '') : '',
    bodyType: body.type,
    rawLang: body.rawLang ?? 'text',
    urlEncoded: (body.urlencoded ?? [])
      .filter((u) => u.enabled)
      .map((u) => ({ key: resolveText(request, u.key), value: resolveText(request, u.value), enabled: true })),
    formData,
    binaryPath: body.binaryPath ?? '',
    graphql: body.graphql
      ? {
          query: resolveText(request, body.graphql.query),
          variables: resolveText(request, body.graphql.variables),
        }
      : null,
    timeoutMs: request.settings.timeoutMs,
    followRedirects: request.settings.followRedirects,
    maxRedirects: request.settings.maxRedirects,
    insecureSkipTlsVerify: request.settings.insecureSkipTlsVerify,
    sendCookies: request.settings.sendCookies,
  }
}

/** 发送并记录历史；取消后 resolve 的响应 errorKind === 'canceled'，不记历史 */
export async function sendRequest(tabId: string): Promise<HTTPResponse> {
  const tab = tabs.tabs.find((t) => t.tabId === tabId)
  if (!tab) throw new Error('tab not found')
  const go = buildGoRequest(tab.request)
  const p = HTTPService.SendRequest(go)
  inFlight[tabId] = { cancel: () => p.cancel() }
  const resp = await p
  delete inFlight[tabId]
  if (resp.errorKind !== 'canceled') {
    addHistory({
      id: uid(),
      requestSnapshot: structuredClone(tab.request),
      responseSummary: {
        statusCode: resp.statusCode,
        durationMs: resp.durationMs,
        sizeBytes: resp.sizeBytes,
      },
      sentAt: Date.now(),
    })
  }
  return resp
}

export function cancelRequest(tabId: string) {
  const f = inFlight[tabId]
  if (f) f.cancel()
}

export function isSending(tabId: string): boolean {
  return inFlight[tabId] !== undefined && inFlight[tabId] !== null
}
