import { describe, it, expect } from 'vitest'
import { parseCurl } from '../src/lib/curl'

describe('parseCurl', () => {
  it('复杂样本：折行 + -X/-H/--data-raw + URL query + --compressed warning', () => {
    const r = parseCurl(
      [
        "curl 'https://api.example.com/users?page=1' \\",
        '  -X POST \\',
        "  -H 'Content-Type: application/json' \\",
        "  -H 'Authorization: Bearer tok123' \\",
        "  --data-raw '{\"name\":\"voltra\"}' \\",
        '  --compressed',
      ].join('\n'),
    )
    expect(r.ok).toBe(true)
    const req = r.request!
    expect(req.method).toBe('POST')
    expect(req.url).toBe('https://api.example.com/users')
    expect(req.params).toEqual([{ key: 'page', value: '1', enabled: true }])
    expect(req.headers.map((h) => [h.key, h.value])).toEqual([
      ['Content-Type', 'application/json'],
      ['Authorization', 'Bearer tok123'],
    ])
    expect(req.body).toEqual({ type: 'raw', raw: '{"name":"voltra"}', rawLang: 'json' })
    expect(req.auth).toEqual({ type: 'none' })
    expect(r.warnings!.length).toBe(1)
    expect(r.warnings![0]).toContain('--compressed')
    expect(req.name).toBe('users')
  })

  it('-d 无 -X 时默认 POST；JSON 自动识别补 Content-Type', () => {
    const r = parseCurl("curl -d '{\"x\":1}' https://x.com/echo")
    expect(r.ok).toBe(true)
    expect(r.request!.method).toBe('POST')
    expect(r.request!.body).toEqual({ type: 'raw', raw: '{"x":1}', rawLang: 'json' })
    expect(r.request!.headers).toContainEqual({ key: 'Content-Type', value: 'application/json', enabled: true })
  })

  it('-d 非 JSON → text，不补 Content-Type', () => {
    const r = parseCurl('curl -d a=1 http://x.com/echo')
    expect(r.ok).toBe(true)
    expect(r.request!.body).toEqual({ type: 'raw', raw: 'a=1', rawLang: 'text' })
    expect(r.request!.headers).toHaveLength(0)
  })

  it('-u user:pass → basic auth', () => {
    const r = parseCurl('curl -u alice:secret https://x.com')
    expect(r.ok).toBe(true)
    expect(r.request!.auth).toEqual({ type: 'basic', basic: { username: 'alice', password: 'secret' } })
  })

  it('--insecure / --max-time → settings', () => {
    const r = parseCurl('curl --insecure --max-time 5 https://x.com')
    expect(r.ok).toBe(true)
    expect(r.request!.settings.insecureSkipTlsVerify).toBe(true)
    expect(r.request!.settings.timeoutMs).toBe(5000)
    expect(r.request!.settings.followRedirects).toBe(true)
    expect(r.request!.method).toBe('GET')
  })

  it('--max-redirs → maxRedirects', () => {
    const r = parseCurl('curl --max-redirs 3 https://x.com')
    expect(r.ok).toBe(true)
    expect(r.request!.settings.maxRedirects).toBe(3)
  })

  it('--data-urlencode → urlencoded body + Content-Type', () => {
    const r = parseCurl("curl --data-urlencode 'name=voltra' --data-urlencode 'tag=a b' https://x.com/reg")
    expect(r.ok).toBe(true)
    expect(r.request!.body).toEqual({ type: 'urlencoded', urlencoded: [{ key: 'name', value: 'voltra', enabled: true }, { key: 'tag', value: 'a b', enabled: true }] })
    expect(r.request!.headers).toContainEqual({ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true })
  })

  it('双引号 Header 值含空格', () => {
    const r = parseCurl('curl -H "X-Foo: bar baz" https://x.com')
    expect(r.ok).toBe(true)
    expect(r.request!.headers).toContainEqual({ key: 'X-Foo', value: 'bar baz', enabled: true })
  })

  it('; 前缀 Header → 禁用行（置空语义保留为 disabled）', () => {
    const r = parseCurl("curl -H ';X-Off: 1' https://x.com")
    expect(r.ok).toBe(true)
    expect(r.request!.headers).toContainEqual({ key: 'X-Off', value: '1', enabled: false })
  })

  it('-F form-data：text / file（含 ;type=）', () => {
    const r = parseCurl("curl -F 'file=@/tmp/a.png;type=image/png' -F 'name=voltra' https://x.com/up")
    expect(r.ok).toBe(true)
    expect(r.request!.method).toBe('POST')
    expect(r.request!.body.type).toBe('form-data')
    expect(r.request!.body.formData).toEqual([
      { key: 'file', value: '', enabled: true, type: 'file', filePath: '/tmp/a.png', description: 'image/png' },
      { key: 'name', value: 'voltra', enabled: true, type: 'text' },
    ])
  })

  it('-G 时 -d 数据进 query，body 清空', () => {
    const r = parseCurl("curl -G -d 'a=1&b=2' https://x.com/search")
    expect(r.ok).toBe(true)
    expect(r.request!.method).toBe('GET')
    expect(r.request!.body).toEqual({ type: 'none' })
    expect(r.request!.params).toEqual([
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
    ])
  })

  it('-b cookie → Cookie header', () => {
    const r = parseCurl("curl -b 'sid=42' https://x.com")
    expect(r.ok).toBe(true)
    expect(r.request!.headers).toContainEqual({ key: 'Cookie', value: 'sid=42', enabled: true })
  })

  it('未知选项收集 warning 不抛', () => {
    const r = parseCurl('curl --fuzzy https://x.com')
    expect(r.ok).toBe(true)
    expect(r.warnings!.some((w) => w.includes('--fuzzy'))).toBe(true)
  })

  it('非法输入不抛：非 curl 命令 / 空串 / 无 URL', () => {
    expect(parseCurl('ls -la').ok).toBe(false)
    expect(parseCurl('').ok).toBe(false)
    expect(parseCurl('curl').ok).toBe(false)
    expect(parseCurl('curl --header').ok).toBe(false)
  })
})
