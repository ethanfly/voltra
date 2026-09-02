import { describe, it, expect } from 'vitest'
import { parsePostman, parsePostmanEnvironment } from '../src/lib/postman'
import { exportPostmanCollection, exportPostmanEnvironments } from '../src/lib/postman-export'
import { newProject, newCollection, newFolder, newRequest } from '../src/types/models'
import type { Request, Collection } from '../src/types/models'

// 真实感 v2.1 样本：2 层文件夹、5 接口、disabled header、3 种 body、3 种 auth、
// event 脚本、集合 variable（含 secret/disabled）、1 个不支持 auth、1 个无路径 file、1 个畸形 item
const SAMPLE = {
  info: { name: 'Demo API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  variable: [
    { key: 'baseUrl', value: 'https://api.example.com' },
    { key: 'token', value: 's3cret', type: 'secret' },
    { key: 'off', value: 'x', disabled: true },
  ],
  item: [
    {
      name: 'Users',
      item: [
        {
          name: 'Get User',
          request: {
            method: 'GET',
            header: [
              { key: 'Accept', value: 'application/json' },
              { key: 'X-Off', value: '1', disabled: true },
            ],
            url: { raw: '{{baseUrl}}/users/1?inc=me', query: [{ key: 'inc', value: 'me' }] },
          },
        },
        {
          name: 'Create User',
          event: [
            { listen: 'test', script: { exec: ["pm.test('ok', () => pm.response.to.have.status(200));"] } },
            { listen: 'prerequest', script: { exec: ["pm.variables.set('t', 1);"] } },
          ],
          request: {
            method: 'post',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: '{{baseUrl}}/users',
            body: { mode: 'raw', raw: '{"name":"a"}', options: { raw: { language: 'json' } } },
            auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc', type: 'string' }] },
          },
        },
      ],
    },
    {
      name: 'Nested',
      item: [
        {
          name: 'Inner',
          item: [
            {
              name: 'Upload',
              request: {
                method: 'POST',
                url: 'https://api.example.com/upload',
                body: {
                  mode: 'formdata',
                  formdata: [
                    { key: 'file', type: 'file', src: '/tmp/a.png' },
                    { key: 'file2', type: 'file', src: [] },
                    { key: 'note', value: 'hi', type: 'text' },
                  ],
                },
                auth: { type: 'basic', basic: [{ key: 'username', value: 'u' }, { key: 'password', value: 'p' }] },
              },
            },
          ],
        },
      ],
    },
    {
      name: 'Login',
      request: {
        method: 'POST',
        url: {
          raw: 'https://api.example.com/login?redirect=/home',
          host: ['api', 'example', 'com'],
          path: ['login'],
          query: [{ key: 'redirect', value: '/home' }],
        },
        body: { mode: 'urlencoded', urlencoded: [{ key: 'user', value: 'bob' }] },
        auth: { type: 'apikey', apikey: [{ key: 'key', value: 'k1' }, { key: 'value', value: 'v1' }, { key: 'in', value: 'header' }] },
      },
    },
    {
      name: 'OAuth2',
      request: { method: 'GET', url: 'https://api.example.com/x', auth: { type: 'oauth2', oauth2: [] } },
    },
    { name: 'Broken', foo: 1 },
  ],
}

