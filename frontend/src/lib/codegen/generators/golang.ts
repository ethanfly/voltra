// Go：net/http（P1 验收语言）
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { jsStr, urlencodedString, graphqlBodyText } from '../esc'

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

/** net/http */
function netHttp(c: CodegenCtx): string {
  const imports = ['fmt', 'io', 'net/http', 'strings']
  const hasFormFile = c.bodyType === 'form-data' && c.formData.some((f) => f.enabled && f.type === 'file')
  if (c.bodyType === 'form-data') imports.push('bytes', 'mime/multipart')
  if (hasFormFile) imports.push('os')
  if (c.bodyType === 'binary') imports.push('bytes', 'os')
  if (c.insecure) imports.push('crypto/tls')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) imports.push('time')

  const L: string[] = ['package main', '', 'import (']
  for (const i of imports) L.push('\t' + i)
  L.push(')', '')
  L.push('func main() {')
  L.push(`\tmethod := ${jsStr(c.method)}`)
  L.push(`\turl := ${jsStr(c.fullUrl)}`)
  L.push('')

  let payloadExpr: string | null = null
  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    L.push(`\tpayload := strings.NewReader(${jsStr(text)})`)
    payloadExpr = 'payload'
  } else if (c.bodyType === 'urlencoded') {
    L.push(`\tpayload := strings.NewReader(${jsStr(urlencodedString(c.urlEncoded))})`)
    payloadExpr = 'payload'
  } else if (c.bodyType === 'form-data') {
    L.push('\tvar b bytes.Buffer')
    L.push('\tw := multipart.NewWriter(&b)')
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') {
        const name = (f.filePath || f.key).split('/').pop() || f.key
        L.push(`\tfw, _ := w.CreateFormFile(${jsStr(f.key)}, ${jsStr(name)})`)
        L.push(`\tff, _ := os.Open(${jsStr(f.filePath || '')})`)
        L.push('\tio.Copy(fw, ff)')
      } else {
        L.push(`\tw.WriteField(${jsStr(f.key)}, ${jsStr(f.value)})`)
      }
    }
    L.push('\tw.Close()')
    L.push('')
    L.push(`\treq, _ := http.NewRequest(method, url, strings.NewReader(b.String()))`)
    L.push('\treq.Header.Set("Content-Type", w.FormDataContentType())')
    for (const h of effectiveHeaders(c)) {
      if (h.key.trim().toLowerCase() !== 'content-type') L.push(`\treq.Header.Add(${jsStr(h.key)}, ${jsStr(h.value)})`)
    }
    if (c.auth.type === 'basic' && c.auth.basic && !c.headers.some((h) => h.key.toLowerCase() === 'authorization')) {
      L.push(`\treq.SetBasicAuth(${jsStr(c.auth.basic.username)}, ${jsStr(c.auth.basic.password)})`)
    }
    L.push(clientTail(c, 'req'))
    return L.join('\n')
  } else if (c.bodyType === 'binary') {
    L.push(`\tdata, _ := os.ReadFile(${jsStr(c.binaryPath)})`)
    L.push('\tpayload := bytes.NewReader(data)')
    payloadExpr = 'payload'
  }

  if (payloadExpr === null) {
    L.push(`\treq, _ := http.NewRequest(method, url, nil)`)
  } else {
    L.push(`\treq, _ := http.NewRequest(method, url, ${payloadExpr})`)
  }
  for (const h of effectiveHeaders(c)) L.push(`\treq.Header.Add(${jsStr(h.key)}, ${jsStr(h.value)})`)
  if (c.auth.type === 'basic' && c.auth.basic && !c.headers.some((h) => h.key.toLowerCase() === 'authorization')) {
    L.push(`\treq.SetBasicAuth(${jsStr(c.auth.basic.username)}, ${jsStr(c.auth.basic.password)})`)
  }
  L.push(clientTail(c, 'req'))
  return L.join('\n')
}

/** client 定义（insecure/timeout 时自定义）+ 发送 + 输出 */
function clientTail(c: CodegenCtx, reqVar: string): string {
  const L: string[] = ['']
  if (c.insecure || c.timeoutMs !== DEFAULT_TIMEOUT_MS) {
    const tls = c.insecure ? '\t\t\tTLSClientConfig: &tls.Config{InsecureSkipVerify: true},' : ''
    L.push('\tclient := &http.Client{')
    L.push('\t\tTransport: &http.Transport{')
    if (tls) L.push(tls)
    L.push('\t\t},')
    if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) L.push(`\t\tTimeout: ${seconds(c.timeoutMs)} * time.Second,`)
    L.push('\t}')
  } else {
    L.push('\tclient := http.DefaultClient')
  }
  L.push(`\tres, err := client.Do(${reqVar})`)
  L.push('\tif err != nil {')
  L.push('\t\tfmt.Println(err)')
  L.push('\t\treturn')
  L.push('\t}')
  L.push('\tdefer res.Body.Close()')
  L.push('\tbody, _ := io.ReadAll(res.Body)')
  L.push('\tfmt.Println(res.Status, string(body))')
  L.push('}')
  return L.join('\n')
}

export const golangGens = { 'net/http': netHttp }
