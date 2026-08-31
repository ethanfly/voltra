// Node.js 系：原生 http/https（P1 验收语言）/ node-fetch / Axios
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { jsStr, urlencodedString, graphqlBodyText, splitUrl, b64Unicode, hasVars } from '../esc'

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

function basicHeaderValue(c: CodegenCtx): { key: string; value: string; runtime?: string } | null {
  if (c.auth.type !== 'basic' || !c.auth.basic) return null
  if (c.headers.some((h) => h.key.toLowerCase() === 'authorization')) return null
  const raw = c.auth.basic.username + ':' + c.auth.basic.password
  if (hasVars(raw)) return { key: 'Authorization', value: '', runtime: `"Basic " + Buffer.from(${jsStr(raw)}).toString("base64")` }
  return { key: 'Authorization', value: 'Basic ' + b64Unicode(raw) }
}

/** 原生 http/https（P1 验收语言） */
function nodeNative(c: CodegenCtx): string {
  const u = splitUrl(c.fullUrl)
  const mod = u.scheme === 'http' ? 'http' : 'https'
  const lines: string[] = [`const ${mod} = require("${mod}")`]
  if (c.bodyType === 'binary') lines.push('const fs = require("fs")')
  lines.push('')

  const optLines: string[] = []
  if (c.method !== 'GET') optLines.push(`  method: ${jsStr(c.method)},`)
  optLines.push(`  hostname: ${jsStr(u.host)},`)
  if (u.port !== (u.scheme === 'http' ? '80' : '443')) optLines.push(`  port: ${Number(u.port)},`)
  optLines.push(`  path: ${jsStr(u.path || '/')},`)

  const hdr = [...effectiveHeaders(c)]
  const ba = basicHeaderValue(c)
  if (hdr.length || ba) {
    optLines.push('  headers: {')
    for (const h of hdr) optLines.push(`    ${jsStr(h.key)}: ${jsStr(h.value)},`)
    if (ba) optLines.push(`    ${jsStr(ba.key)}: ${ba.runtime ?? jsStr(ba.value)},`)
    optLines.push('  },')
  }
  if (mod === 'https' && c.insecure) optLines.push('  rejectUnauthorized: false,')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) optLines.push(`  timeout: ${c.timeoutMs},`)

  lines.push(`const options = {\n${optLines.join('\n')}\n}`)
  lines.push('')
  lines.push(`const req = ${mod}.request(options, (res) => {`)
  lines.push('  let data = ""')
  lines.push('  res.on("data", (chunk) => (data += chunk))')
  lines.push('  res.on("end", () => console.log(res.statusCode, data))')
  lines.push('})')
  lines.push('')
  lines.push('req.on("error", (err) => console.error(err))')

  if (c.bodyType === 'raw') lines.push(`req.write(${jsStr(c.raw)})`)
  else if (c.bodyType === 'urlencoded') lines.push(`req.write(${jsStr(urlencodedString(c.urlEncoded))})`)
  else if (c.bodyType === 'graphql' && c.graphql) lines.push(`req.write(${jsStr(graphqlBodyText(c.graphql))})`)
  else if (c.bodyType === 'binary') lines.push(`req.write(fs.readFileSync(${jsStr(c.binaryPath)}))`)
  else if (c.bodyType === 'form-data') lines.push('// multipart/form-data 需手工拼接 boundary（或改用 node-fetch + form-data / Axios）')
  lines.push('req.end()')
  return lines.join('\n')
}

