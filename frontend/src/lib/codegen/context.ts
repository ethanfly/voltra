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
  /** Go 侧运行时签名型的诚实提示（digest/oauth1/awsv4）：签名依赖时间戳/nonce/服务端 nonce，
   *  预计算只会立即过期，生成代码无法复现——输出首行前以注释带出，比静默省略更不容易误导 */
  authNote: string | null
  timeoutMs: number
  insecure: boolean
}

/** 按模式解析 auth 配置内的变量（10 型逐字段透传；raw 模式保留 {{var}} 原样） */
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
    case 'jwt':
      return { type: 'jwt', jwt: { token: r(a.jwt?.token) ?? '' } }
    case 'digest':
      return {
        type: 'digest',
        digest: {
          username: r(a.digest?.username) ?? '',
          password: r(a.digest?.password) ?? '',
          realm: a.digest?.realm ? r(a.digest.realm) : undefined,
        },
      }
    case 'oauth1':
      return {
        type: 'oauth1',
        oauth1: {
          consumerKey: r(a.oauth1?.consumerKey) ?? '',
          consumerSecret: r(a.oauth1?.consumerSecret) ?? '',
          token: r(a.oauth1?.token) ?? '',
          tokenSecret: r(a.oauth1?.tokenSecret) ?? '',
          signatureMethod: a.oauth1?.signatureMethod ?? 'HMAC-SHA1',
          realm: a.oauth1?.realm ? r(a.oauth1.realm) : undefined,
        },
      }
    case 'oauth2':
      return {
        type: 'oauth2',
        oauth2: {
          accessToken: r(a.oauth2?.accessToken) ?? '',
          grant: a.oauth2?.grant ?? 'manual',
          tokenUrl: r(a.oauth2?.tokenUrl) ?? '',
          clientId: r(a.oauth2?.clientId) ?? '',
          clientSecret: r(a.oauth2?.clientSecret) ?? '',
          username: r(a.oauth2?.username) ?? '',
          password: r(a.oauth2?.password) ?? '',
          scope: r(a.oauth2?.scope) ?? '',
        },
      }
    case 'awsv4':
      return {
        type: 'awsv4',
        awsv4: {
          accessKeyId: r(a.awsv4?.accessKeyId) ?? '',
          secretAccessKey: r(a.awsv4?.secretAccessKey) ?? '',
          sessionToken: a.awsv4?.sessionToken ? r(a.awsv4.sessionToken) : undefined,
          region: r(a.awsv4?.region) ?? '',
          service: r(a.awsv4?.service) ?? '',
        },
      }
    case 'inherit':
    default:
      return { type: 'none' }
  }
}

/** 签名位置提示（仅 Go 侧运行时型需要；前端注入型经 headers 通路自然带出，无需提示） */
function authNoteFor(type: AuthConfig['type']): string | null {
  switch (type) {
    case 'digest':
      return 'Digest 鉴权由 Voltra 运行时经 401 挑战-应答完成，依赖服务端返回的 nonce，生成的代码无法复现。'
    case 'oauth1':
      return 'OAuth 1.0 签名由 Voltra 运行时计算（RFC 5849），签名依赖时间戳与 nonce，生成的代码无法复现。'
    case 'awsv4':
      return 'AWS Signature V4 由 Voltra 运行时计算，签名依赖时间戳，预计算的签名会立即过期，生成的代码无法直接复用。'
    default:
      return null
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
  const auth = authForMode(request, resolveVars)
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
    auth,
    authNote: authNoteFor(auth.type),
    timeoutMs: go.timeoutMs,
    insecure: go.insecureSkipTlsVerify,
  }
}
