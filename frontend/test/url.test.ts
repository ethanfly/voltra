import { describe, it, expect } from 'vitest'
import { normalizeUrlPreview, splitUrlToQuery, mergeQueryToUrl } from '../src/lib/url'
import type { KVPair } from '../src/types/models'

describe('normalizeUrlPreview（与 Go 侧 normalizeURL 规则一致）', () => {
  it.each([
    ['www.baidu.com', 'https://www.baidu.com'],
    ['api.example.com/users?x=1', 'https://api.example.com/users?x=1'],
    ['localhost:3000', 'http://localhost:3000'],
    ['localhost', 'http://localhost'],
    ['127.0.0.1:8080', 'http://127.0.0.1:8080'],
    ['[::1]', 'http://[::1]'],
    ['::1:8080', 'http://::1:8080'],
    ['[::1]:8080', 'http://[::1]:8080'],
    ['0.0.0.0:9000', 'http://0.0.0.0:9000'],
    ['foo.local:3000', 'http://foo.local:3000'],
    [':8080', 'http://:8080'],
    ['10.0.0.1:8080', 'https://10.0.0.1:8080'],
    ['https://example.com/a', 'https://example.com/a'],
    ['http://10.0.0.1/x', 'http://10.0.0.1/x'],
    ['  www.example.com  ', 'https://www.example.com'],
  ])('normalizeUrlPreview(%s) = %s', (input, want) => {
    expect(normalizeUrlPreview(input)).toBe(want)
  })

  it('空输入返回空串', () => {
    expect(normalizeUrlPreview('')).toBe('')
    expect(normalizeUrlPreview('   ')).toBe('')
  })
})

describe('splitUrlToQuery / mergeQueryToUrl', () => {
  const kv = (key: string, value: string, enabled = true): KVPair => ({ key, value, enabled })

  it('无 query 的 URL 原样返回', () => {
    expect(splitUrlToQuery('https://a.com/b')).toEqual({
      baseUrl: 'https://a.com/b',
      pairs: [],
    })
  })

  it('保序解码，空段跳过', () => {
    const { baseUrl, pairs } = splitUrlToQuery('https://a.com/b?q=中文 词&x=1&&empty')
    expect(baseUrl).toBe('https://a.com/b')
    expect(pairs.map((p) => [p.key, p.value])).toEqual([
      ['q', '中文 词'],
      ['x', '1'],
      ['empty', ''],
    ])
    expect(pairs.every((p) => p.enabled)).toBe(true)
  })

  it('merge 编码特殊字符并保持行序（空格 → +，与 Go QueryEscape 一致）', () => {
    const url = mergeQueryToUrl('https://a.com/b', [
      kv('q', '中文 词'),
      kv('a&b', 'x=y'),
      kv('off', '1', false),
      kv('', 'ignored'),
    ])
    expect(url).toBe('https://a.com/b?q=%E4%B8%AD%E6%96%87+%E8%AF%8D&a%26b=x%3Dy')
  })

  it('全部行禁用时不带 ?', () => {
    expect(mergeQueryToUrl('https://a.com/b', [kv('a', '1', false)])).toBe('https://a.com/b')
  })

  it('split → merge 往返一致', () => {
    const original = 'https://a.com/b?x=1&q=hello+world&z='
    const { baseUrl, pairs } = splitUrlToQuery(original)
    expect(mergeQueryToUrl(baseUrl, pairs)).toBe(original)
  })

  it('空格统一编码为 +（与 Go 侧 QueryEscape 逐字符一致）', () => {
    const { baseUrl, pairs } = splitUrlToQuery('https://a.com/search?q=中文 词')
    const merged = mergeQueryToUrl(baseUrl, pairs)
    expect(merged).toBe('https://a.com/search?q=%E4%B8%AD%E6%96%87+%E8%AF%8D')
  })
})