describe('parsePostman', () => {
  const r = parsePostman(JSON.stringify(SAMPLE))
  expect(r.ok).toBe(true)
  const res = r as Extract<typeof r, { ok: true }>

  it('集合名与变量（secret/disabled 保留）', () => {
    expect(res.name).toBe('Demo API')
    expect(res.collection.name).toBe('Demo API')
    expect(res.variables).toEqual([
      { key: 'baseUrl', initialValue: 'https://api.example.com', currentValue: 'https://api.example.com', enabled: true },
      { key: 'token', initialValue: 's3cret', currentValue: 's3cret', enabled: true, secret: true },
      { key: 'off', initialValue: 'x', currentValue: 'x', enabled: false },
    ])
  })

  it('树形状：2 层文件夹 + 5 接口，跳过项计数', () => {
    expect(res.requestCount).toBe(5)
    expect(res.folderCount).toBe(3)
    expect(res.skipped).toBe(2) // 无路径 file + 畸形 Broken（oauth2 已支持，不再计数）
    const items = res.collection.items
    expect(items.map((n) => n.name)).toEqual(['Users', 'Nested', 'Login', 'OAuth2'])
    const users = items[0]
    expect(users.kind).toBe('folder')
    expect(users.items.map((n) => n.name)).toEqual(['Get User', 'Create User'])
    const nested = items[1]
    expect(nested.kind).toBe('folder')
    expect(nested.items[0].kind).toBe('folder')
    expect((nested.items[0] as { items: unknown[] }).items[0]).toMatchObject({ name: 'Upload', kind: 'request' })
  })

  it('Get User：url 对象 query 优先 + disabled header', () => {
    const get = (res.collection.items[0] as { items: Request[] }).items[0]
    expect(get.url).toBe('{{baseUrl}}/users/1')
    expect(get.params).toEqual([{ key: 'inc', value: 'me', enabled: true }])
    expect(get.headers).toEqual([
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'X-Off', value: '1', enabled: false },
    ])
  })

  it('Create User：method 大写 + raw json + bearer + 双脚本', () => {
    const create = (res.collection.items[0] as { items: Request[] }).items[1]
    expect(create.method).toBe('POST')
    expect(create.url).toBe('{{baseUrl}}/users')
    expect(create.body).toEqual({ type: 'raw', raw: '{"name":"a"}', rawLang: 'json' })
    expect(create.auth).toEqual({ type: 'bearer', bearer: { token: 'abc' } })
    expect(create.testScript).toContain("pm.test('ok'")
    expect(create.preRequestScript).toContain("pm.variables.set")
  })

  it('Upload：form-data（file 无路径计数跳过）+ basic', () => {
    const nested = res.collection.items[1] as { items: { items: Request[] }[] }
    const up = nested.items[0].items[0]
    expect(up.body.type).toBe('form-data')
    expect(up.body.formData).toEqual([
      { key: 'file', value: '', enabled: true, type: 'file', filePath: '/tmp/a.png' },
      { key: 'file2', value: '', enabled: true, type: 'file', filePath: '' },
      { key: 'note', value: 'hi', enabled: true, type: 'text' },
    ])
    expect(up.auth).toEqual({ type: 'basic', basic: { username: 'u', password: 'p' } })
  })

  it('Login：urlencoded + apikey + raw 裁掉 query', () => {
    const login = res.collection.items[2] as Request
    expect(login.url).toBe('https://api.example.com/login')
    expect(login.params).toEqual([{ key: 'redirect', value: '/home', enabled: true }])
    expect(login.body).toEqual({ type: 'urlencoded', urlencoded: [{ key: 'user', value: 'bob', enabled: true }] })
    expect(login.auth).toEqual({ type: 'apikey', apikey: { key: 'k1', value: 'v1', in: 'header' } })
  })

  it('OAuth2：映射为 hand-filled 形态（accessToken 空 + grant manual，不计数跳过）', () => {
    const o = res.collection.items[3] as Request
    expect(o.auth).toEqual({
      type: 'oauth2',
      oauth2: { accessToken: '', grant: 'manual', tokenUrl: '', clientId: '', clientSecret: '', username: '', password: '', scope: '' },
    })
    expect(res.warnings.some((w) => w.includes('oauth2'))).toBe(false)
  })

  it('非法 JSON / 非集合 → ok:false 不抛', () => {
    expect(parsePostman('not json').ok).toBe(false)
    expect(parsePostman('{"a":1}').ok).toBe(false)
  })
})

