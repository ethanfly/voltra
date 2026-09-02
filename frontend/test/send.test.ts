// 发送管线纯逻辑：继承合并（header/auth）+ auth 注入 + 变量替换 + body 映射
import { describe, it, expect, beforeEach } from 'vitest'
import { workspace } from '../src/stores/workspace'
import { env, varMeta } from '../src/stores/env'
import { newProject, newCollection, newFolder, newRequest, defaultHeaders, APP_VERSION } from '../src/types/models'
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

describe('auth 注入：阶段17 新类型', () => {
  it('jwt 注入 Authorization: Bearer；raw 模式保留 {{var}} 原样', () => {
    const { r } = setup()
    env.globalVars = [{ key: 'sig', initialValue: '', currentValue: 'x509', enabled: true }]
    r.auth = { type: 'jwt', jwt: { token: 'eyJ.abc.{{sig}}' } }
    let go = buildGoRequest(r)
    expect(go.headers.find((h) => h.key === 'Authorization')?.value).toBe('Bearer eyJ.abc.x509')
    go = buildGoRequest(r, { resolve: false })
    expect(go.headers.find((h) => h.key === 'Authorization')?.value).toBe('Bearer eyJ.abc.{{sig}}')
  })

  it('oauth2：accessToken 非空注入 Bearer；为空不注入（无 Authorization 头）', () => {
    const { r } = setup()
    r.auth = {
      type: 'oauth2',
      oauth2: { accessToken: 'at-1', grant: 'manual', tokenUrl: '', clientId: '', clientSecret: '', username: '', password: '', scope: '' },
    }
    let go = buildGoRequest(r)
    expect(go.headers.find((h) => h.key === 'Authorization')?.value).toBe('Bearer at-1')
    r.auth.oauth2!.accessToken = ''
    go = buildGoRequest(r)
    expect(go.headers.find((h) => h.key === 'Authorization')).toBeUndefined()
  })

  it('digest/oauth1/awsv4 不注入 Authorization，经结构化字段透传（变量可替换）', () => {
    const { r } = setup()
    env.globalVars = [{ key: 'u', initialValue: '', currentValue: 'dig-user', enabled: true }]

    r.auth = { type: 'digest', digest: { username: '{{u}}', password: 'pw', realm: 'test' } }
    let go = buildGoRequest(r)
    expect(go.headers.find((h) => h.key === 'Authorization')).toBeUndefined()
    expect(go.digest).toEqual({ username: 'dig-user', password: 'pw', realm: 'test' })
    expect(go.oauth1).toBeNull()
    expect(go.awsV4).toBeNull()

    r.auth = {
      type: 'oauth1',
      oauth1: { consumerKey: 'ck', consumerSecret: 'cs', token: 'tk', tokenSecret: 'ts', signatureMethod: 'HMAC-SHA256' },
    }
    go = buildGoRequest(r)
    expect(go.headers.find((h) => h.key === 'Authorization')).toBeUndefined()
    expect(go.digest).toBeNull()
    expect(go.awsV4).toBeNull()
    expect(go.oauth1).toEqual({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      token: 'tk',
      tokenSecret: 'ts',
      signatureMethod: 'HMAC-SHA256',
    })

    r.auth = { type: 'awsv4', awsv4: { accessKeyId: 'AK', secretAccessKey: 'SK', region: 'us-east-1', service: 's3' } }
    go = buildGoRequest(r)
    expect(go.oauth1).toBeNull()
    expect(go.awsV4).toEqual({ accessKeyId: 'AK', secretAccessKey: 'SK', region: 'us-east-1', service: 's3' })
  })

  it('签名型 + inherit 链：祖先配 digest，请求 inherit → 结构化字段生效', () => {
    const { r, f } = setup()
    f.auth = { type: 'digest', digest: { username: 'a', password: 'b' } }
    r.auth = { type: 'inherit' }
    const go = buildGoRequest(r)
    expect(go.digest).toEqual({ username: 'a', password: 'b' })
  })
})

describe('默认请求头', () => {
  it('newRequest 带 4 行默认头，UA 与 APP_VERSION 交叉锁定', () => {
    expect(defaultHeaders()).toEqual([
      { key: 'User-Agent', value: `Voltra/${APP_VERSION}`, enabled: true },
      { key: 'Accept', value: '*/*', enabled: true },
      { key: 'Accept-Language', value: 'zh-CN', enabled: true },
      { key: 'Cache-Control', value: 'no-cache', enabled: true },
    ])
    expect(defaultHeaders()[0].value).toBe('Voltra/0.2.0')
    expect(newRequest().headers).toEqual(defaultHeaders())
  })

  it('导入路径显式传 headers 时不携带默认行（...partial 覆盖）', () => {
    const r = newRequest({ headers: [{ key: 'X-Only', value: '1', enabled: true }] })
    expect(r.headers).toEqual([{ key: 'X-Only', value: '1', enabled: true }])
  })
})

describe('环境作用域（验收 #4：{{baseUrl}}/users）', () => {
  it('环境级 > 项目级 > 全局；切换当前环境改变发送值；禁用行回退低层', () => {
    const { r } = setup()
    r.url = '{{baseUrl}}/users'
    const p = workspace.projects[0]
    env.globalVars = [{ key: 'baseUrl', initialValue: '', currentValue: 'https://g.example.com', enabled: true }]
    p.variables = [{ key: 'baseUrl', initialValue: '', currentValue: 'https://p.example.com', enabled: true }]
    const e = {
      id: 'e1',
      name: 'dev',
      variables: [{ key: 'baseUrl', initialValue: '', currentValue: 'https://dev.example.com', enabled: true }],
    }
    p.environments = [e]

    env.currentEnvId = null
    expect(buildGoRequest(r).url).toBe('https://p.example.com/users') // 项目级覆盖全局

    env.currentEnvId = e.id // 顶部切到 dev
    expect(buildGoRequest(r).url).toBe('https://dev.example.com/users') // 环境级覆盖项目

    env.currentEnvId = null
    p.variables[0].enabled = false
    expect(buildGoRequest(r).url).toBe('https://g.example.com/users') // 项目行禁用后回退全局
  })

  it('secret 变量打码显示但不影响发送真实值', () => {
    const { r } = setup()
    env.globalVars = [{ key: 'token', initialValue: '', currentValue: 'real-secret', enabled: true, secret: true }]
    r.url = 'https://example.com/?t={{token}}'
    expect(buildGoRequest(r).url).toBe('https://example.com/?t=real-secret')
    expect(varMeta('token')).toEqual({ defined: true, value: 'real-secret', secret: true, display: '••••••' })
    expect(varMeta('nope')).toMatchObject({ defined: false })
  })
})
