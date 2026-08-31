// Shell 系：curl / httpie / wget
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { sh, urlencodedString, graphqlBodyText } from '../esc'
import type { FormField } from '../../../types/models'

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

function basicHeaderPresent(c: CodegenCtx): boolean {
  return c.headers.some((h) => h.key.trim().toLowerCase() === 'authorization')
}

function formFieldLine(f: FormField): string {
  if (f.type === 'file') {
    let line = `${f.key}=@${f.filePath || ''}`
    if (f.description) line += `;type=${f.description}`
    return line
  }
  return `${f.key}=${f.value}`
}

/** cURL（P1 验收语言） */
function curl(c: CodegenCtx): string {
  const flags: string[] = []
  if (c.method !== 'GET') flags.push(`-X ${c.method}`)
  if (c.auth.type === 'basic' && c.auth.basic && !basicHeaderPresent(c)) {
    flags.push(`-u ${sh(c.auth.basic.username + ':' + c.auth.basic.password)}`)
  }
  for (const h of effectiveHeaders(c)) flags.push(`-H ${sh(h.key + ': ' + h.value)}`)
  if (c.bodyType === 'raw') flags.push(`--data-raw ${sh(c.raw)}`)
  else if (c.bodyType === 'urlencoded') flags.push(`--data ${sh(urlencodedString(c.urlEncoded))}`)
  else if (c.bodyType === 'form-data') {
    for (const f of c.formData) if (f.enabled) flags.push(`-F ${sh(formFieldLine(f))}`)
  } else if (c.bodyType === 'binary') flags.push(`--data-binary @${c.binaryPath}`)
  else if (c.bodyType === 'graphql' && c.graphql) flags.push(`--data-raw ${sh(graphqlBodyText(c.graphql))}`)
  if (c.insecure) flags.push('--insecure')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) flags.push(`--max-time ${seconds(c.timeoutMs)}`)

  const lines = [`curl ${sh(c.fullUrl)}`, ...flags.map((f) => '  ' + f)]
  return lines.map((l, i) => (i < lines.length - 1 ? l + ' \\' : l)).join('\n')
}

/** HTTPie（P1，小模板） */
function httpie(c: CodegenCtx): string {
  const args: string[] = []
  for (const h of effectiveHeaders(c)) args.push(sh(`${h.key}: ${h.value}`))
  if (c.bodyType === 'urlencoded') {
    for (const p of c.urlEncoded) args.push(`${p.key}=${p.value}`)
  } else if (c.bodyType === 'form-data') {
    for (const f of c.formData) if (f.enabled) args.push(`-f ${sh(formFieldLine(f))}`)
  } else if (c.bodyType === 'raw') args.push(`--body=${sh(c.raw)}`)
  else if (c.bodyType === 'graphql' && c.graphql) args.push(`--body=${sh(graphqlBodyText(c.graphql))}`)
  else if (c.bodyType === 'binary') args.push(`# binary 上传请用 curl --data-binary @${c.binaryPath}`)
  if (c.insecure) args.push('--verify=no')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) args.push(`--timeout=${seconds(c.timeoutMs)}`)

  const lines = [`http ${c.method.toLowerCase()} ${sh(c.fullUrl)}`, ...args.map((a) => '  ' + a)]
  return lines.map((l, i) => (i < lines.length - 1 ? l + ' \\' : l)).join('\n')
}

/** wget（P1，小模板；multipart/binary 能力有限，超出部分注释说明） */
function wget(c: CodegenCtx): string {
  const flags: string[] = []
  if (c.method !== 'GET') flags.push(`--method=${c.method}`)
  if (c.auth.type === 'basic' && c.auth.basic && !basicHeaderPresent(c)) {
    flags.push(`--http-user=${sh(c.auth.basic.username)}`)
    flags.push(`--http-password=${sh(c.auth.basic.password)}`)
  }
  for (const h of effectiveHeaders(c)) flags.push(`--header=${sh(`${h.key}: ${h.value}`)}`)
  if (c.bodyType === 'raw') flags.push(`--body-data=${sh(c.raw)}`)
  else if (c.bodyType === 'urlencoded') flags.push(`--body-data=${sh(urlencodedString(c.urlEncoded))}`)
  else if (c.bodyType === 'graphql' && c.graphql) flags.push(`--body-data=${sh(graphqlBodyText(c.graphql))}`)
  else if (c.bodyType === 'form-data') flags.push('# wget 不支持 multipart/form-data，请用 curl -F')
  else if (c.bodyType === 'binary') flags.push(`# wget 不支持文件上传，请用 curl --data-binary @${c.binaryPath}`)
  if (c.insecure) flags.push('--no-check-certificate')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) flags.push(`--timeout=${seconds(c.timeoutMs)}`)

  const lines = ['wget', ...flags, sh(c.fullUrl)]
  return lines.map((l, i) => (i < lines.length - 1 ? l + ' \\' : l)).join('\n')
}

export const shellGens = { curl, httpie, wget }