describe('parsePostmanEnvironment', () => {
  it('root 文件 → 多环境 + globals', () => {
    const root = {
      name: 'root',
      values: {
        environments: [
          { name: 'dev', values: [{ key: 'a', value: '1' }, { key: 's', value: '2', type: 'secret', disabled: true }] },
          { name: 'prod', values: [] },
        ],
        globals: [{ key: 'g', value: '3' }],
      },
    }
    const r = parsePostmanEnvironment(JSON.stringify(root))
    expect(r.ok).toBe(true)
    const ok = r as Extract<typeof r, { ok: true }>
    expect(ok.environments.map((e) => e.name)).toEqual(['dev', 'prod'])
    expect(ok.environments[0].variables).toEqual([
      { key: 'a', initialValue: '1', currentValue: '1', enabled: true },
      { key: 's', initialValue: '2', currentValue: '2', enabled: false, secret: true },
    ])
    expect(ok.globals).toEqual([{ key: 'g', initialValue: '3', currentValue: '3', enabled: true }])
  })

  it('单环境文件', () => {
    const r = parsePostmanEnvironment(JSON.stringify({ name: 'e', values: [{ key: 'k', value: 'v' }] }))
    expect(r.ok).toBe(true)
    const ok = r as Extract<typeof r, { ok: true }>
    expect(ok.environments).toHaveLength(1)
    expect(ok.environments[0].name).toBe('e')
    expect(ok.environments[0].variables[0].key).toBe('k')
  })

  it('与 exportPostmanEnvironments 往返一致', () => {
    const r = parsePostmanEnvironment(
      exportPostmanEnvironments(
        [{ id: 'e1', name: 'dev', variables: [{ key: 'h', initialValue: 'a', currentValue: 'b', enabled: true }] }],
        [{ key: 'g', initialValue: 'x', currentValue: 'y', enabled: true }],
      ),
    )
    expect(r.ok).toBe(true)
    const ok = r as Extract<typeof r, { ok: true }>
    expect(ok.environments[0].name).toBe('dev')
    expect(ok.environments[0].variables).toEqual([{ key: 'h', initialValue: 'b', currentValue: 'b', enabled: true }])
    expect(ok.globals[0].key).toBe('g')
  })
})

describe('exportPostmanCollection', () => {
  function buildProject(): { p: ReturnType<typeof newProject>; c: Collection } {
    const p = newProject({ name: 'P' })
    const c = newCollection({ name: 'C' })
    p.collections.push(c)
    p.variables.push({ key: 'h', initialValue: 'v', currentValue: 'v2', enabled: true })

    const r1 = newRequest({
      name: 'R1',
      method: 'PUT',
      url: 'https://x.com/a',
      params: [
        { key: 'q', value: '1', enabled: true },
        { key: 'o', value: '2', enabled: false },
      ],
      headers: [{ key: 'K', value: 'V', enabled: true }],
      body: { type: 'raw', raw: '{"a":1}', rawLang: 'json' },
      auth: { type: 'bearer', bearer: { token: 't' } },
    })
    const r2 = newRequest({
      name: 'R2',
      url: 'http://y.com/b',
      body: { type: 'urlencoded', urlencoded: [{ key: 'u', value: 'w', enabled: true }] },
      auth: { type: 'basic', basic: { username: 'n', password: 'p' } },
      preRequestScript: 'x=1',
      testScript: 'y=2',
    })
    const r3 = newRequest({
      name: 'R3',
      url: 'https://z.com/c',
      body: {
        type: 'form-data',
        formData: [
          { key: 'f', type: 'file', filePath: '/tmp/f', value: '', enabled: true },
          { key: 'n', type: 'text', value: 't', enabled: true },
        ],
      },
      auth: { type: 'apikey', apikey: { key: 'ak', value: 'av', in: 'query' } },
    })
    const f = newFolder({ name: 'F' })
    f.items.push(r3)
    c.items.push(r1, r2, f)
    return { p, c }
  }

  it('导出含 schema/variable/items，结构完整', () => {
    const { p } = buildProject()
    const out = JSON.parse(exportPostmanCollection(p))
    expect(out.info.name).toBe('P')
    expect(out.info.schema).toContain('v2.1.0')
    expect(out.variable).toEqual([{ key: 'h', value: 'v2' }])
    expect(out.item.map((i: { name: string }) => i.name)).toEqual(['R1', 'R2', 'F'])
    expect(out.item[0].request.method).toBe('PUT')
    expect(out.item[0].request.url.raw).toBe('https://x.com/a?q=1') // disabled 行不进 raw
    expect(out.item[0].request.url.query).toEqual([
      { key: 'q', value: '1' },
      { key: 'o', value: '2', disabled: true },
    ])
    expect(out.item[2].item[0].request.body.mode).toBe('formdata')
  })

  it('导出 → 导入 往返一致（验收关键路径）', () => {
    const { p } = buildProject()
    const r = parsePostman(exportPostmanCollection(p))
    expect(r.ok).toBe(true)
    const ok = r as Extract<typeof r, { ok: true }>
    expect(ok.name).toBe('P')
    expect(ok.skipped).toBe(0)
    expect(ok.requestCount).toBe(3)
    expect(ok.folderCount).toBe(1)
    expect(ok.variables).toEqual([{ key: 'h', initialValue: 'v2', currentValue: 'v2', enabled: true }])

    const items = ok.collection.items
    const r1 = items[0] as Request
    expect(r1.method).toBe('PUT')
    expect(r1.url).toBe('https://x.com/a')
    expect(r1.params).toEqual([
      { key: 'q', value: '1', enabled: true },
      { key: 'o', value: '2', enabled: false },
    ])
    expect(r1.body).toEqual({ type: 'raw', raw: '{"a":1}', rawLang: 'json' })
    expect(r1.auth).toEqual({ type: 'bearer', bearer: { token: 't' } })

    const r2 = items[1] as Request
    expect(r2.url).toBe('http://y.com/b')
    expect(r2.body).toEqual({ type: 'urlencoded', urlencoded: [{ key: 'u', value: 'w', enabled: true }] })
    expect(r2.auth).toEqual({ type: 'basic', basic: { username: 'n', password: 'p' } })
    expect(r2.preRequestScript).toBe('x=1')
    expect(r2.testScript).toBe('y=2')

    const f = items[2]
    expect(f.kind).toBe('folder')
    const r3 = (f as { items: Request[] }).items[0]
    expect(r3.body.type).toBe('form-data')
    expect(r3.body.formData).toEqual([
      { key: 'f', value: '', enabled: true, type: 'file', filePath: '/tmp/f' },
      { key: 'n', value: 't', enabled: true, type: 'text' },
    ])
    expect(r3.auth).toEqual({ type: 'apikey', apikey: { key: 'ak', value: 'av', in: 'query' } })
  })

  it('多集合导出：每个集合包一层同名文件夹', () => {
    const p = newProject({ name: 'MP' })
    p.collections.push(newCollection({ name: 'A' }), newCollection({ name: 'B' }))
    const out = JSON.parse(exportPostmanCollection(p))
    expect(out.item.map((i: { name: string }) => i.name)).toEqual(['A', 'B'])
    expect(out.item[0].item).toEqual([])
  })
})

