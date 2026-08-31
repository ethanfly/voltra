// Swift：URLSession（Foundation）
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { jsStr, urlencodedString, graphqlBodyText, b64Unicode, hasVars } from '../esc'

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

/** URLSession */
function urlSession(c: CodegenCtx): string {
  const L: string[] = ['import Foundation', '']
  L.push(`var request = URLRequest(url: URL(string: ${jsStr(c.fullUrl)})!)`)
  if (c.method !== 'GET') L.push(`request.httpMethod = ${jsStr(c.method)}`)
  for (const h of effectiveHeaders(c)) L.push(`request.setValue(${jsStr(h.value)}, forHTTPHeaderField: ${jsStr(h.key)})`)
  if (c.auth.type === 'basic' && c.auth.basic && !c.headers.some((h) => h.key.toLowerCase() === 'authorization')) {
    const raw = c.auth.basic.username + ':' + c.auth.basic.password
    if (hasVars(raw)) L.push(`request.setValue("Basic \\(Data(${jsStr(raw)}.utf8).base64EncodedString())", forHTTPHeaderField: "Authorization")`)
    else L.push(`request.setValue(${jsStr('Basic ' + b64Unicode(raw))}, forHTTPHeaderField: "Authorization")`)
  }

  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    L.push(`request.httpBody = ${jsStr(text)}.data(using: .utf8)`)
  } else if (c.bodyType === 'urlencoded') L.push(`request.httpBody = ${jsStr(urlencodedString(c.urlEncoded))}.data(using: .utf8)`)
  else if (c.bodyType === 'binary') L.push(`request.httpBody = try? Data(contentsOf: URL(fileURLWithPath: ${jsStr(c.binaryPath)}))`)
  else if (c.bodyType === 'form-data') L.push('// multipart/form-data 需手工构造 HTTPBodyStream（或改用 Alamofire）')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) L.push(`request.timeoutInterval = ${seconds(c.timeoutMs)}`)
  if (c.insecure) L.push('// 跳过 TLS 证书校验需自定义 URLSession 的 delegate（urlSession(_:didReceive:completionHandler:)）')

  L.push('')
  L.push('let task = URLSession.shared.dataTask(with: request) { data, response, error in')
  L.push('    guard let data = data else {')
  L.push('        print(String(describing: error))')
  L.push('        return')
  L.push('    }')
  L.push('    print(String(data: data, encoding: .utf8) ?? "")')
  L.push('}')
  L.push('task.resume()')
  return L.join('\n')
}

export const swiftGens = { urlsession: urlSession }
