// 发送管线纯逻辑：继承合并（header/auth）+ auth 注入 + 变量替换 + body 映射
import { describe, it, expect, beforeEach } from 'vitest'
import { workspace } from '../src/stores/workspace'
import { env } from '../src/stores/env'
import { newProject, newCollection, newFolder, newRequest } from '../src/types/models'
import { buildGoRequest, mergedHeaders, effectiveAuth, inheritedHeaderKeys } from '../src/lib/send'

function setup() {
  const p = newProject({ name: 'p' })
  const c = newCollection({ name: 'c' })
  c.headers = [{ key: 'X-Api-Version', value: '1', enabled: true }]
  c.auth = { type: 'bearer', bearer: { token: 'c-token' } }
  const f = newFolder({ name: 'f' })
  f.headers = [
    { key: 'X-Api-Version', value: '2', enabled: true }, // 内层覆盖外层
    { key: 'X-Team', value: 'qa', enabled: true },
  ]
  f.auth = { type: 'inherit' } // 继续向上找
  c.items.push(f)
  const r = newRequest({ name: 'r', url: 'https://example.com/{{path}}', protocol: 'http' })
  f.items.push(r)
  p.collections = [c]
  workspace.projects = [p]
  workspace.currentProjectId = p.id
  return { p, c, f, r }
}

beforeEach(() => {
  workspace.projects = []
  workspace.currentProjectId = null
  env.globalVars = []
  env.currentEnvId = null
})

describe('mergedHeaders 继承合并', () => {
  it('祖先在前、内层覆盖外层、自身最后覆盖（key 忽略大小写）', () => {
    const { r } = setup()
    r.headers = [
      { key: 'x-api-version', value: '3', enabled: true },
      { key: 'X-Content', value: 'json', enabled: true },
      { key: 'X-Off', value: 'x', enabled: false }, // 禁用行不参与
    ]
    const h = mergedHeaders(r)
    const get = (k: string) => h.find((x) => x.key.toLowerCase() === k)
    expect(get('x-api-version')?.value).toBe('3') // 自身覆盖祖先两层
    expect(get('x-team')?.value).toBe('qa') // 仅来自文件夹
    expect(get('x-content')?.value).toBe('json')
    expect(get('x-off')).toBeUndefined()
    expect(h).toHaveLength(3)
  })

  it('自身未覆盖时取最近的祖先值', () => {
    const { r } = setup()
    r.headers = []
    const get = (h: ReturnType<typeof mergedHeaders>, k: string) =>
      h.find((x) => x.key.toLowerCase() === k)?.value
    expect(get(mergedHeaders(r), 'x-api-version')).toBe('2') // 文件夹覆盖集合
    expect(get(mergedHeaders(r), 'x-team')).toBe('qa')
  })

  it('inheritedHeaderKeys：祖先定义且自身未覆盖的 key', () => {
    const { r } = setup()
    r.headers = [{ key: 'X-Team', value: 'dev', enabled: true }] // 覆盖了 X-Team
    expect(inheritedHeaderKeys(r)).toEqual(new Set(['X-Api-Version']))
  })
})

describe('effectiveAuth 继承', () => {
  it('inherit 时取最近的非 inherit/none 祖先', () => {
    const { r } = setup()
    r.auth = { type: 'inherit' }
    const a = effectiveAuth(r)
    expect(a.type).toBe('bearer')
    expect(a.bearer?.token).toBe('c-token')
  })

  it('自身非 inherit 直接用自身', () => {
    const { r } = setup()
    r.auth = { type: 'apikey', apikey: { key: 'K', value: 'V', in: 'header' } }
    expect(effectiveAuth(r).type).toBe('apikey')
  })

  it('无祖先定义时降级 none', () => {
    const { r } = setup()
    delete workspace.projects[0].collections[0].auth
    workspace.projects[0].collections[0].items[0].auth = { type: 'inherit' }
    r.auth = { type: 'inherit' }
    expect(effectiveAuth(r)).toEqual({ type: 'none' })
  })
})

describe('buildGoRequest', () => {
  it('bearer 继承注入 Authorization', () => {
    const { r } = setup()
    r.auth = { type: 'inherit' }
    const go = buildGoRequest(r)
    const auth = go.headers.find((h) => h.key === 'Authorization')
    expect(auth?.value).toBe('Bearer c-token')
  })

  it('basic 注入（含非 ASCII 用户名）', () => {
    const { r } = setup()
    r.auth = { type: 'basic', basic: { username: '用户', password: 'pw' } }
    const go = buildGoRequest(r)
    const auth = go.headers.find((h) => h.key === 'Authorization')
    const raw = Buffer.from(new TextEncoder().encode('用户:pw')).toString('base64')
    expect(auth?.value).toBe('Basic ' + raw)
  })

  it('apikey in=query 进 query 行；自身 query 同名覆盖', () => {
    const { r } = setup()
    r.params = [{ key: 'token', value: 'own', enabled: true }, { key: 'q', value: '1', enabled: false }]
    r.auth = { type: 'apikey', apikey: { key: 'token', value: 'api-v', in: 'query' } }
    const go = buildGoRequest(r)
    expect(go.query).toEqual([{ key: 'token', value: 'api-v', enabled: true }])
  })

  it('apikey in=header 进 header 且变量可替换', () => {
    const { r } = setup()
    env.globalVars = [{ key: 'ak', initialValue: '', currentValue: 'secret-1', enabled: true }]
    r.auth = { type: 'apikey', apikey: { key: 'X-{{ak}}-Key', value: '{{ak}}-v', in: 'header' } }
    const go = buildGoRequest(r)
    const h = go.headers.find((x) => x.key === 'X-secret-1-Key')
    expect(h?.value).toBe('secret-1-v')
  })

  it('URL 与 body 变量替换；未定义变量原样保留', () => {
    const { r } = setup()
    env.globalVars = [{ key: 'path', initialValue: '', currentValue: 'users', enabled: true }]
    r.body = { type: 'raw', rawLang: 'json', raw: '{"a":"{{path}}","b":"{{nope}}"}' }
    const go = buildGoRequest(r)
    expect(go.url).toBe('https://example.com/users')
    expect(go.body).toBe('{"a":"users","b":"{{nope}}"}')
    expect(go.bodyType).toBe('raw')
    expect(go.rawLang).toBe('json')
  })

  it('urlencoded 只取启用行；graphql 原样透传', () => {
    const { r } = setup()
    r.body = {
      type: 'urlencoded',
      urlencoded: [
        { key: 'a', value: '1', enabled: true },
        { key: 'b', value: '2', enabled: false },
      ],
    }
    let go = buildGoRequest(r)
    expect(go.urlEncoded).toEqual([{ key: 'a', value: '1', enabled: true }])

    r.body = { type: 'graphql', graphql: { query: 'query { ping }', variables: '{"x":1}' } }
    go = buildGoRequest(r)
    expect(go.graphql).toEqual({ query: 'query { ping }', variables: '{"x":1}' })
    expect(go.body).toBe('')
  })

  it('settings 透传（Go 侧做 0 值兜底）', () => {
    const { r } = setup()
    r.settings.timeoutMs = 1500
    r.settings.followRedirects = false
    r.settings.maxRedirects = 3
    r.settings.insecureSkipTlsVerify = true
    r.settings.sendCookies = true
    const go = buildGoRequest(r)
    expect(go).toMatchObject({
      timeoutMs: 1500,
      followRedirects: false,
      maxRedirects: 3,
      insecureSkipTlsVerify: true,
      sendCookies: true,
      method: 'GET',
    })
  })
})