// ---------- 阶段17：5 个新 auth 类型导入映射 + 导出往返 ----------
describe('parsePostman 新 auth 映射（jwt/digest/oauth1/awsv4 + 不支持仍计数）', () => {
  const r = parsePostman(
    JSON.stringify({
      info: { name: 'auth' },
      item: [
        { name: 'J', request: { method: 'GET', url: 'https://x.com', auth: { type: 'jwt', jwt: [{ key: 'token', value: 'abc' }] } } },
        {
          name: 'D',
          request: {
            method: 'GET',
            url: 'https://x.com',
            auth: {
              type: 'digest',
              digest: [{ key: 'username', value: 'u' }, { key: 'password', value: 'p' }, { key: 'realm', value: 'r' }],
            },
          },
        },
        {
          name: 'O1',
          request: {
            method: 'GET',
            url: 'https://x.com',
            auth: {
              type: 'signaturev1',
              signaturev1: [
                { key: 'consumerKey', value: 'ck' },
                { key: 'consumerSecret', value: 'cs' },
                { key: 'token', value: 'tk' },
                { key: 'tokenSecret', value: 'ts' },
                { key: 'signatureMethod', value: 'HMAC-SHA256' },
              ],
            },
          },
        },
        {
          name: 'A4',
          request: {
            method: 'GET',
            url: 'https://x.com',
            auth: {
              type: 'awsv4',
              awsv4: [
                { key: 'accessKey', value: 'AK' },
                { key: 'secretKey', value: 'SK' },
                { key: 'region', value: 'us-east-1' },
                { key: 'service', value: 's3' },
              ],
            },
          },
        },
        { name: 'H', request: { method: 'GET', url: 'https://x.com', auth: { type: 'hawk', hawk: [] } } },
      ],
    }),
  )
  expect(r.ok).toBe(true)
  const res = r as Extract<typeof r, { ok: true }>

  it('jwt / digest / oauth1 / awsv4 逐字段映射', () => {
    const items = res.collection.items
    expect((items[0] as Request).auth).toEqual({ type: 'jwt', jwt: { token: 'abc' } })
    expect((items[1] as Request).auth).toEqual({ type: 'digest', digest: { username: 'u', password: 'p', realm: 'r' } })
    expect((items[2] as Request).auth).toEqual({
      type: 'oauth1',
      oauth1: { consumerKey: 'ck', consumerSecret: 'cs', token: 'tk', tokenSecret: 'ts', signatureMethod: 'HMAC-SHA256' },
    })
    expect((items[3] as Request).auth).toEqual({
      type: 'awsv4',
      awsv4: { accessKeyId: 'AK', secretAccessKey: 'SK', region: 'us-east-1', service: 's3' },
    })
  })

  it('signatureMethod 非法值回落 HMAC-SHA1', () => {
    const r2 = parsePostman(
      JSON.stringify({
        info: { name: 'x' },
        item: [
          {
            name: 'O1',
            request: {
              method: 'GET',
              url: 'https://x.com',
              auth: { type: 'oauth1', oauth1: [{ key: 'signatureMethod', value: 'weird' }] },
            },
          },
        ],
      }),
    )
    const ok = r2 as Extract<typeof r2, { ok: true }>
    expect((ok.collection.items[0] as Request).auth.oauth1?.signatureMethod).toBe('HMAC-SHA1')
  })

  it('hawk 仍不支持 → none + warning + 计数', () => {
    expect((res.collection.items[4] as Request).auth).toEqual({ type: 'none' })
    expect(res.skipped).toBe(1)
    expect(res.warnings.some((w) => w.includes('hawk'))).toBe(true)
  })
})