/** node-fetch */
function nodeFetch(c: CodegenCtx): string {
  const lines: string[] = ['const fetch = require("node-fetch")']
  const fdLines: string[] = []
  let bodyExpr: string | null = null

  if (c.bodyType === 'raw') bodyExpr = jsStr(c.raw)
  else if (c.bodyType === 'urlencoded') bodyExpr = jsStr(urlencodedString(c.urlEncoded))
  else if (c.bodyType === 'graphql' && c.graphql) bodyExpr = jsStr(graphqlBodyText(c.graphql))
  else if (c.bodyType === 'form-data') {
    fdLines.push('const FormData = require("form-data")')
    const hasFile = c.formData.some((f) => f.enabled && f.type === 'file')
    if (hasFile) fdLines.push('const fs = require("fs")')
    fdLines.push('const fd = new FormData()')
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') fdLines.push(`fd.append(${jsStr(f.key)}, fs.createReadStream(${jsStr(f.filePath || '')}))`)
      else fdLines.push(`fd.append(${jsStr(f.key)}, ${jsStr(f.value)})`)
    }
    lines.push(...fdLines)
    bodyExpr = 'fd'
  } else if (c.bodyType === 'binary') bodyExpr = `fs.createReadStream(${jsStr(c.binaryPath)})`
  if (c.bodyType === 'binary') lines.splice(1, 0, 'const fs = require("fs")')

  const optLines: string[] = []
  if (c.method !== 'GET') optLines.push(`  method: ${jsStr(c.method)},`)
  const hdr = [...effectiveHeaders(c)]
  const ba = basicHeaderValue(c)
  if (hdr.length || ba) {
    optLines.push('  headers: {')
    for (const h of hdr) optLines.push(`    ${jsStr(h.key)}: ${jsStr(h.value)},`)
    if (ba) optLines.push(`    ${jsStr(ba.key)}: ${ba.runtime ?? jsStr(ba.value)},`)
    optLines.push('  },')
  }
  if (bodyExpr) optLines.push(`  body: ${bodyExpr},`)
  if (c.insecure) lines.push('// node-fetch 跳过 TLS 校验需自定义 https.Agent（rejectUnauthorized: false）')
  lines.push(`const response = await fetch(${jsStr(c.fullUrl)}${optLines.length ? ', {\n' + optLines.join('\n') + '\n  }' : ''})`)
  lines.push('console.log(response.status, await response.text())')
  return lines.join('\n')
}

/** Axios（Node） */
function nodeAxios(c: CodegenCtx): string {
  const lines: string[] = ['const axios = require("axios")']
  const fdLines: string[] = []
  let dataExpr: string | null = null

  if (c.bodyType === 'raw') dataExpr = jsStr(c.raw)
  else if (c.bodyType === 'urlencoded') dataExpr = jsStr(urlencodedString(c.urlEncoded))
  else if (c.bodyType === 'graphql' && c.graphql) dataExpr = jsStr(graphqlBodyText(c.graphql))
  else if (c.bodyType === 'form-data') {
    fdLines.push('const FormData = require("form-data")')
    const hasFile = c.formData.some((f) => f.enabled && f.type === 'file')
    if (hasFile) fdLines.push('const fs = require("fs")')
    fdLines.push('const fd = new FormData()')
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') fdLines.push(`fd.append(${jsStr(f.key)}, fs.createReadStream(${jsStr(f.filePath || '')}))`)
      else fdLines.push(`fd.append(${jsStr(f.key)}, ${jsStr(f.value)})`)
    }
    lines.push(...fdLines)
    dataExpr = 'fd'
  } else if (c.bodyType === 'binary') {
    lines.push('const fs = require("fs")')
    dataExpr = `fs.createReadStream(${jsStr(c.binaryPath)})`
  }
  if (fdLines.length || c.bodyType === 'binary') lines.push('')

  const optLines: string[] = []
  if (c.method !== 'GET') optLines.push(`  method: ${jsStr(c.method)},`)
  optLines.push(`  url: ${jsStr(c.fullUrl)},`)
  const hdr = [...effectiveHeaders(c)]
  const ba = basicHeaderValue(c)
  if (hdr.length || ba) {
    optLines.push('  headers: {')
    for (const h of hdr) optLines.push(`    ${jsStr(h.key)}: ${jsStr(h.value)},`)
    if (ba) optLines.push(`    ${jsStr(ba.key)}: ${ba.runtime ?? jsStr(ba.value)},`)
    optLines.push('  },')
  }
  if (dataExpr) optLines.push(`  data: ${dataExpr},`)
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) optLines.push(`  timeout: ${c.timeoutMs},`)
  if (c.insecure) optLines.push('  https: { rejectUnauthorized: false },')

  lines.push(`const response = await axios({\n${optLines.join('\n')}\n})`)
  lines.push('console.log(response.status, response.data)')
  return lines.join('\n')
}

export const nodeGens = { native: nodeNative, 'node-fetch': nodeFetch, axios: nodeAxios }
