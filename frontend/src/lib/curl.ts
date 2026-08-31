// cURL 命令解析（纯函数）：粘贴 cURL → 前端 Request
// 覆盖常用选项：-X/-H/--data(-raw)/--data-urlencode/-F/-u/-b/-k/-L/--max-time/--max-redirs/-G
// 不支持的选项收集进 warnings，不抛异常；解析失败返回 { ok: false, error }
import type { Request, KVPair, FormField } from '../types/models'
import { newRequest } from '../types/models'
import { splitUrlToQuery } from './url'

export interface CurlParseResult {
  ok: boolean
  error?: string
  request?: Request
  warnings?: string[]
}

/** 词法分析：支持单/双引号（双引号内反斜杠转义）与反斜杠转义；折行续行在入口已合并 */
function tokenize(src: string): string[] {
  const out: string[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === "'") {
      i++
      let s = ''
      while (i < n && src[i] !== "'") {
        s += src[i]
        i++
      }
      i++ // 跳过收尾引号（缺失时到末尾自然结束）
      out.push(s)
      continue
    }
    if (c === '"') {
      i++
      let s = ''
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) {
          const nx = src[i + 1]
          if (nx === 'n') s += '\n'
          else if (nx === 't') s += '\t'
          else s += nx
          i += 2
        } else {
          s += src[i]
          i++
        }
      }
      i++
      out.push(s)
      continue
    }
    // 普通 token：读到空白；反斜杠转义取下一字符
    let s = ''
    while (i < n && !/\s/.test(src[i])) {
      if (src[i] === '\\' && i + 1 < n) {
        s += src[i + 1]
        i += 2
      } else {
        s += src[i]
        i++
      }
    }
    out.push(s)
  }
  return out
}

/** 取 flag 的值：--opt=value 内联，否则取下一个 token */
function flagValue(tokens: string[], i: number, tok: string): [string, number] {
  const eq = tok.indexOf('=')
  if (tok.startsWith('--') && eq > 2) return [tok.slice(eq + 1), i]
  const v = tokens[i + 1]
  if (v === undefined) return ['', i]
  return [v, i + 1]
}

function isDataFlag(f: string): boolean {
  return f === '-d' || f === '--data' || f === '--data-raw' || f === '--data-binary' || f === '--data-ascii'
}

