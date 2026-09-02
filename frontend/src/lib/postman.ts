// Postman Collection v2.1 导入（纯函数）：JSON 文本 → 前端 Collection + 项目级变量 + 跳过报告
// 映射规则见 docs 计划：item 递归（有 request=接口，否则文件夹）；auth 直映
// bearer/basic/apikey 其余计数跳过；body raw/urlencoded/formdata/graphql 映射，未知模式跳过
import type {
  Request,
  Collection,
  Folder,
  TreeNode,
  KVPair,
  FormField,
  Variable,
  RequestBody,
  AuthConfig,
  Environment,
} from '../types/models'
import { newRequest, newFolder, newCollection, uid } from '../types/models'
import { splitUrlToQuery } from './url'

export type PostmanImportResult =
  | {
      ok: true
      name: string
      collection: Collection
      /** 集合级 variable → 项目级变量 */
      variables: Variable[]
      /** 跳过的项数（畸形 item / 不支持的 auth / 不支持的 body 模式 / 无路径的 file 字段） */
      skipped: number
      warnings: string[]
      requestCount: number
      folderCount: number
    }
  | { ok: false; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

interface Ctx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  skipped: { n: number }
  warnings: string[]
  reqCount: { n: number }
  folderCount: { n: number }
}

/** postman auth 数组取第一个指定 key 的字符串值 */
function authVal(arr: Any, key: string): string {
  if (!Array.isArray(arr)) return ''
  for (const a of arr) {
    if (a && typeof a === 'object' && a.key === key) {
      return typeof a.value === 'string' ? a.value : ''
    }
  }
  return ''
}

function mapAuth(a: Any, ctx: Ctx): AuthConfig {
  if (!a || typeof a !== 'object') return { type: 'none' }
  switch (a.type) {
    case 'bearer':
      return { type: 'bearer', bearer: { token: authVal(a.bearer, 'token') } }
    case 'basic':
      return {
        type: 'basic',
        basic: { username: authVal(a.basic, 'username'), password: authVal(a.basic, 'password') },
      }
    case 'apikey':
      return {
        type: 'apikey',
        apikey: {
          key: authVal(a.apikey, 'key'),
          value: authVal(a.apikey, 'value'),
          in: authVal(a.apikey, 'in') === 'query' ? 'query' : 'header',
        },
      }
    case 'jwt':
      return { type: 'jwt', jwt: { token: authVal(a.jwt, 'token') } }
    case 'oauth2':
      // 导入只认 accessToken（手填形态）；Postman 的授权码流程配置（authUrl/redirectUri 等）无对应运行时，忽略
      return {
        type: 'oauth2',
        oauth2: {
          accessToken: authVal(a.oauth2, 'accessToken'),
          grant: 'manual',
          tokenUrl: '',
          clientId: authVal(a.oauth2, 'clientId'),
          clientSecret: authVal(a.oauth2, 'clientSecret'),
          username: '',
          password: '',
          scope: '',
        },
      }
    case 'digest':
    case 'digestauth':
      return {
        type: 'digest',
        digest: {
          username: authVal(a.digest, 'username'),
          password: authVal(a.digest, 'password'),
          realm: authVal(a.digest, 'realm') || undefined,
        },
      }
    case 'signaturev1':
    case 'oauth1': {
      // Postman 导出键名 signaturev1；signatureMethod 规范化（非法值回落 HMAC-SHA1）
      const sm = authVal(a.signaturev1 ?? a.oauth1, 'signatureMethod')
      const signatureMethod =
        sm === 'HMAC-SHA256' || sm === 'PLAINTEXT' ? sm : 'HMAC-SHA1'
      return {
        type: 'oauth1',
        oauth1: {
          consumerKey: authVal(a.signaturev1 ?? a.oauth1, 'consumerKey'),
          consumerSecret: authVal(a.signaturev1 ?? a.oauth1, 'consumerSecret'),
          token: authVal(a.signaturev1 ?? a.oauth1, 'token'),
          tokenSecret: authVal(a.signaturev1 ?? a.oauth1, 'tokenSecret'),
          signatureMethod,
          realm: authVal(a.signaturev1 ?? a.oauth1, 'realm') || undefined,
        },
      }
    }
    case 'awsv4':
      // Postman 字段名 accessKey/secretKey → 前端 accessKeyId/secretAccessKey
      return {
        type: 'awsv4',
        awsv4: {
          accessKeyId: authVal(a.awsv4, 'accessKey'),
          secretAccessKey: authVal(a.awsv4, 'secretKey'),
          sessionToken: authVal(a.awsv4, 'sessionToken') || undefined,
          region: authVal(a.awsv4, 'region'),
          service: authVal(a.awsv4, 'service'),
        },
      }
    default:
      if (typeof a.type === 'string' && a.type !== 'noauth') {
        ctx.skipped.n++
        ctx.warnings.push(`不支持的 auth 类型: ${a.type}`)
      }
      return { type: 'none' }
  }
}

