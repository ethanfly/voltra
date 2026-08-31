// format.ts 纯函数：prettyJson / formatBytes / detectLang / binaryHexSummary
import { describe, it, expect } from 'vitest'
import { prettyJson, formatBytes, detectLang, binaryHexSummary } from '../src/lib/format'

describe('prettyJson', () => {
  it('合法 JSON 美化（2 空格）', () => {
    expect(prettyJson('{"b":1,"a":[1,2]}')).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}')
  })
  it('非法 JSON 返回 null', () => {
    expect(prettyJson('{')).toBeNull()
    expect(prettyJson('')).toBeNull()
    expect(prettyJson('{"a":{{')).toBeNull()
  })
})

describe('formatBytes', () => {
  it('边界与单位', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB') // >=100 不再带小数
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
  })
  it('非法输入', () => {
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(NaN)).toBe('0 B')
    expect(formatBytes(Infinity)).toBe('0 B')
  })
})

describe('detectLang', () => {
  it('Content-Type 优先', () => {
    expect(detectLang('application/json; charset=utf-8', 'x')).toBe('json')
    expect(detectLang('text/html; charset=utf-8', 'x')).toBe('html')
    expect(detectLang('application/xml', 'x')).toBe('xml')
    expect(detectLang('text/javascript', 'x')).toBe('javascript')
  })
  it('无类型时按内容特征', () => {
    expect(detectLang('', '{"a":1}')).toBe('json')
    expect(detectLang('text/plain', '[1,2]')).toBe('json')
    expect(detectLang('text/plain', '<html><body>hi</body></html>')).toBe('html')
    expect(detectLang('', '<?xml version="1.0"?>')).toBe('xml')
    expect(detectLang('', 'hello world')).toBe('text')
    expect(detectLang('', '<a href="x">')).toBe('text') // 非 html/xml 起始
  })
})

describe('binaryHexSummary', () => {
  it('前 N 字节 hex', () => {
    const b64 = Buffer.from([0, 1, 255, 16, 17]).toString('base64')
    expect(binaryHexSummary(b64, 64)).toBe('00 01 ff 10 11')
    expect(binaryHexSummary(b64, 2)).toBe('00 01')
  })
  it('非法 base64 返回空串', () => {
    expect(binaryHexSummary('%%%')).toBe('')
    expect(binaryHexSummary('')).toBe('')
  })
})