/** 解析 cURL 命令文本。永不抛异常。 */
export function parseCurl(input: string): CurlParseResult {
  const src = input.replace(/\\\r?\n/g, ' ')
  const tokens = tokenize(src)
  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') {
    return { ok: false, error: '不是 cURL 命令（需以 curl 开头）' }
  }

  const warnings: string[] = []
  let method = ''
  let url = ''
  let requestTarget = ''
  const headers: KVPair[] = []
  const dataParts: string[] = []
  const urlEncoded: KVPair[] = []
  const formFields: FormField[] = []
  let basic: { username: string; password: string } | null = null
  let forceBasic = false
  let addCookie: string | null = null
  let hasData = false
  let asGet = false
  let insecure = false
  let timeoutMs: number | null = null
  let maxRedirects: number | null = null

  const setHeader = (key: string, value: string, enabled = true, replace = false) => {
    if (replace) {
      const i = headers.findIndex((h) => h.key.toLowerCase() === key.toLowerCase())
      if (i >= 0) {
        headers[i] = { key, value, enabled }
        return
      }
    }
    headers.push({ key, value, enabled })
  }

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]
    if (!tok.startsWith('-')) {
      // 裸参数 = URL
      if (url) warnings.push(`忽略多余 URL: ${tok}`)
      else url = tok
      continue
    }

    let flag = tok
    let inlineVal = ''
    let hasInline = false
    const eq = tok.indexOf('=')
    if (tok.startsWith('--') && eq > 2) {
      flag = tok.slice(0, eq)
      inlineVal = tok.slice(eq + 1)
      hasInline = true
    }

    const take = (): [string, boolean] => {
      if (hasInline) return [inlineVal, false]
      const v = tokens[i + 1]
      if (v === undefined) return ['', false]
      i++
      return [v, true]
    }

    switch (flag) {
      case '-X':
      case '--request': {
        const [v] = take()
        if (v) method = v.toUpperCase()
        break
      }
      case '-H':
      case '--header': {
        const [v] = take()
        const ci = v.indexOf(':')
        if (ci <= 0) {
          warnings.push(`无法解析 Header: ${v}`)
          break
        }
        const disabled = v.startsWith(';')
        const body = disabled ? v.slice(1) : v
        const ci2 = body.indexOf(':')
        if (ci2 <= 0) {
          warnings.push(`无法解析 Header: ${v}`)
          break
        }
        const key = body.slice(0, ci2).trim()
        const value = body.slice(ci2 + 1).trim()
        setHeader(key, value, !disabled)
        break
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii': {
        const [v] = take()
        dataParts.push(v)
        hasData = true
        break
      }
      case '--data-urlencode': {
        const [v] = take()
        const ci = v.indexOf('=')
        if (ci > 0) {
          urlEncoded.push({ key: v.slice(0, ci), value: v.slice(ci + 1), enabled: true })
        } else {
          warnings.push('--data-urlencode 需要 name=content 形式，已忽略: ' + v)
        }
        hasData = true
        break
      }
      case '-F':
      case '--form': {
        const [v] = take()
        const fi = v.indexOf('=')
        if (fi <= 0) {
          warnings.push(`无法解析 form 字段: ${v}`)
          break
        }
        const key = v.slice(0, fi)
        let val = v.slice(fi + 1)
        let type = 'text'
        let filePath = ''
        let mime = ''
        // name=@path;type=mime / name=<path
        if (val.startsWith('@') || val.startsWith('<')) {
          type = 'file'
          let rest = val.slice(1)
          const semi = rest.indexOf(';')
          if (semi >= 0) {
            const meta = rest.slice(semi + 1)
            rest = rest.slice(0, semi)
            const m = meta.match(/type=([\w.\/+-]+)/)
            if (m) mime = m[1]
          }
          if (rest === '-') warnings.push(`form 字段 ${key} 引用 stdin，已留空`)
          filePath = rest
        }
        formFields.push({
          key,
          value: type === 'file' ? '' : val,
          enabled: true,
          type,
          filePath: type === 'file' ? filePath : undefined,
          description: mime || undefined,
        })
        hasData = true
        break
      }
      case '-u':
      case '--user': {
        const [v] = take()
        const ci = v.indexOf(':')
        basic = { username: ci >= 0 ? v.slice(0, ci) : v, password: ci >= 0 ? v.slice(ci + 1) : '' }
        forceBasic = true
        break
      }
      case '--basic':
        forceBasic = true
        break
      case '-b':
      case '--cookie': {
        const [v] = take()
        addCookie = v
        break
      }
      case '-A':
      case '--user-agent': {
        const [v] = take()
        if (v) setHeader('User-Agent', v, true, true)
        break
      }
      case '-e':
      case '--referer': {
        const [v] = take()
        if (v) setHeader('Referer', v, true, true)
        break
      }
      case '-k':
      case '--insecure':
        insecure = true
        break
      case '-L':
      case '--location':
        break // followRedirects 默认就是 true
      case '--max-redirs': {
        const [v] = take()
        const n = Number(v)
        if (Number.isFinite(n) && n >= 0) maxRedirects = Math.floor(n)
        break
      }
      case '--max-time':
      case '--connect-timeout': {
        const [v] = take()
        const s = Number(v)
        if (Number.isFinite(s) && s > 0 && (timeoutMs === null || flag === '--max-time')) {
          timeoutMs = Math.round(s * 1000)
        }
        break
      }
      case '-G':
        asGet = true
        break
      case '--url': {
        const [v] = take()
        if (v && !url) url = v
        break
      }
      case '--request-target': {
        const [v] = take()
        requestTarget = v
        break
      }
      case '--compressed':
        warnings.push('--compressed 暂不支持（Go 侧固定发送 gzip 协商头）')
        break
      case '-o':
      case '--output':
      case '-T':
      case '--upload-file':
      case '--http1.0':
      case '--http1.1':
      case '--http2':
      case '--http3':
      case '--tlsv1.2':
      case '--tlsv1.3':
        // 对发送结果无影响的选项，静默忽略
        if (!hasInline) {
          const nx = tokens[i + 1]
          if (nx !== undefined && !nx.startsWith('-') && (flag === '-o' || flag === '--output' || flag === '-T' || flag === '--upload-file')) i++
        }
        break
      default:
        warnings.push(`未识别的选项: ${flag}`)
        // 未知 flag 若带后续值且像值（非 flag）时不吞，避免误吞 URL
    }
  }

  if (!url) {
    return { ok: false, error: '未找到 URL' }
  }
  if (requestTarget) {
    // 仅当 URL 无路径时补上 target
    const qIdx = url.indexOf('?')
    const base = qIdx >= 0 ? url.slice(0, qIdx) : url
    if (!base.includes('/', base.indexOf('://') + 3)) url = base + requestTarget + (qIdx >= 0 ? url.slice(qIdx) : '')
  }

  // URL 里的 query → params
  const { baseUrl, pairs } = splitUrlToQuery(url)

  // -G：-d 数据进 query
  if (asGet) {
    for (const part of dataParts) {
      for (const seg of part.split('&')) {
        if (!seg) continue
        const ci = seg.indexOf('=')
        if (ci > 0) pairs.push({ key: seg.slice(0, ci), value: seg.slice(ci + 1), enabled: true })
        else pairs.push({ key: seg, value: '', enabled: true })
      }
    }
    dataParts.length = 0
  }

  if (addCookie !== null) setHeader('Cookie', addCookie, true, true)

  // body 定型
  let body: Request['body'] = { type: 'none' }
  const ctHeader = headers.find((h) => h.key.toLowerCase() === 'content-type')
  const ct = (ctHeader?.value ?? '').toLowerCase()
  if (formFields.length > 0) {
    body = { type: 'form-data', formData: formFields }
  } else if (urlEncoded.length > 0) {
    body = { type: 'urlencoded', urlencoded: urlEncoded }
    if (dataParts.length > 0) warnings.push('-d 与 --data-urlencode 混用，仅保留 urlencoded')
    if (!ctHeader) headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true })
  } else if (dataParts.length > 0) {
    const raw = dataParts.join('&')
    let rawLang: 'json' | 'xml' | 'text' | 'html'
    if (ct.includes('json')) rawLang = 'json'
    else if (ct.includes('xml')) rawLang = 'xml'
    else if (ct.includes('html')) rawLang = 'html'
    else if (ctHeader) rawLang = 'text'
    else {
      try {
        JSON.parse(raw)
        rawLang = 'json'
      } catch {
        rawLang = 'text'
      }
    }
    body = { type: 'raw', raw, rawLang }
    if (!ctHeader && rawLang === 'json') {
      headers.push({ key: 'Content-Type', value: 'application/json', enabled: true })
    }
  }

  // method 兜底：有 body 且未显式 -X → POST
  if (!method) method = formFields.length > 0 || urlEncoded.length > 0 || dataParts.length > 0 ? 'POST' : 'GET'

  // 名字取 URL 末段
  let name = 'cURL 导入'
  try {
    const u = new URL(url.includes('://') ? url : 'http://x' + url)
    const segs = u.pathname.split('/').filter(Boolean)
    if (segs.length) name = decodeURIComponent(segs[segs.length - 1]) || name
  } catch {
    /* 保留默认名 */
  }

  const req = newRequest({
    name,
    protocol: 'http',
    method,
    url: baseUrl,
    params: pairs,
    headers,
    body,
    auth:
      basic || forceBasic
        ? { type: 'basic', basic: basic ?? { username: '', password: '' } }
        : { type: 'none' },
    settings: {
      ...newRequest().settings,
      timeoutMs: timeoutMs ?? 30000,
      followRedirects: true,
      maxRedirects: maxRedirects ?? 10,
      insecureSkipTlsVerify: insecure,
    },
  })

  return { ok: true, request: req, warnings }
}
