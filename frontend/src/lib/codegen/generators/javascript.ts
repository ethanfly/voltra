// 浏览器 JavaScript 系：fetch / Axios / XMLHttpRequest / jQuery.ajax
import type { CodegenCtx } from '../context'
import { effectiveHeaders } from '../context'
import { jsStr, urlencodedString, graphqlBodyText, b64Unicode, hasVars } from '../esc'
import type { FormField } from '../../../types/models'

/** basic auth 的 JS 值表达式（含变量时输出运行时 btoa，否则预计算字面量） */
function basicAuthValue(c: CodegenCtx): string | null {
  if (c.auth.type !== 'basic' || !c.auth.basic) return null
  if (c.headers.some((h) => h.key.toLowerCase() === 'authorization')) return null
  const raw = c.auth.basic.username + ':' + c.auth.basic.password
  if (hasVars(raw)) return `"Basic " + btoa(${jsStr(raw)})`
  return jsStr('Basic ' + b64Unicode(raw))
}

function basicHeaderLine(c: CodegenCtx): string | null {
  const v = basicAuthValue(c)
  return v ? `    "Authorization": ${v},` : null
}

/** 表单文件字段的占位变量名 */
function fileVar(i: number): string {
  return `file${i + 1}`
}

/** fetch（P1 验收语言） */
function fetchGen(c: CodegenCtx): string {
  const lines: string[] = []
  let fdLines: string[] = []
  let bodyExpr: string | null = null

  if (c.bodyType === 'raw') bodyExpr = jsStr(c.raw)
  else if (c.bodyType === 'urlencoded') {
    bodyExpr = `new URLSearchParams([${c.urlEncoded.map((p) => `[${jsStr(p.key)}, ${jsStr(p.value)}]`).join(', ')}])`
  } else if (c.bodyType === 'graphql' && c.graphql) bodyExpr = jsStr(graphqlBodyText(c.graphql))
  else if (c.bodyType === 'form-data') {
    fdLines.push('const fd = new FormData()')
    let fi = 0
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') {
        lines.push(`// 文件字段：请替换为 File/Blob 对象（如 <input type="file"> 的 files[0]）`)
        fdLines.push(`fd.append(${jsStr(f.key)}, ${fileVar(fi)})`)
        fi++
      } else {
        fdLines.push(`fd.append(${jsStr(f.key)}, ${jsStr(f.value)})`)
      }
    }
    bodyExpr = 'fd'
  } else if (c.bodyType === 'binary') {
    lines.push('// 请替换为 File/Blob 对象')
    bodyExpr = 'file'
  }

  if (fdLines.length) lines.push(...fdLines, '')

  const optLines: string[] = []
  if (c.method !== 'GET') optLines.push(`  method: ${jsStr(c.method)},`)
  const hdr = [...effectiveHeaders(c)]
  const bl = basicHeaderLine(c)
  if (hdr.length || bl) {
    optLines.push('  headers: {')
    for (const h of hdr) optLines.push(`    ${jsStr(h.key)}: ${jsStr(h.value)},`)
    if (bl) optLines.push(bl)
    optLines.push('  },')
  }
  if (bodyExpr) optLines.push(`  body: ${bodyExpr},`)
  if (c.timeoutMs !== 30000) optLines.push(`  signal: AbortSignal.timeout(${c.timeoutMs}),`)
  if (c.insecure) lines.push('// 浏览器 fetch 无法跳过 TLS 证书校验')

  lines.push(`const response = await fetch(${jsStr(c.fullUrl)}${optLines.length ? ', {\n' + optLines.join('\n') + '\n  }' : ''})`)
  lines.push('const data = await response.text()')
  lines.push('console.log(data)')
  return lines.join('\n')
}

/** Axios（浏览器） */
function axiosGen(c: CodegenCtx): string {
  const lines: string[] = []
  let fdLines: string[] = []
  let dataExpr: string | null = null

  if (c.bodyType === 'raw') dataExpr = jsStr(c.raw)
  else if (c.bodyType === 'urlencoded') {
    dataExpr = `new URLSearchParams([${c.urlEncoded.map((p) => `[${jsStr(p.key)}, ${jsStr(p.value)}]`).join(', ')}])`
  } else if (c.bodyType === 'graphql' && c.graphql) dataExpr = jsStr(graphqlBodyText(c.graphql))
  else if (c.bodyType === 'form-data') {
    fdLines.push('const fd = new FormData()')
    let fi = 0
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') {
        lines.push('// 文件字段：请替换为 File/Blob 对象')
        fdLines.push(`fd.append(${jsStr(f.key)}, ${fileVar(fi)})`)
        fi++
      } else fdLines.push(`fd.append(${jsStr(f.key)}, ${jsStr(f.value)})`)
    }
    dataExpr = 'fd'
  } else if (c.bodyType === 'binary') {
    lines.push('// 请替换为 File/Blob 对象')
    dataExpr = 'file'
  }
  if (fdLines.length) lines.push(...fdLines, '')

  const optLines: string[] = []
  if (c.method !== 'GET') optLines.push(`  method: ${jsStr(c.method)},`)
  optLines.push(`  url: ${jsStr(c.fullUrl)},`)
  const hdr = [...effectiveHeaders(c)]
  const bl = basicHeaderLine(c)
  if (hdr.length || bl) {
    optLines.push('  headers: {')
    for (const h of hdr) optLines.push(`    ${jsStr(h.key)}: ${jsStr(h.value)},`)
    if (bl) optLines.push(bl)
    optLines.push('  },')
  }
  if (dataExpr) optLines.push(`  data: ${dataExpr},`)
  if (c.timeoutMs !== 30000) optLines.push(`  timeout: ${c.timeoutMs},`)
  if (c.insecure) lines.push('// 浏览器 Axios 无法跳过 TLS 证书校验')

  lines.push(`const response = await axios({\n${optLines.join('\n')}\n})`)
  lines.push('console.log(response.data)')
  return lines.join('\n')
}

