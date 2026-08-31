// Java 系：OkHttp（P1 验收语言）/ java.net.http / HttpURLConnection
import type { CodegenCtx } from '../context'
import { effectiveHeaders, DEFAULT_TIMEOUT_MS } from '../context'
import { javaStr, urlencodedString, graphqlBodyText, b64Unicode, hasVars } from '../esc'

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

function contentTypeOf(c: CodegenCtx): string {
  const h = c.headers.find((h) => h.key.trim().toLowerCase() === 'content-type')
  if (h) return h.value
  if (c.bodyType === 'raw') {
    return c.rawLang === 'json' ? 'application/json' : c.rawLang === 'xml' ? 'application/xml' : c.rawLang === 'html' ? 'text/html' : 'text/plain'
  }
  if (c.bodyType === 'urlencoded' || c.bodyType === 'graphql') return 'application/json'
  return 'text/plain'
}

function basicHeaderValue(c: CodegenCtx): string | null {
  if (c.auth.type !== 'basic' || !c.auth.basic) return null
  if (c.headers.some((h) => h.key.toLowerCase() === 'authorization')) return null
  const raw = c.auth.basic.username + ':' + c.auth.basic.password
  if (hasVars(raw)) return null // 含变量时生成器改用语言惯用法
  return 'Basic ' + b64Unicode(raw)
}

/** OkHttp（P1 验收语言） */
function okhttp(c: CodegenCtx): string {
  const imports = ['import okhttp3.*', 'import java.io.IOException']
  const needsFile =
    (c.bodyType === 'form-data' && c.formData.some((f) => f.enabled && f.type === 'file')) || c.bodyType === 'binary'
  if (needsFile) imports.push('import java.io.File')
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) imports.push('import java.util.concurrent.TimeUnit')
  imports.push('')
  imports.push('public class Main {')
  imports.push('    public static void main(String[] args) throws IOException {')

  const L = imports
  const clientLines = ['        OkHttpClient client = new OkHttpClient().newBuilder()']
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) clientLines.push(`                .connectTimeout(${seconds(c.timeoutMs)}, TimeUnit.SECONDS)`)
  if (c.insecure) clientLines.push('                // 忽略 TLS 证书需自定义 sslSocketFactory/TrustManager')
  clientLines.push('                .build()')
  L.push(...clientLines)

  // body 构造
  let bodyExpr: string | null = null
  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    L.push(`        RequestBody body = RequestBody.create(MediaType.parse(${javaStr(contentTypeOf(c))}), ${javaStr(text)})`)
    bodyExpr = 'body'
  } else if (c.bodyType === 'urlencoded') {
    L.push('        RequestBody body = new FormBody.Builder()')
    for (const p of c.urlEncoded) L.push(`                .add(${javaStr(p.key)}, ${javaStr(p.value)})`)
    L.push('                .build()')
    bodyExpr = 'body'
  } else if (c.bodyType === 'form-data') {
    L.push('        MultipartBody.Builder multipart = new MultipartBody.Builder().setType(MultipartBody.FORM)')
    for (const f of c.formData) {
      if (!f.enabled) continue
      if (f.type === 'file') {
        const name = (f.filePath || f.key).split('/').pop() || f.key
        L.push(
          `                .addFormDataPart(${javaStr(f.key)}, ${javaStr(name)}, RequestBody.create(MediaType.parse("application/octet-stream"), new File(${javaStr(f.filePath || '')})))`,
        )
      } else {
        L.push(`                .addFormDataPart(${javaStr(f.key)}, ${javaStr(f.value)})`)
      }
    }
    L.push('                .build()')
    L.push('        RequestBody body = multipart.build()')
    bodyExpr = 'body'
  } else if (c.bodyType === 'binary') {
    L.push(
      `        RequestBody body = RequestBody.create(MediaType.parse("application/octet-stream"), new File(${javaStr(c.binaryPath)}))`,
    )
    bodyExpr = 'body'
  }

  // request 构造
  L.push('        Request request = new Request.Builder()')
  L.push(`                .url(${javaStr(c.fullUrl)})`)
  if (bodyExpr) L.push(`                .method(${javaStr(c.method)}, body)`)
  else if (c.method === 'GET') L.push('                .get()')
  else L.push(`                .method(${javaStr(c.method)}, null)`)
  const ba = basicHeaderValue(c)
  for (const h of effectiveHeaders(c)) L.push(`                .addHeader(${javaStr(h.key)}, ${javaStr(h.value)})`)
  if (ba) L.push(`                .addHeader("Authorization", ${javaStr(ba)})`)
  else if (c.auth.type === 'basic' && c.auth.basic) {
    L.push(`                .addHeader("Authorization", "Basic " + okhttp3.Credentials.basic(${javaStr(c.auth.basic.username)}, ${javaStr(c.auth.basic.password)}))`)
  }
  L.push('                .build()')
  L.push('')
  L.push('        try (Response response = client.newCall(request).execute()) {')
  L.push('            System.out.println(response.body().string())')
  L.push('        }')
  L.push('    }')
  L.push('}')
  return L.join('\n')
}