describe('exportPostmanCollection 新 auth 往返', () => {
  it('jwt/digest/oauth1/oauth2/awsv4 导出再导入字段一致', () => {
    const p = newProject({ name: 'P' })
    const c = newCollection({ name: 'C' })
    p.collections.push(c)
    c.items.push(
      newRequest({
        name: 'j',
        url: 'https://x.com',
        auth: { type: 'jwt', jwt: { token: 't' } },
      }),
      newRequest({
        name: 'd',
        url: 'https://x.com',
        auth: { type: 'digest', digest: { username: 'u', password: 'p', realm: 'r' } },
      }),
      newRequest({
        name: 'o1',
        url: 'https://x.com',
        auth: {
          type: 'oauth1',
          oauth1: {
            consumerKey: 'ck',
            consumerSecret: 'cs',
            token: 'tk',
            tokenSecret: 'ts',
            signatureMethod: 'PLAINTEXT',
          },
        },
      }),
      newRequest({
        name: 'o2',
        url: 'https://x.com',
        auth: {
          type: 'oauth2',
          oauth2: {
            accessToken: 'at',
            grant: 'manual',
            tokenUrl: '',
            clientId: 'cid',
            clientSecret: 'sec',
            username: '',
            password: '',
            scope: '',
          },
        },
      }),
      newRequest({
        name: 'a4',
        url: 'https://x.com',
        auth: { type: 'awsv4', awsv4: { accessKeyId: 'AK', secretAccessKey: 'SK', region: 'eu-west-1', service: 's3' } },
      }),
    )
    const r = parsePostman(exportPostmanCollection(p))
    expect(r.ok).toBe(true)
    const ok = r as Extract<typeof r, { ok: true }>
    expect(ok.skipped).toBe(0)
    const items = ok.collection.items
    expect((items[0] as Request).auth).toEqual({ type: 'jwt', jwt: { token: 't' } })
    expect((items[1] as Request).auth).toEqual({ type: 'digest', digest: { username: 'u', password: 'p', realm: 'r' } })
    expect((items[2] as Request).auth.oauth1).toMatchObject({ signatureMethod: 'PLAINTEXT', consumerKey: 'ck' })
    expect((items[3] as Request).auth.oauth2).toMatchObject({
      accessToken: 'at',
      grant: 'manual',
      clientId: 'cid',
      clientSecret: 'sec',
    })
    expect((items[4] as Request).auth.awsv4).toMatchObject({ accessKeyId: 'AK', secretAccessKey: 'SK', region: 'eu-west-1', service: 's3' })
  })
})