/** XMLHttpRequest */
function xhrGen(c: CodegenCtx): string {
  const lines: string[] = ['const xhr = new XMLHttpRequest()']
  lines.push(`xhr.open(${jsStr(c.method)}, ${jsStr(c.fullUrl)})`)
  for (const h of effectiveHeaders(c)) lines.push(`xhr.setRequestHeader(${jsStr(h.key)}, ${jsStr(h.value)})`)
  const bl = basicAuthValue(c)
  if (bl) lines.push(`xhr.setRequestHeader("Authorization", ${bl})`)
  if (c.timeoutMs !== 30000) lines.push(`xhr.timeout = ${c.timeoutMs}`)
  lines.push('xhr.onload = function () {')
  lines.push('  console.log(xhr.status, xhr.responseText)')
  lines.push('}')

  if (c.bodyType === 'form-data') {
    lines.push('const fd = new FormData()')
    let fi = 0
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') {
        lines.push(`// 文件字段：请替换为 File/Blob 对象`)
        lines.push(`fd.append(${jsStr(f.key)}, ${fileVar(fi++)})`)
      } else lines.push(`fd.append(${jsStr(f.key)}, ${jsStr(f.value)})`)
    }
    lines.push('xhr.send(fd)')
  } else if (c.bodyType === 'binary') {
    lines.push('// 请替换为 File/Blob 对象')
    lines.push('xhr.send(file)')
  } else if (c.bodyType === 'raw') lines.push(`xhr.send(${jsStr(c.raw)})`)
  else if (c.bodyType === 'urlencoded') lines.push(`xhr.send(${jsStr(urlencodedString(c.urlEncoded))})`)
  else if (c.bodyType === 'graphql' && c.graphql) lines.push(`xhr.send(${jsStr(graphqlBodyText(c.graphql))})`)
  else lines.push('xhr.send()')
  return lines.join('\n')
}

/** jQuery.ajax */
function jqueryGen(c: CodegenCtx): string {
  const lines: string[] = []
  let dataExpr: string | null = null
  let fdLines: string[] = []
  const extra: string[] = []

  if (c.bodyType === 'raw') dataExpr = jsStr(c.raw)
  else if (c.bodyType === 'urlencoded') dataExpr = jsStr(urlencodedString(c.urlEncoded))
  else if (c.bodyType === 'graphql' && c.graphql) dataExpr = jsStr(graphqlBodyText(c.graphql))
  else if (c.bodyType === 'form-data') {
    fdLines.push('const fd = new FormData()')
    let fi = 0
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') {
        lines.push('// 文件字段：请替换为 File/Blob 对象')
        fdLines.push(`fd.append(${jsStr(f.key)}, ${fileVar(fi++)})`)
      } else fdLines.push(`fd.append(${jsStr(f.key)}, ${jsStr(f.value)})`)
    }
    dataExpr = 'fd'
    extra.push('contentType: false,')
    extra.push('processData: false,')
  } else if (c.bodyType === 'binary') {
    lines.push('// 请替换为 File/Blob 对象')
    dataExpr = 'file'
    extra.push('contentType: false,')
    extra.push('processData: false,')
  }
  if (fdLines.length) lines.push(...fdLines, '')

  const optLines: string[] = []
  optLines.push(`  url: ${jsStr(c.fullUrl)},`)
  if (c.method !== 'GET') optLines.push(`  method: ${jsStr(c.method)},`)
  const hdr = [...effectiveHeaders(c)]
  const bl = basicHeaderLine(c)
  if (hdr.length || bl) {
    optLines.push('  headers: {')
    for (const h of hdr) optLines.push(`    ${jsStr(h.key)}: ${jsStr(h.value)},`)
    if (bl) optLines.push(bl)
    optLines.push('  },')
  }
  if (dataExpr) optLines.push(`  data: ${dataExpr},`)
  optLines.push(...extra)
  optLines.push('  success: function (data) {')
  optLines.push('    console.log(data)')
  optLines.push('  },')

  lines.push(`$.ajax({\n${optLines.join('\n')}\n})`)
  return lines.join('\n')
}

export const javascriptGens = { fetch: fetchGen, axios: axiosGen, xhr: xhrGen, jquery: jqueryGen }
