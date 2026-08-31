// C# 系：HttpClient / RestSharp
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { csStr, urlencodedString, graphqlBodyText, b64Unicode, hasVars } from '../esc'
import { splitUrl } from '../esc'

/** basic auth 的 base64 值表达式（AuthenticationHeaderValue 的 scheme 参数已带 "Basic"，这里只有值） */
function basicHeaderValue(c: CodegenCtx): string | null {
  if (c.auth.type !== 'basic' || !c.auth.basic) return null
  if (c.headers.some((h) => h.key.toLowerCase() === 'authorization')) return null
  const raw = c.auth.basic.username + ':' + c.auth.basic.password
  if (hasVars(raw)) return `Convert.ToBase64String(Encoding.UTF8.GetBytes(${csStr(raw)}))`
  return csStr(b64Unicode(raw))
}

/** HttpClient（.NET） */
function httpClient(c: CodegenCtx): string {
  const usesFile = (c.bodyType === 'form-data' && c.formData.some((f) => f.enabled && f.type === 'file')) || c.bodyType === 'binary'
  const L: string[] = ['using System;', 'using System.Net.Http;', 'using System.Text;', 'using System.Threading.Tasks;']
  if (usesFile) L.push('using System.IO;')
  L.push('')
  L.push('class Program')
  L.push('{')
  L.push('    static async Task Main()')
  L.push('    {')
  if (c.insecure) {
    L.push('        var handler = new HttpClientHandler { ServerCertificateCustomValidationCallback = (m, cert, chain, err) => true };')
    L.push('        using var client = new HttpClient(handler);')
  } else {
    L.push('        using var client = new HttpClient();')
  }
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) L.push(`        client.Timeout = TimeSpan.FromMilliseconds(${c.timeoutMs});`)

  const ba = basicHeaderValue(c)
  if (ba) L.push(`        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", ${ba});`)

  const call: string[] = []
  const headers = effectiveHeaders(c)
  if (c.method === 'GET' && c.bodyType === 'none') {
    call.push(`        var response = await client.GetAsync(${csStr(c.fullUrl)});`)
  } else {
    let contentExpr: string
    if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
      const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
      const ct = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? 'text/plain'
      contentExpr = `new StringContent(${csStr(text)}, Encoding.UTF8, ${csStr(ct)})`
    } else if (c.bodyType === 'urlencoded') {
      contentExpr =
        `new FormUrlEncodedContent(new System.Collections.Generic.Dictionary<string, string> {` +
        c.urlEncoded.map((p) => ` { ${csStr(p.key)}, ${csStr(p.value)} }`).join(',') +
        ' })'
    } else if (c.bodyType === 'form-data') {
      contentExpr = 'content'
      L.push('        using var content = new MultipartFormDataContent();')
      for (const f of c.formData) {
        if (!f.enabled) continue
        if (f.type === 'file') {
          const name = (f.filePath || f.key).split('/').pop() || f.key
          L.push(`        content.Add(new StreamContent(File.OpenRead(${csStr(f.filePath || '')})), ${csStr(f.key)}, ${csStr(name)});`)
        } else {
          L.push(`        content.Add(new StringContent(${csStr(f.value)}), ${csStr(f.key)});`)
        }
      }
    } else if (c.bodyType === 'binary') {
      contentExpr = `new StreamContent(File.OpenRead(${csStr(c.binaryPath)}))`
    } else {
      contentExpr = 'null'
    }
    const verb = c.method.toLowerCase()
    if (contentExpr === 'null') call.push(`        var response = await client.${verb[0].toUpperCase() + verb.slice(1)}Async(${csStr(c.fullUrl)});`)
    else call.push(`        var response = await client.${verb[0].toUpperCase() + verb.slice(1)}Async(${csStr(c.fullUrl)}, ${contentExpr});`)
  }
  L.push(...call)
  L.push('        Console.WriteLine(await response.Content.ReadAsStringAsync());')
  L.push('    }')
  L.push('}')
  return L.join('\n')
}

/** RestSharp */
function restsharp(c: CodegenCtx): string {
  // 从 fullUrl 拆：RestRequest 的相对路径需含 query
  const u = splitUrl(c.fullUrl)
  const portDefault = u.scheme === 'http' ? '80' : '443'
  const base = u.host ? `${u.scheme}://${u.host}${u.port !== portDefault ? ':' + u.port : ''}` : c.fullUrl
  const L: string[] = ['using RestSharp;', 'using System.Threading.Tasks;', '', 'class Program', '{', '    static async Task Main()', '    {']
  L.push(`        var client = new RestClient(${csStr(base)})`)
  const hasFormFile = c.bodyType === 'form-data' && c.formData.some((f) => f.enabled && f.type === 'file')
  const dt = c.bodyType === 'form-data' && !hasFormFile ? ' Method.POST, DataType.UrlEncoded' : hasFormFile ? ' Method.POST, DataType.Multipart' : ''
  L.push(`        var request = new RestRequest(${csStr(u.path || '')}, Method.${c.method}${c.method === 'GET' ? '' : dt})`)
  for (const h of effectiveHeaders(c)) L.push(`        request.AddHeader(${csStr(h.key)}, ${csStr(h.value)})`)
  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    const ct = c.headers.find((h) => h.key.toLowerCase() === 'content-type')?.value ?? 'text/plain'
    L.push(`        request.AddParameter(${csStr(ct)}, ${csStr(text)}, ParameterType.RequestBody)`)
  } else if (c.bodyType === 'urlencoded') {
    for (const p of c.urlEncoded) L.push(`        request.AddParameter(${csStr(p.key)}, ${csStr(p.value)})`)
  } else if (c.bodyType === 'form-data') {
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') L.push(`        request.AddFile(${csStr(f.key)}, ${csStr(f.filePath || '')})`)
      else L.push(`        request.AddParameter(${csStr(f.key)}, ${csStr(f.value)})`)
    }
  } else if (c.bodyType === 'binary') {
    L.push(`        request.AddParameter("application/octet-stream", System.IO.File.OpenRead(${csStr(c.binaryPath)}), ParameterType.RequestBody)`)
  }
  if (c.auth.type === 'basic' && c.auth.basic) L.push(`        client.Authenticator = new HttpBasicAuthenticator(${csStr(c.auth.basic.username)}, ${csStr(c.auth.basic.password)})`)
  if (c.insecure) L.push('        // 忽略 TLS 证书：new RestClientOptions { VerifyCertificates = false }')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) L.push(`        client.Timeout = System.TimeSpan.FromMilliseconds(${c.timeoutMs})`)
  L.push('        var response = await client.ExecuteAsync(request)')
  L.push('        Console.WriteLine(response.Content)')
  L.push('    }')
  L.push('}')
  return L.join('\n')
}

export const csharpGens = { httpclient: httpClient, restsharp }
