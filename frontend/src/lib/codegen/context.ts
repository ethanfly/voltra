// 代码生成上下文：复用发送管线的继承合并 + auth 注入逻辑，
// 可输出「变量原样 {{token}}」或「已解析真实值」两种形态
import type { Request, RequestBody, KVPair, FormField, AuthConfig } from '../../types/models'
import { buildGoRequest, effectiveAuth } from '../send'
import { mergeQueryToUrl } from '../url'
import { resolveAll } from '../../stores/env'

export const DEFAULT_TIMEOUT_MS = 30000

export interface CodegenCtx {
  method: string
  /** 基础 URL（未拼 query） */
  url: string
  /** 拼好（启用）query 的完整 URL */
  fullUrl: string
  /** 继承合并 + auth 注入后的最终 header（变量是否已解析取决于模式） */
  headers: KVPair[]
  query: KVPair[]
  bodyType: RequestBody['type']
  raw: string
  rawLang: string
  urlEncoded: KVPair[]
  formData: FormField[]
  binaryPath: string
  graphql: { query: string; variables: string } | null
  /** 生效的 auth 配置（inherit 已解析；变量是否已解析取决于模式） */
  auth: AuthConfig
  timeoutMs: number
  insecure: boolean
}

/** 按模式解析 auth 配置内的变量 */
export function authForMode(request: Request, resolveVars: boolean): AuthConfig {
  const a = effectiveAuth(request)
  if (!resolveVars) return a
  const r = (s?: string) => (s ? resolveAll(request, s).text : s)
  switch (a.type) {
    case 'bearer':
      return { type: 'bearer', bearer: { token: r(a.bearer?.token) ?? '' } }
    case 'basic':
      return { type: 'basic', basic: { username: r(a.basic?.username) ?? '', password: r(a.basic?.password) ?? '' } }
    case 'apikey':
      return {
        type: 'apikey',
        apikey: { key: r(a.apikey?.key) ?? '', value: r(a.apikey?.value) ?? '', in: a.apikey?.in ?? 'header' },
      }
    default:
      return { type: 'none' }
  }
}

/** 生成代码用的最终 header：raw/urlencoded/graphql 且未显式设置时补默认 Content-Type（与 Go 侧发送行为一致） */
export function effectiveHeaders(c: CodegenCtx): KVPair[] {
  const out = c.headers.map((h) => ({ ...h }))
  const hasCT = out.some((h) => h.key.trim().toLowerCase() === 'content-type')
  if (!hasCT) {
    let ct: string | null = null
    if (c.bodyType === 'raw') {
      ct =
        c.rawLang === 'json'
          ? 'application/json'
          : c.rawLang === 'xml'
            ? 'application/xml'
            : c.rawLang === 'html'
              ? 'text/html'
              : 'text/plain'
    } else if (c.bodyType === 'urlencoded') {
      ct = 'application/x-www-form-urlencoded'
    } else if (c.bodyType === 'graphql') {
      ct = 'application/json'
    }
    if (ct) out.push({ key: 'Content-Type', value: ct, enabled: true })
  }
  return out
}

/** 组装代码生成上下文。resolveVars=true 时变量已替换为当前环境真实值 */
export function buildCodegenCtx(request: Request, resolveVars: boolean): CodegenCtx {
  const go = buildGoRequest(request, { resolve: resolveVars })
  return {
    method: go.method,
    url: go.url,
    fullUrl: mergeQueryToUrl(go.url, go.query),
    headers: go.headers,
    query: go.query,
    bodyType: go.bodyType as RequestBody['type'],
    raw: go.body,
    rawLang: go.rawLang,
    urlEncoded: go.urlEncoded,
    formData: go.formData,
    binaryPath: go.binaryPath,
    graphql: go.graphql,
    auth: authForMode(request, resolveVars),
    timeoutMs: go.timeoutMs,
    insecure: go.insecureSkipTlsVerify,
  }
}
