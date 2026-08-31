// Python 系：requests / http.client
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { pyStr, urlencodedString, graphqlBodyText, splitUrl, b64Unicode, hasVars } from '../esc'

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

/** requests（P1 验收语言） */
function requests(c: CodegenCtx): string {
  const lines: string[] = ['import requests', '']
  if (c.headers.length) {
    lines.push('headers = {')
    for (const h of effectiveHeaders(c)) lines.push(`    ${pyStr(h.key)}: ${pyStr(h.value)},`)
    lines.push('}', '')
  }
  const args: string[] = [pyStr(c.method), pyStr(c.fullUrl)]
  if (c.headers.length) args.push('headers=headers')
  if (c.bodyType === 'raw') args.push(`data=${pyStr(c.raw)}`)
  else if (c.bodyType === 'urlencoded') {
    args.push(`data=${pyStr(urlencodedString(c.urlEncoded))}`)
  } else if (c.bodyType === 'graphql' && c.graphql) args.push(`data=${pyStr(graphqlBodyText(c.graphql))}`)
  else if (c.bodyType === 'form-data') {
    const files = c.formData.filter((f) => f.enabled && f.type === 'file')
    const texts = c.formData.filter((f) => f.enabled && f.type !== 'file')
    if (texts.length) {
      lines.push('form_data = {')
      for (const f of texts) lines.push(`    ${pyStr(f.key)}: ${pyStr(f.value)},`)
      lines.push('}')
    }
    if (files.length) {
      lines.push('files = {')
      for (const f of files) {
        const name = (f.filePath || f.key).split('/').pop() || f.key
        lines.push(`    ${pyStr(f.key)}: (${pyStr(name)}, open(${pyStr(f.filePath || '')}, "rb")),`)
      }
      lines.push('}')
    }
    if (texts.length) args.push('data=form_data')
    if (files.length) args.push('files=files')
  } else if (c.bodyType === 'binary') args.push(`data=open(${pyStr(c.binaryPath)}, "rb")`)
  if (c.auth.type === 'basic' && c.auth.basic && !c.headers.some((h) => h.key.toLowerCase() === 'authorization')) {
    args.push(`auth=(${pyStr(c.auth.basic.username)}, ${pyStr(c.auth.basic.password)})`)
  }
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) args.push(`timeout=${seconds(c.timeoutMs)}`)
  if (c.insecure) args.push('verify=False')

  lines.push('response = requests.request(', ...args.map((a) => '    ' + a + ','), ')', '', 'print(response.text)')
  return lines.join('\n')
}

/** http.client（标准库） */
function httpClient(c: CodegenCtx): string {
  const u = splitUrl(c.fullUrl)
  const isHttps = u.scheme !== 'http'
  const cls = isHttps ? 'HTTPSConnection' : 'HTTPConnection'
  const portArg = u.port === (isHttps ? '443' : '80') ? '' : `, ${u.port}`

  const lines: string[] = ["import http.client"]
  if (c.insecure) lines.push('import ssl')
  if (hasVars((c.auth.basic?.username ?? '') + (c.auth.basic?.password ?? '')) && c.auth.type === 'basic') {
    lines.push('import base64')
  }
  lines.push('')

  const ctxArg = c.insecure ? ', context=ssl._create_unverified_context()' : ''
  lines.push(`conn = http.client.${cls}(${pyStr(u.host)}${portArg}${ctxArg})`)

  const headerLines = effectiveHeaders(c).map((h) => `    ${pyStr(h.key)}: ${pyStr(h.value)}`)
  if (c.auth.type === 'basic' && c.auth.basic) {
    const hv = hasVars(c.auth.basic.username + c.auth.basic.password)
    if (!c.headers.some((h) => h.key.toLowerCase() === 'authorization')) {
      if (hv) headerLines.push(`    "Authorization": "Basic " + base64.b64encode(b${pyStr(c.auth.basic.username + ':' + c.auth.basic.password)}).decode()`)
      else headerLines.push(`    "Authorization": "Basic ${b64Unicode(c.auth.basic.username + ':' + c.auth.basic.password)}"`)
    }
  }
  let bodyArg = ''
  if (c.bodyType === 'raw') bodyArg = `body=${pyStr(c.raw)}`
  else if (c.bodyType === 'urlencoded') bodyArg = `body=${pyStr(urlencodedString(c.urlEncoded))}`
  else if (c.bodyType === 'graphql' && c.graphql) bodyArg = `body=${pyStr(graphqlBodyText(c.graphql))}`
  else if (c.bodyType === 'binary') bodyArg = `body=open(${pyStr(c.binaryPath)}, "rb").read()`
  else if (c.bodyType === 'form-data') lines.push('# multipart/form-data 请用 requests（http.client 不内置 multipart 构造）')

  lines.push('conn.request(', `    ${pyStr(c.method)},`, `    ${pyStr(u.path)},`)
  if (bodyArg) lines.push('    ' + bodyArg + ',')
  if (headerLines.length) {
    lines.push('    headers={')
    for (const l of headerLines) lines.push(l + ',')
    lines.push('    },')
  }
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) lines.push(`    timeout=${seconds(c.timeoutMs)},`)
  lines.push(')')
  lines.push('')
  lines.push('resp = conn.getresponse()')
  lines.push('data = resp.read()')
  lines.push('print(data.decode("utf-8"))')
  lines.push('conn.close()')
  return lines.join('\n')
}

export const pythonGens = { requests, 'http.client': httpClient }