/** postman body → 前端 RequestBody */
function mapBody(b: Any, ctx: Ctx): RequestBody {
  if (!b || typeof b !== 'object' || b.mode === 'none' || b.mode === undefined) {
    return { type: 'none' }
  }
  switch (b.mode) {
    case 'raw': {
      const raw = typeof b.raw === 'string' ? b.raw : JSON.stringify(b.raw ?? '')
      const lang = b.options?.raw?.language ?? b.language
      const rawLang = lang === 'json' || lang === 'xml' || lang === 'html' || lang === 'text' ? lang : 'text'
      return { type: 'raw', raw, rawLang }
    }
    case 'urlencoded': {
      const list: KVPair[] = []
      if (Array.isArray(b.urlencoded)) {
        for (const r of b.urlencoded) {
          if (!r || typeof r.key !== 'string') continue
          list.push({ key: r.key, value: typeof r.value === 'string' ? r.value : '', enabled: !r.disabled })
        }
      }
      return { type: 'urlencoded', urlencoded: list }
    }
    case 'formdata': {
      const list: FormField[] = []
      if (Array.isArray(b.formdata)) {
        for (const r of b.formdata) {
          if (!r || typeof r.key !== 'string') continue
          if (r.type === 'file') {
            // src 可能是字符串 / {src} / 数组
            let filePath = ''
            if (typeof r.src === 'string') filePath = r.src
            else if (Array.isArray(r.src) && r.src.length > 0 && typeof r.src[0]?.src === 'string') filePath = r.src[0].src
            else if (r.src && typeof r.src === 'object' && typeof r.src.src === 'string') filePath = r.src.src
            if (!filePath) {
              ctx.skipped.n++
              ctx.warnings.push(`form-data 文件字段「${r.key}」缺少本地路径`)
            }
            list.push({ key: r.key, value: '', enabled: !r.disabled, type: 'file', filePath })
          } else {
            list.push({ key: r.key, value: typeof r.value === 'string' ? r.value : '', enabled: !r.disabled, type: 'text' })
          }
        }
      }
      return { type: 'form-data', formData: list }
    }
    case 'graphql': {
      const g = b.graphql ?? {}
      return {
        type: 'graphql',
        graphql: { query: typeof g.query === 'string' ? g.query : '', variables: typeof g.variables === 'string' ? g.variables : '' },
      }
    }
    default:
      ctx.skipped.n++
      ctx.warnings.push(`不支持的 body 模式: ${String(b.mode)}`)
      return { type: 'none' }
  }
}

/** postman url（字符串或对象）→ { baseUrl, params } */
function mapUrl(u: Any): { baseUrl: string; params: KVPair[] } {
  if (typeof u === 'string') {
    const r = splitUrlToQuery(u)
    return { baseUrl: r.baseUrl, params: r.pairs }
  }
  if (!u || typeof u !== 'object') return { baseUrl: '', params: [] }
  let raw = typeof u.raw === 'string' ? u.raw : ''
  let params: KVPair[] = []
  if (Array.isArray(u.query) && u.query.length > 0) {
    params = u.query
      .filter((q: Any) => q && typeof q.key === 'string')
      .map((q: Any) => ({
        key: q.key as string,
        value: typeof q.value === 'string' ? (q.value as string) : '',
        enabled: !q.disabled,
      }))
    // raw 里含 query 部分，裁掉
    const qi = raw.indexOf('?')
    if (qi >= 0) raw = raw.slice(0, qi)
  } else if (raw) {
    const r = splitUrlToQuery(raw)
    raw = r.baseUrl
    params = r.pairs
  }
  if (!raw) {
    // 无 raw：host + path 拼
    const host = Array.isArray(u.host) ? (u.host as string[]).join('.') : ''
    const path = Array.isArray(u.path) ? '/' + (u.path as string[]).join('/') : ''
    const port = (u.port ?? '').toString()
    raw = `${u.protocol ?? 'https'}://${host}${port ? ':' + port : ''}${path}`
  }
  return { baseUrl: raw, params }
}

function mapRequest(it: Any, ctx: Ctx): Request {
  const name = typeof it.name === 'string' && it.name ? it.name : '未命名请求'
  let req: Any = it.request
  if (typeof req === 'string') req = { url: req }
  if (!req || typeof req !== 'object') req = {}

  const { baseUrl, params } = mapUrl(req.url)
  const headers: KVPair[] = []
  if (Array.isArray(req.header)) {
    for (const h of req.header) {
      if (!h || typeof h.key !== 'string') continue
      headers.push({
        key: h.key,
        value: typeof h.value === 'string' ? h.value : '',
        enabled: !h.disabled,
        description: typeof h.description === 'string' ? h.description : undefined,
      })
    }
  }

  let preScript: string | undefined
  let testScript: string | undefined
  // 规范位置是 item 层；部分导出器写在 request 内，两处都收
  const eventList = Array.isArray(it.event) ? it.event : Array.isArray(req.event) ? req.event : []
  if (eventList.length > 0) {
    const pre: string[] = []
    const test: string[] = []
    for (const e of eventList) {
      if (!e || !Array.isArray(e.script?.exec)) continue
      const code = e.script.exec.join('\n')
      if (e.listen === 'test') test.push(code)
      else if (e.listen === 'prerequest') pre.push(code)
    }
    preScript = pre.length ? pre.join('\n\n') : undefined
    testScript = test.length ? test.join('\n\n') : undefined
  }

  return newRequest({
    name,
    protocol: 'http',
    method: typeof req.method === 'string' && req.method ? req.method.toUpperCase() : 'GET',
    url: baseUrl,
    params,
    headers,
    body: mapBody(req.body, ctx),
    auth: mapAuth(req.auth, ctx),
    preRequestScript: preScript,
    testScript,
  })
}

