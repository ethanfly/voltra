// JWT payload 解码（仅解码不验签）：base64url 三段式 → JSON
import { describe, it, expect } from 'vitest'
import { decodeJwtPayload } from '../src/lib/jwt'

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}
function makeJwt(payload: string): string {
  return `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(payload)}.sig`
}

describe('decodeJwtPayload', () => {
  it('标准三段式 → 解码出 payload JSON', () => {
    expect(decodeJwtPayload(makeJwt('{"sub":"1234567890","name":"John Doe","admin":true}'))).toEqual({
      sub: '1234567890',
      name: 'John Doe',
      admin: true,
    })
  })

  it('Unicode payload（UTF-8 多字节）正确还原', () => {
    expect(decodeJwtPayload(makeJwt('{"name":"梁","city":"上海"}'))).toEqual({ name: '梁', city: '上海' })
  })

  it('段数错误 / 空串 → null', () => {
    expect(decodeJwtPayload('')).toBeNull()
    expect(decodeJwtPayload('only-one-segment')).toBeNull()
    expect(decodeJwtPayload('a.b.c.d')).toBeNull()
  })

  it('中段非法 base64 / 非 JSON → null（不抛）', () => {
    expect(decodeJwtPayload('a.!!!!.c')).toBeNull()
    expect(decodeJwtPayload(`${b64url('{"a":1}')}.not-json.`.slice(0, -1) + 'c')).toBeNull()
  })

  it('首尾空白容错', () => {
    expect(decodeJwtPayload(`  ${makeJwt('{"x":1}')}  `)).toEqual({ x: 1 })
  })
})
