// 代码生成器注册表：语言分组 + 客户端库，generate(lang, client, ctx) → 代码文本
// P1 验收语言（golden 测试逐字符）：shell:curl / python:requests / js:fetch / node:native /
// java:okhttp / php:curl / golang:net/http
import type { CodegenCtx } from './context'
import { shellGens } from './generators/shell'
import { pythonGens } from './generators/python'
import { javascriptGens } from './generators/javascript'
import { nodeGens } from './generators/node'
import { javaGens } from './generators/java'
import { phpGens } from './generators/php'
import { golangGens } from './generators/golang'
import { csharpGens } from './generators/csharp'
import { rubyGens } from './generators/ruby'
import { swiftGens } from './generators/swift'
import { kotlinGens } from './generators/kotlin'

export interface ClientDef {
  id: string
  label: string
}

export interface LangDef {
  id: string
  label: string
  clients: ClientDef[]
}

export const LANGS: LangDef[] = [
  { id: 'shell', label: 'Shell', clients: [{ id: 'curl', label: 'cURL' }, { id: 'httpie', label: 'HTTPie' }, { id: 'wget', label: 'wget' }] },
  { id: 'python', label: 'Python', clients: [{ id: 'requests', label: 'requests' }, { id: 'http.client', label: 'http.client（标准库）' }] },
  {
    id: 'js',
    label: 'JavaScript',
    clients: [
      { id: 'fetch', label: 'fetch' },
      { id: 'axios', label: 'Axios' },
      { id: 'xhr', label: 'XMLHttpRequest' },
      { id: 'jquery', label: 'jQuery.ajax' },
    ],
  },
  {
    id: 'node',
    label: 'Node.js',
    clients: [
      { id: 'native', label: '原生 http/https' },
      { id: 'node-fetch', label: 'node-fetch' },
      { id: 'axios', label: 'Axios' },
    ],
  },
  {
    id: 'java',
    label: 'Java',
    clients: [
      { id: 'okhttp', label: 'OkHttp' },
      { id: 'java.net.http', label: 'java.net.http（JDK 11+）' },
      { id: 'url-connection', label: 'HttpURLConnection' },
    ],
  },
  { id: 'php', label: 'PHP', clients: [{ id: 'curl', label: 'ext-curl' }, { id: 'guzzle', label: 'Guzzle' }, { id: 'http-request2', label: 'HTTP_Request2' }] },
  { id: 'golang', label: 'Go', clients: [{ id: 'net/http', label: 'net/http' }] },
  { id: 'csharp', label: 'C#', clients: [{ id: 'httpclient', label: 'HttpClient' }, { id: 'restsharp', label: 'RestSharp' }] },
  { id: 'ruby', label: 'Ruby', clients: [{ id: 'net/http', label: 'net/http（标准库）' }] },
  { id: 'swift', label: 'Swift', clients: [{ id: 'urlsession', label: 'URLSession' }] },
  { id: 'kotlin', label: 'Kotlin', clients: [{ id: 'okhttp', label: 'OkHttp' }] },
]

const registry: Record<string, (c: CodegenCtx) => string> = {}
const all: Record<string, Record<string, (c: CodegenCtx) => string>> = {
  shell: shellGens,
  python: pythonGens,
  js: javascriptGens,
  node: nodeGens,
  java: javaGens,
  php: phpGens,
  golang: golangGens,
  csharp: csharpGens,
  ruby: rubyGens,
  swift: swiftGens,
  kotlin: kotlinGens,
}
for (const [lang, gens] of Object.entries(all)) {
  for (const [client, fn] of Object.entries(gens)) registry[lang + ':' + client] = fn
}

export function generate(langId: string, clientId: string, ctx: CodegenCtx): string {
  const fn = registry[langId + ':' + clientId]
  const code = fn ? fn(ctx) : '// 未实现的生成器: ' + langId + '/' + clientId
  // Go 侧运行时签名型（digest/oauth1/awsv4）：首行加 NOTE 注释，说明生成代码无法复现签名
  if (ctx.authNote) {
    const prefix = langId === 'shell' || langId === 'ruby' ? '#' : '//'
    return prefix + ' NOTE: ' + ctx.authNote + '\n' + code
  }
  return code
}
