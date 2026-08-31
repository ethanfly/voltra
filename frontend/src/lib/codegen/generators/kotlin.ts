// Kotlin：OkHttp
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { jsStr, graphqlBodyText, b64Unicode, hasVars } from '../esc'

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

/** OkHttp */
function kotlinOkHttp(c: CodegenCtx): string {
  const L: string[] = [
    'import okhttp3.MediaType.Companion.toMediaType',
    'import okhttp3.OkHttpClient',
    'import okhttp3.Request',
    'import okhttp3.RequestBody',
    'import okhttp3.RequestBody.Companion.toRequestBody',
    '',
    'fun main() {',
  ]
  const clientLines: string[] = ['OkHttpClient.Builder()']
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) {
    clientLines.push(`                .callTimeout(${seconds(c.timeoutMs)}, java.util.concurrent.TimeUnit.SECONDS)`)
  }
  clientLines.push('                .build()')
  L.push(`    val client = ${clientLines.join('\n')}`)
  if (c.insecure) L.push('        // 忽略 TLS 证书需自定义 sslSocketFactory/TrustManager')

  let bodyDecl: string | null = null
  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    const ct = c.headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? 'text/plain'
    bodyDecl = `    val body = ${jsStr(text)}.toRequestBody(${jsStr(ct)}.toMediaType())`
  } else if (c.bodyType === 'urlencoded') {
    L.push('    val body = okhttp3.FormBody.Builder()')
    for (const p of c.urlEncoded) L.push(`        .add(${jsStr(p.key)}, ${jsStr(p.value)})`)
    L.push('        .build()')
  } else if (c.bodyType === 'form-data') {
    L.push('    val body = okhttp3.MultipartBody.Builder()')
    L.push('        .setType(okhttp3.MultipartBody.FORM)')
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') {
        const name = (f.filePath || f.key).split('/').pop() || f.key
        L.push(
          `        .addFormDataPart(${jsStr(f.key)}, ${jsStr(name)}, java.io.File(${jsStr(f.filePath || '')}).readBytes().toRequestBody("application/octet-stream".toMediaType()))`,
        )
      } else L.push(`        .addFormDataPart(${jsStr(f.key)}, ${jsStr(f.value)})`)
    }
    L.push('        .build()')
  } else if (c.bodyType === 'binary') {
    bodyDecl = `    val body = java.io.File(${jsStr(c.binaryPath)}).readBytes().toRequestBody("application/octet-stream".toMediaType())`
  }
  if (bodyDecl) L.push(bodyDecl)

  L.push('    val request = Request.Builder()')
  L.push(`        .url(${jsStr(c.fullUrl)})`)
  if (c.bodyType !== 'none') L.push(`        .method(${jsStr(c.method)}, body)`)
  else if (c.method === 'GET') L.push('        .get()')
  else L.push(`        .method(${jsStr(c.method)}, null)`)
  for (const h of effectiveHeaders(c)) L.push(`        .addHeader(${jsStr(h.key)}, ${jsStr(h.value)})`)
  if (c.auth.type === 'basic' && c.auth.basic && !c.headers.some((h) => h.key.toLowerCase() === 'authorization')) {
    const raw = c.auth.basic.username + ':' + c.auth.basic.password
    if (hasVars(raw)) L.push(`        .addHeader("Authorization", "Basic " + okhttp3.Credentials.basic(${jsStr(c.auth.basic.username)}, ${jsStr(c.auth.basic.password)}))`)
    else L.push(`        .addHeader("Authorization", ${jsStr('Basic ' + b64Unicode(raw))})`)
  }
  L.push('        .build()')
  L.push('    val response = client.newCall(request).execute()')
  L.push('    println(response.body?.string())')
  L.push('    response.close()')
  L.push('}')
  return L.join('\n')
}

export const kotlinGens = { okhttp: kotlinOkHttp }
