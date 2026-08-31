import { describe, it, expect } from 'vitest'
import { resolveVars, extractVarNames, findVarTokens, segmentVars, missingVarNames } from '../src/lib/vars'

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

describe('findVarTokens', () => {
  it('返回 name 与精确偏移（含括号）', () => {
    const toks = findVarTokens('ab{{x}}cd{{y.z}}')
    expect(toks).toEqual([
      { name: 'x', start: 2, end: 7 },
      { name: 'y.z', start: 9, end: 16 },
    ])
  })

  it('无变量 / 未闭合返回空', () => {
    expect(findVarTokens('plain')).toEqual([])
    expect(findVarTokens('{{broken')).toEqual([])
    expect(findVarTokens('')).toEqual([])
  })
})

describe('segmentVars', () => {
  it('切段后拼接还原原文（镜像高亮依赖）', () => {
    const segs = segmentVars('https://{{baseUrl}}/users?x={{a}}')
    expect(segs.map((s) => s.text).join('')).toBe('https://{{baseUrl}}/users?x={{a}}')
    expect(segs).toHaveLength(4)
    expect(segs[1].name).toBe('baseUrl')
    expect(segs[1].text).toBe('{{baseUrl}}')
    expect(segs[3].name).toBe('a')
  })

  it('全普通文本为单段；空文本为空', () => {
    expect(segmentVars('abc')).toEqual([{ text: 'abc' }])
    expect(segmentVars('')).toEqual([])
  })

  it('相邻变量无空段', () => {
    const segs = segmentVars('{{a}}{{b}}')
    expect(segs).toHaveLength(2)
    expect(segs.some((s) => s.text === '')).toBe(false)
  })
})

describe('missingVarNames', () => {
  it('只报未定义、去重保序', () => {
    expect(missingVarNames('{{a}} {{b}} {{a}} {{c}}', { a: '1' })).toEqual(['b', 'c'])
  })

  it('全部已定义 / 无变量返回空', () => {
    expect(missingVarNames('{{a}}', { a: '1' })).toEqual([])
    expect(missingVarNames('plain', { a: '1' })).toEqual([])
  })

  it('空串值也算已定义', () => {
    expect(missingVarNames('{{a}}', { a: '' })).toEqual([])
  })
})