/** java.net.http（JDK 11+） */
function jdkHttp(c: CodegenCtx): string {
  const imports = ['import java.net.URI', 'import java.net.http.HttpClient', 'import java.net.http.HttpRequest', 'import java.net.http.HttpResponse']
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) imports.push('import java.time.Duration')
  if (c.bodyType === 'binary') imports.push('import java.nio.file.Files', 'import java.nio.file.Paths')
  imports.push('')
  const L = imports
  L.push('public class Main {')
  L.push('    public static void main(String[] args) throws Exception {')
  L.push('        HttpClient client = HttpClient.newBuilder()')
  if (c.insecure) L.push('                // 忽略 TLS 证书需自定义 sslContext')
  L.push('                .build()')
  L.push('        HttpRequest.Builder rb = HttpRequest.newBuilder()')
  L.push(`                .uri(URI.create(${javaStr(c.fullUrl)}))`)
  for (const h of effectiveHeaders(c)) L.push(`                .header(${javaStr(h.key)}, ${javaStr(h.value)})`)
  const ba = basicHeaderValue(c)
  if (ba) L.push(`                .header("Authorization", ${javaStr(ba)})`)
  if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
    const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
    L.push(`                .method(${javaStr(c.method)}, HttpRequest.BodyPublishers.ofString(${javaStr(text)}))`)
  } else if (c.bodyType === 'urlencoded') {
    L.push(`                .method(${javaStr(c.method)}, HttpRequest.BodyPublishers.ofString(${javaStr(urlencodedString(c.urlEncoded))}))`)
  } else if (c.bodyType === 'binary') {
    L.push(`                .method(${javaStr(c.method)}, HttpRequest.BodyPublishers.ofByteArray(Files.readAllBytes(Paths.get(${javaStr(c.binaryPath)}))))`)
  } else if (c.bodyType === 'form-data') {
    L.push('                // JDK HttpClient 无内置 multipart，请改用 OkHttp')
    if (c.method === 'GET' || c.method === 'DELETE') L.push(`                .${c.method}()`)
    else L.push(`                .method(${javaStr(c.method)}, HttpRequest.BodyPublishers.noBody())`)
  } else if (c.method === 'GET' || c.method === 'DELETE') L.push(`                .${c.method}()`)
  else L.push(`                .method(${javaStr(c.method)}, HttpRequest.BodyPublishers.noBody())`)
  if (c.timeoutMs !== DEFAULT_TIMEOUT_MS) L.push(`                .timeout(Duration.ofMillis(${c.timeoutMs}))`)
  L.push('                .build()')
  L.push('        HttpResponse<String> response = client.send(rb.build(), HttpResponse.BodyHandlers.ofString())')
  L.push('        System.out.println(response.body())')
  L.push('    }')
  L.push('}')
  return L.join('\n')
}

/** HttpURLConnection（标准库旧式） */
function urlConn(c: CodegenCtx): string {
  const L = [
    'import java.io.BufferedReader;',
    'import java.io.InputStreamReader;',
    'import java.io.OutputStream;',
    'import java.net.HttpURLConnection;',
    'import java.net.URL;',
    '',
    'public class Main {',
    '    public static void main(String[] args) throws Exception {',
    `        URL url = new URL(${javaStr(c.fullUrl)})`,
    '        HttpURLConnection con = (HttpURLConnection) url.openConnection()',
    `        con.setRequestMethod(${javaStr(c.method)})`,
  ]
  for (const h of effectiveHeaders(c)) L.push(`        con.setRequestProperty(${javaStr(h.key)}, ${javaStr(h.value)})`)
  const ba = basicHeaderValue(c)
  if (ba) L.push(`        con.setRequestProperty("Authorization", ${javaStr(ba)})`)
  else if (c.auth.type === 'basic' && c.auth.basic) {
    L.push(`        con.setRequestProperty("Authorization", "Basic " + java.util.Base64.getEncoder().encodeToString((${javaStr(c.auth.basic.username + ':' + c.auth.basic.password)}).getBytes("UTF-8")))`)
  }
  if (c.insecure) L.push('        // 忽略 TLS 证书需自定义 SSLSocketFactory/TrustManager')

  let hasBody = false
  if (c.bodyType === 'raw') hasBody = true
  else if (c.bodyType === 'urlencoded') hasBody = true
  else if (c.bodyType === 'graphql') hasBody = true
  else if (c.bodyType === 'binary') hasBody = true
  if (hasBody) {
    L.push('        con.setDoOutput(true)')
    L.push('        try (OutputStream os = con.getOutputStream()) {')
    if (c.bodyType === 'raw' || c.bodyType === 'graphql') {
      const text = c.bodyType === 'graphql' && c.graphql ? graphqlBodyText(c.graphql) : c.raw
      L.push(`            os.write(${javaStr(text)}.getBytes("UTF-8"))`)
    } else if (c.bodyType === 'urlencoded') L.push(`            os.write(${javaStr(urlencodedString(c.urlEncoded))}.getBytes("UTF-8"))`)
    else if (c.bodyType === 'binary') L.push(`            os.write(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(${javaStr(c.binaryPath)})))`)
    L.push('        }')
  }
  L.push('        StringBuilder sb = new StringBuilder()')
  L.push('        try (BufferedReader br = new BufferedReader(new InputStreamReader(con.getInputStream(), "UTF-8"))) {')
  L.push('            String line')
  L.push('            while ((line = br.readLine()) != null) sb.append(line).append("\\n")')
  L.push('        }')
  L.push('        System.out.println(sb.toString())')
  L.push('        con.disconnect()')
  L.push('    }')
  L.push('}')
  return L.join('\n')
}

export const javaGens = { okhttp, 'java.net.http': jdkHttp, 'url-connection': urlConn }
