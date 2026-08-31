// PHP 系：ext-curl（P1 验收语言）/ Guzzle / HTTP_Request2
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { phpStr, urlencodedString, graphqlBodyText } from '../esc'

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

/** ext-curl（P1 验收语言） */
function phpCurl(c: CodegenCtx): string {
  const L = [`<?php`, `$curl = curl_init(${phpStr(c.fullUrl)})`, '', 'curl_setopt_array($curl, array(', '  CURLOPT_RETURNTRANSFER => true,']
  if (c.method !== 'GET') L.push(`  CURLOPT_CUSTOMREQUEST => ${phpStr(c.method)},`)
  if (c.auth.type === 'basic' && c.auth.basic) L.push(`  CURLOPT_USERPWD => ${phpStr(c.auth.basic.username + ':' + c.auth.basic.password)},`)
  if (c.headers.length) {
    L.push('  CURLOPT_HTTPHEADER => array(')
    for (const h of effectiveHeaders(c)) L.push(`    ${phpStr(h.key + ': ' + h.value)},`)
    L.push('  ),')
  }
  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    L.push(`  CURLOPT_POSTFIELDS => ${phpStr(text)},`)
  } else if (c.bodyType === 'urlencoded') L.push(`  CURLOPT_POSTFIELDS => ${phpStr(urlencodedString(c.urlEncoded))},`)
  else if (c.bodyType === 'form-data') {
    L.push('  CURLOPT_POSTFIELDS => array(')
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') L.push(`    ${phpStr(f.key)} => curl_file_create(${phpStr(f.filePath || '')}),`)
      else L.push(`    ${phpStr(f.key)} => ${phpStr(f.value)},`)
    }
    L.push('  ),')
  } else if (c.bodyType === 'binary') L.push(`  CURLOPT_POSTFIELDS => file_get_contents(${phpStr(c.binaryPath)}),`)
  if (c.insecure) L.push('  CURLOPT_SSL_VERIFYPEER => false,')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) L.push(`  CURLOPT_TIMEOUT => ${seconds(c.timeoutMs)},`)
  L.push('))')
  L.push('')
  L.push('$response = curl_exec($curl);')
  L.push('$err = curl_error($curl);')
  L.push('')
  L.push('curl_close($curl);')
  L.push('')
  L.push('if ($err) {')
  L.push('  echo "cURL Error #:" . $err;')
  L.push('} else {')
  L.push('  echo $response;')
  L.push('}')
  return L.join('\n')
}

/** Guzzle */
function guzzle(c: CodegenCtx): string {
  const L = ['<?php', '$client = new \\GuzzleHttp\\Client();', '', '']
  const opts: string[] = []
  if (c.headers.length) {
    opts.push("  'headers' => [")
    for (const h of effectiveHeaders(c)) opts.push(`    ${phpStr(h.key)} => ${phpStr(h.value)},`)
    opts.push('  ],')
  }
  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    opts.push(`  'body' => ${phpStr(text)},`)
  } else if (c.bodyType === 'urlencoded') {
    opts.push("  'form_params' => [")
    for (const p of c.urlEncoded) opts.push(`    ${phpStr(p.key)} => ${phpStr(p.value)},`)
    opts.push('  ],')
  } else if (c.bodyType === 'form-data') {
    opts.push("  'multipart' => [")
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') opts.push(`    ['name' => ${phpStr(f.key)}, 'contents' => fopen(${phpStr(f.filePath || '')}, 'r')],`)
      else opts.push(`    ['name' => ${phpStr(f.key)}, 'contents' => ${phpStr(f.value)}],`)
    }
    opts.push('  ],')
  } else if (c.bodyType === 'binary') opts.push(`  'body' => file_get_contents(${phpStr(c.binaryPath)}),`)
  if (c.auth.type === 'basic' && c.auth.basic) opts.push(`  'auth' => [${phpStr(c.auth.basic.username)}, ${phpStr(c.auth.basic.password)}],`)
  if (c.insecure) opts.push("  'verify' => false,")
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) opts.push(`  'timeout' => ${seconds(c.timeoutMs)},`)

  L.push(`$response = $client->request(${phpStr(c.method)}, ${phpStr(c.fullUrl)}${opts.length ? ', [\n' + opts.join('\n') + '\n  ]' : ''});`)
  L.push('')
  L.push('echo (string) $response->getBody();')
  return L.join('\n')
}

/** HTTP_Request2（PECL） */
function httpReq2(c: CodegenCtx): string {
  const L = ['<?php', "require_once 'HTTP/Request2.php';", '']
  L.push(`$request = new HTTP_Request2(${phpStr(c.fullUrl)}, array('method' => HTTP_Request2::METHOD_${c.method}));`)
  for (const h of effectiveHeaders(c)) L.push(`$request->setHeader(${phpStr(h.key)}, ${phpStr(h.value)});`)
  if (c.auth.type === 'basic' && c.auth.basic) L.push(`$request->setAuthorization(HTTP_Request2::AUTH_BASIC, ${phpStr(c.auth.basic.username)}, ${phpStr(c.auth.basic.password)});`)
  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    L.push(`$request->setBody(${phpStr(text)});`)
  } else if (c.bodyType === 'urlencoded') L.push(`$request->setBody(${phpStr(urlencodedString(c.urlEncoded))});`)
  else if (c.bodyType === 'form-data') {
    L.push('$request->setBody(array(')
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') L.push(`    ${phpStr(f.key)} => new HTTP_Request2_Filestream(${phpStr(f.filePath || '')}),`)
      else L.push(`    ${phpStr(f.key)} => ${phpStr(f.value)},`)
    }
    L.push('));')
  } else if (c.bodyType === 'binary') L.push(`$request->setBody(file_get_contents(${phpStr(c.binaryPath)}));`)
  if (c.insecure) L.push("$request->setConfig('verify_peer', false);")
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) L.push(`$request->setConfig('timeout', ${seconds(c.timeoutMs)});`)
  L.push('$response = $request->send();')
  L.push('echo $response->getBody();')
  return L.join('\n')
}

export const phpGens = { curl: phpCurl, guzzle, 'http-request2': httpReq2 }
