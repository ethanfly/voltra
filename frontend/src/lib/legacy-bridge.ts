// 过渡桥（阶段 5 重写请求编辑器后整体删除）：
// PRD Request ↔ 旧版 LegacyHTTPRequest，让旧 RequestPanel/ResponsePanel 先在新标签体系里工作
import type { ID, Request, RequestBody, LegacyHTTPRequest } from '../types/models'
import { emptyRequest } from '../types/models'

const bridges = new Map<ID, LegacyHTTPRequest>()

export function getBridge(request: Request): LegacyHTTPRequest {
  let b = bridges.get(request.id)
  if (!b) {
    b = { ...emptyRequest(), ...fromPrd(request) }
    bridges.set(request.id, b)
  }
  return b
}

/** 把桥接对象里的编辑写回 PRD Request（切换标签 / 关闭标签前调用） */
export function flushBridge(request: Request) {
  const b = bridges.get(request.id)
  if (!b) return
  request.method = b.method
  request.url = b.url
  request.headers = b.headers
  request.params = b.query
  request.body = {
    type: b.bodyType as RequestBody['type'],
    raw: b.body,
    rawLang: b.rawLang as RequestBody['rawLang'],
    urlencoded: b.urlEncoded,
    formData: b.formData,
    binaryPath: b.binaryPath,
    graphql: b.graphql ?? undefined,
  }
  Object.assign(request.settings, {
    timeoutMs: b.timeoutMs,
    followRedirects: b.followRedirects,
    maxRedirects: b.maxRedirects,
    insecureSkipTlsVerify: b.insecureSkipTlsVerify,
    sendCookies: b.sendCookies,
  })
  request.updatedAt = Date.now()
}

function fromPrd(r: Request) {
  const body = r.body
  return {
    method: r.method || 'GET',
    url: r.url,
    headers: r.headers,
    query: r.params,
    body: body.type === 'raw' ? (body.raw ?? '') : '',
    bodyType: body.type,
    rawLang: body.rawLang ?? 'text',
    urlEncoded: body.urlencoded ?? [],
    formData: body.formData ?? [],
    binaryPath: body.binaryPath ?? '',
    graphql: body.graphql ?? null,
    timeoutMs: r.settings.timeoutMs,
    followRedirects: r.settings.followRedirects,
    maxRedirects: r.settings.maxRedirects,
    insecureSkipTlsVerify: r.settings.insecureSkipTlsVerify,
    sendCookies: r.settings.sendCookies,
  }
}