function mapItem(it: Any, ctx: Ctx): TreeNode | null {
  if (!it || typeof it !== 'object') {
    ctx.skipped.n++
    return null
  }
  if (it.request !== undefined) {
    const r = mapRequest(it, ctx)
    ctx.reqCount.n++
    return r
  }
  if (Array.isArray(it.item)) {
    const children = it.item.map((c: Any) => mapItem(c, ctx)).filter((n: TreeNode | null): n is TreeNode => n !== null)
    const f = newFolder({ name: typeof it.name === 'string' && it.name ? it.name : '文件夹' })
    f.items = children
    if (Array.isArray(it.header)) {
      f.headers = it.header
        .filter((h: Any) => h && typeof h.key === 'string')
        .map((h: Any) => ({ key: h.key, value: typeof h.value === 'string' ? h.value : '', enabled: !h.disabled }))
    }
    ctx.folderCount.n++
    return f
  }
  ctx.skipped.n++
  ctx.warnings.push(`跳过无法识别的 item: ${JSON.stringify(it).slice(0, 80)}`)
  return null
}

function mapVariables(list: Any): Variable[] {
  if (!Array.isArray(list)) return []
  const out: Variable[] = []
  for (const v of list) {
    if (!v || typeof v.key !== 'string') continue
    out.push({
      key: v.key,
      initialValue: typeof v.value === 'string' ? v.value : '',
      currentValue: typeof v.value === 'string' ? v.value : '',
      enabled: !v.disabled,
      secret: v.type === 'secret' ? true : undefined,
    })
  }
  return out
}

/** 解析 Postman Collection（v2.1 为主，兼容 v2.0/v1.x 的 item 结构）。永不抛异常。 */
export function parsePostman(text: string): PostmanImportResult {
  let root: Any
  try {
    root = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败: ' + String(e) }
  }
  if (!root || typeof root !== 'object' || typeof root.info !== 'object') {
    return { ok: false, error: '不是 Postman 集合（缺少 info）' }
  }
  const ctx: Ctx = { skipped: { n: 0 }, warnings: [], reqCount: { n: 0 }, folderCount: { n: 0 } }
  const name = typeof root.info.name === 'string' && root.info.name ? root.info.name : '导入的集合'
  const items: Any = Array.isArray(root.item) ? root.item : []
  const c = newCollection({
    name,
    description: typeof root.info.description === 'string' ? root.info.description : undefined,
  })
  c.id = uid()
  c.items = items.map((it: Any) => mapItem(it, ctx)).filter((n: TreeNode | null): n is TreeNode => n !== null)
  return {
    ok: true,
    name,
    collection: c,
    variables: mapVariables(root.variable),
    skipped: ctx.skipped.n,
    warnings: ctx.warnings,
    requestCount: ctx.reqCount.n,
    folderCount: ctx.folderCount.n,
  }
}

// ---------- Postman Environment 文件 ----------

export type PostmanEnvResult =
  | { ok: true; environments: Environment[]; globals: Variable[] }
  | { ok: false; error: string }

/**
 * 解析 Postman Environment 文件：
 *  - 单环境文件 { name, values: [...] }
 *  - root 文件 { name: 'root', values: { environments: [...], globals: [...] } }
 */
export function parsePostmanEnvironment(text: string): PostmanEnvResult {
  let root: Any
  try {
    root = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败: ' + String(e) }
  }
  if (!root || typeof root !== 'object') return { ok: false, error: '不是 Postman 环境文件' }

  const one = (e: Any): Environment => ({
    id: uid(),
    name: typeof e?.name === 'string' && e.name ? e.name : '环境',
    variables: mapVariables(e?.values),
  })

  if (Array.isArray(root.values)) return { ok: true, environments: [one(root)], globals: [] }
  if (root.values && typeof root.values === 'object') {
    const envs: Environment[] = []
    if (Array.isArray(root.values.environments)) {
      for (const e of root.values.environments) envs.push(one(e))
    }
    if (envs.length === 0) return { ok: false, error: '环境中没有任何可用条目' }
    return { ok: true, environments: envs, globals: mapVariables(root.values.globals) }
  }
  return { ok: false, error: '无法识别的环境文件格式' }
}
