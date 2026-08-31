// Postman v2.1 导出（纯函数）：前端 Project → Collection v2.1 JSON / Environment 文件
// 与 postman.ts 的导入映射互逆（roundtrip 由测试保证）
import type { Project, Collection, TreeNode, Request, KVPair, FormField, Environment, Variable } from '../types/models'
import { mergeQueryToUrl } from './url'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'

function kvRow(p: KVPair): Any {
  const row: Any = { key: p.key, value: p.value }
  if (!p.enabled) row.disabled = true
  if (p.description) row.description = p.description
  return row
}

function urlObj(req: Request): Any {
  const raw = mergeQueryToUrl(req.url, req.params)
  const out: Any = { raw }
  // {{变量}} 等无法被 URL 解析的地址只保留 raw，不拆 host/path
  try {
    const u = new URL(req.url.includes('://') ? req.url : 'https://x' + req.url)
    if (req.url.includes('://')) {
      out.protocol = u.protocol.replace(':', '')
      const hostSegs = u.hostname.split('.').filter(Boolean)
      if (hostSegs.length) out.host = hostSegs
      if (u.port) out.port = u.port
      const pathSegs = u.pathname.split('/').filter(Boolean)
      if (pathSegs.length) out.path = pathSegs
    }
  } catch {
    /* 只保留 raw */
  }
  out.query = req.params.map((p) => ({ key: p.key, value: p.value, ...(p.enabled ? {} : { disabled: true }) }))
  return out
}

function bodyObj(b: Request['body']): Any {
  switch (b.type) {
    case 'none':
      return undefined
    case 'raw':
      return {
        mode: 'raw',
        raw: b.raw ?? '',
        options: { raw: { language: b.rawLang ?? 'text' } },
      }
    case 'urlencoded':
      return { mode: 'urlencoded', urlencoded: (b.urlencoded ?? []).map(kvRow) }
    case 'form-data': {
      const formdata = (b.formData ?? []).map((f: FormField) => {
        if (f.type === 'file') return { key: f.key, type: 'file', src: f.filePath || null }
        return { key: f.key, value: f.value, type: 'text', ...(f.enabled ? {} : { disabled: true }) }
      })
      return { mode: 'formdata', formdata }
    }
    case 'graphql':
      return { mode: 'graphql', graphql: { query: b.graphql?.query ?? '', variables: b.graphql?.variables ?? '' } }
    case 'binary':
      // 二进制上传无对应 postman 模式，降级为 form-data file 行
      return {
        mode: 'formdata',
        formdata: [{ key: 'file', type: 'file', src: b.binaryPath || null }],
      }
  }
}

function authObj(a: Request['auth']): Any {
  switch (a.type) {
    case 'bearer':
      return { type: 'bearer', bearer: [{ key: 'token', value: a.bearer?.token ?? '', type: 'string' }] }
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: a.basic?.username ?? '', type: 'string' },
          { key: 'password', value: a.basic?.password ?? '', type: 'string' },
        ],
      }
    case 'apikey':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: a.apikey?.key ?? '' },
          { key: 'value', value: a.apikey?.value ?? '' },
          { key: 'in', value: a.apikey?.in ?? 'header' },
        ],
      }
    default:
      return undefined
  }
}

/** postman item 内的 request 对象（不含 name，name 在 item 层） */
function requestInner(r: Request): Any {
  const out: Any = {
    method: r.method.toUpperCase(),
    header: r.headers.map(kvRow),
    url: urlObj(r),
  }
  const body = bodyObj(r.body)
  if (body) out.body = body
  const auth = authObj(r.auth)
  if (auth) out.auth = auth
  return out
}

function nodeObj(n: TreeNode): Any {
  if (n.kind === 'folder') {
    const out: Any = { name: n.name, item: n.items.map(nodeObj) }
    if (n.headers?.length) out.header = n.headers.map(kvRow)
    return out
  }
  const out: Any = { name: n.name, request: requestInner(n) }
  // v2.1 规范：event 在 item 层（与 request 平级），不在 request 内
  const events: Any[] = []
  if (n.preRequestScript) events.push({ listen: 'prerequest', script: { exec: n.preRequestScript.split('\n') } })
  if (n.testScript) events.push({ listen: 'test', script: { exec: n.testScript.split('\n') } })
  if (events.length) out.event = events
  return out
}

function varObj(v: Variable): Any {
  const out: Any = { key: v.key, value: v.currentValue ?? v.initialValue ?? '' }
  if (v.secret) out.type = 'secret'
  if (!v.enabled) out.disabled = true
  return out
}

/**
 * 导出为 Postman Collection v2.1。
 * 单集合直接展开其 items；多集合时每个集合包一层同名文件夹（postman 只有单一根）
 */
export function exportPostmanCollection(project: Project): string {
  let item: Any
  if (project.collections.length === 1) {
    const c = project.collections[0]
    item = c.items.map(nodeObj)
  } else {
    item = project.collections.map((c: Collection) => ({
      name: c.name,
      item: c.items.map(nodeObj),
      ...(c.headers?.length ? { header: c.headers.map(kvRow) } : {}),
    }))
  }
  const out: Any = {
    info: {
      name: project.name,
      _postman_id: project.id,
      schema: SCHEMA,
    },
    item,
  }
  if (project.variables.length) out.variable = project.variables.map(varObj)
  return JSON.stringify(out, null, 2)
}

/** 导出为 Postman 环境文件（root 形式，values.environments） */
export function exportPostmanEnvironments(environments: Environment[], globals: Variable[] = []): string {
  const envs = environments.map((e) => ({
    id: e.id,
    name: e.name,
    values: e.variables.map(varObj),
    _postman_variable_scope: 'environment',
  }))
  return JSON.stringify(
    {
      id: 'voltra-root',
      name: 'root',
      values: {
        environments: envs,
        globals: globals.map((g) => ({ ...varObj(g), _postman_variable_scope: 'global' })),
      },
      _postman_variable_scope: 'collection',
    },
    null,
    2,
  )
}
