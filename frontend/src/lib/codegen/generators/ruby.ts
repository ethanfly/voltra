// Ruby：net/http（标准库）
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { rubyStr, urlencodedString, graphqlBodyText } from '../esc'

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

const SIMPLE_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])

/** net/http */
function rubyNetHttp(c: CodegenCtx): string {
  const L: string[] = ["require 'net/http'", "require 'uri'"]
  if (c.insecure) L.push("require 'openssl'")
  L.push('')
  L.push(`uri = URI.parse(${rubyStr(c.fullUrl)})`)
  L.push('http = Net::HTTP.new(uri.host, uri.port)')
  L.push("http.use_ssl = uri.scheme == 'https'")
  if (c.insecure) L.push('http.verify_mode = OpenSSL::SSL::VERIFY_NONE')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) L.push(`http.read_timeout = ${seconds(c.timeoutMs)}`)

  const cls = SIMPLE_METHODS.has(c.method) ? c.method : null
  L.push(cls ? `request = Net::HTTP::${cls}.new(uri.request_uri)` : `request = Net::HTTP::GenericRequest.new(${rubyStr(c.method)}, ${rubyStr(c.method)} == 'GET' || ${rubyStr(c.method)} == 'HEAD', ${rubyStr(c.method)}, uri.request_uri)`)
  for (const h of effectiveHeaders(c)) L.push(`request[${rubyStr(h.key)}] = ${rubyStr(h.value)}`)
  if (c.auth.type === 'basic' && c.auth.basic) L.push(`request.basic_auth ${rubyStr(c.auth.basic.username)}, ${rubyStr(c.auth.basic.password)}`)

  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    L.push(`request.body = ${rubyStr(text)}`)
  } else if (c.bodyType === 'urlencoded') L.push(`request.body = ${rubyStr(urlencodedString(c.urlEncoded))}`)
  else if (c.bodyType === 'form-data') {
    const texts = c.formData.filter((f) => f.enabled && f.type !== 'file')
    const files = c.formData.filter((f) => f.enabled && f.type === 'file')
    if (texts.length) {
      L.push(`request.body = URI.encode_www_form(${texts.map((f) => `${rubyStr(f.key)}: ${rubyStr(f.value)}`).join(', ')})`)
    }
    if (files.length) L.push('# 文件上传请改用 multipart 库（如 post-multipart）')
  } else if (c.bodyType === 'binary') L.push(`request.body = File.read(${rubyStr(c.binaryPath)})`)

  L.push('response = http.request(request)')
  L.push('puts response.read_body')
  return L.join('\n')
}

export const rubyGens = { 'net/http': rubyNetHttp }
