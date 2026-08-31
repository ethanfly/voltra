// cookies.ts 纯函数：Set-Cookie 解析
import { describe, it, expect } from 'vitest'
import { parseSetCookie, parseSetCookies } from '../src/lib/cookies'

describe('parseSetCookie', () => {
  it('基本 name=value + 属性', () => {
    const c = parseSetCookie('sid=abc123; Path=/; Domain=example.com; Secure; HttpOnly')
    expect(c).toEqual({
      name: 'sid',
      value: 'abc123',
      path: '/',
      domain: 'example.com',
      expires: undefined,
      maxAge: undefined,
      httpOnly: true,
      secure: true,
      sameSite: undefined,
    })
  })

  it('Expires 含逗号不被误切', () => {
    const c = parseSetCookie('sid=xyz123; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/')
    expect(c?.name).toBe('sid')
    expect(c?.expires).toBe('Wed, 21 Oct 2026 07:28:00 GMT')
    expect(c?.path).toBe('/')
  })

  it('Max-Age 转数字 / SameSite', () => {
    const c = parseSetCookie('a=b; Max-Age=3600; SameSite=Lax')
    expect(c?.maxAge).toBe(3600)
    expect(c?.sameSite).toBe('Lax')
  })

  it('value 可为空 / 含等号', () => {
    expect(parseSetCookie('flag=')?.value).toBe('')
    expect(parseSetCookie('k=a=b=c')?.value).toBe('a=b=c')
  })

  it('畸形（无 =）返回 null', () => {
    expect(parseSetCookie('garbage')).toBeNull()
    expect(parseSetCookie('=v')).toBeNull()
    expect(parseSetCookie('')).toBeNull()
  })
})

describe('parseSetCookies', () => {
  it('按 Set-Cookie 头（忽略大小写）收集，一条头多个 cookie 也能拆', () => {
    const cs = parseSetCookies([
      { key: 'Content-Type', value: 'text/html', enabled: true },
      { key: 'SET-COOKIE', value: 'a=1, b=2; Path=/', enabled: true },
      { key: 'Set-Cookie', value: 'c=3; Secure', enabled: true },
    ])
    expect(cs.map((c) => c.name)).toEqual(['a', 'b', 'c'])
    expect(cs[1].path).toBe('/')
    expect(cs[2].secure).toBe(true)
  })

  it('null headers 返回空', () => {
    expect(parseSetCookies(null)).toEqual([])
  })

  it('Expires 逗号行 + 第二个 cookie 混排', () => {
    const cs = parseSetCookies([
      {
        key: 'Set-Cookie',
        value: 's=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT, t=2',
        enabled: true,
      },
    ])
    expect(cs).toHaveLength(2)
    expect(cs[0].name).toBe('s')
    expect(cs[0].expires).toBe('Wed, 21 Oct 2026 07:28:00 GMT')
    expect(cs[1].name).toBe('t')
  })
})
