import { describe, it, expect } from 'vitest'
import { resolveVars, extractVarNames } from '../src/lib/vars'

describe('resolveVars', () => {
  it('替换已定义变量', () => {
    const r = resolveVars('https://{{host}}/users/{{id}}', { host: 'api.example.com', id: '42' })
    expect(r.text).toBe('https://api.example.com/users/42')
    expect(r.missing).toEqual([])
    expect(r.replaced).toEqual(['host', 'id'])
  })

  it('未定义变量原样保留并收集到 missing', () => {
    const r = resolveVars('{{a}}/{{b}}/{{a}}', { a: '1' })
    expect(r.text).toBe('1/{{b}}/1')
    expect(r.missing).toEqual(['b'])
    expect(r.replaced).toEqual(['a', 'a'])
  })

  it('空文本 / 无变量文本原样返回', () => {
    expect(resolveVars('', { a: '1' })).toEqual({ text: '', replaced: [], missing: [] })
    expect(resolveVars('https://plain.com', { a: '1' }).text).toBe('https://plain.com')
  })

  it('变量值为空串也算已定义', () => {
    const r = resolveVars('x={{a}}', { a: '' })
    expect(r.text).toBe('x=')
    expect(r.missing).toEqual([])
  })

  it('变量名支持 . $ - 与数字', () => {
    const r = resolveVars('{{api.v2}} {{$dyn}} {{a-b_9}}', {
      'api.v2': 'V2',
      '$dyn': 'D',
      'a-b_9': 'N',
    })
    expect(r.text).toBe('V2 D N')
    expect(r.missing).toEqual([])
  })

  it('相邻变量与多次出现', () => {
    const r = resolveVars('{{a}}{{b}}{{a}}', { a: 'x', b: 'y' })
    expect(r.text).toBe('xyx')
  })

  it('无闭合的花括号不替换', () => {
    expect(resolveVars('{{unclosed', {}).text).toBe('{{unclosed')
    expect(resolveVars('}}orphan', {}).text).toBe('}}orphan')
    expect(resolveVars('{{}}', {}).text).toBe('{{}}')
  })

  it('变量值为普通文本（含花括号）不二次展开', () => {
    const r = resolveVars('{{a}}', { a: '{{b}}' })
    expect(r.text).toBe('{{b}}')
  })

  it('值中的 {{}} 字面量不二次展开', () => {
    const r = resolveVars('a={{x}}c', { x: 'b{{q}}d' })
    expect(r.text).toBe('a=b{{q}}dc')
  })
})

describe('extractVarNames', () => {
  it('去重且保持首次出现序', () => {
    expect(extractVarNames('{{a}} {{b}} {{a}} {{c-x.2}}')).toEqual(['a', 'b', 'c-x.2'])
  })

  it('无变量返回空数组', () => {
    expect(extractVarNames('plain text {{broken')).toEqual([])
    expect(extractVarNames('')).toEqual([])
  })
})
