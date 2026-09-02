// 代码生成：7 个 P1 验收语言逐字符 golden（变量原样/环境替换双模式）+ 行为断言 + 全语言 smoke
import { describe, it, expect, beforeEach } from 'vitest'
import { workspace } from '../src/stores/workspace'
import { env } from '../src/stores/env'
import { newProject, newCollection, newRequest } from '../src/types/models'
import type { Request } from '../src/types/models'
import { LANGS, generate } from '../src/lib/codegen'
import { buildCodegenCtx, type CodegenCtx } from '../src/lib/codegen/context'

const GOLDEN_KEYS = [
  'shell:curl',
  'python:requests',
  'js:fetch',
  'node:native',
  'java:okhttp',
  'php:curl',
  'golang:net/http',
] as const

function gen(key: string, ctx: CodegenCtx): string {
  const i = key.indexOf(':')
  return generate(key.slice(0, i), key.slice(i + 1), ctx)
}

function setup(): Request {
  const p = newProject({ name: 'p' })
  const c = newCollection({ name: 'c' })
  const r = newRequest({ name: 'Get User', protocol: 'http' })
  r.method = 'POST'
  r.url = '{{baseUrl}}/users/1'
  r.params = [
    { key: 'flag', value: 'true', enabled: true },
    { key: 'off', value: 'x', enabled: false },
  ]
  r.headers = [{ key: 'X-Api', value: 'abc 123', enabled: true }]
  r.body = { type: 'raw', rawLang: 'json', raw: '{"name":"voltra","n":1}' }
  c.items.push(r)
  p.collections = [c]
  p.variables = [{ key: 'baseUrl', initialValue: '', currentValue: 'https://api.example.com', enabled: true }]
  workspace.projects = [p]
  workspace.currentProjectId = p.id
  return r
}

beforeEach(() => {
  workspace.projects = []
  workspace.currentProjectId = null
  env.globalVars = []
  env.currentEnvId = null
})

// ---------- golden（变量原样） ----------
const RAW = {
  'shell:curl': String.raw`curl '{{baseUrl}}/users/1?flag=true' \
  -X POST \
  -H 'X-Api: abc 123' \
  -H 'Content-Type: application/json' \
  --data-raw '{"name":"voltra","n":1}'`,
  'python:requests': String.raw`import requests

headers = {
    "X-Api": "abc 123",
    "Content-Type": "application/json",
}

response = requests.request(
    "POST",
    "{{baseUrl}}/users/1?flag=true",
    headers=headers,
    data="{\"name\":\"voltra\",\"n\":1}",
)

print(response.text)`,
  'js:fetch': String.raw`const response = await fetch("{{baseUrl}}/users/1?flag=true", {
  method: "POST",
  headers: {
    "X-Api": "abc 123",
    "Content-Type": "application/json",
  },
  body: "{\"name\":\"voltra\",\"n\":1}",
  })
const data = await response.text()
console.log(data)`,
  'node:native': String.raw`const https = require("https")

const options = {
  method: "POST",
  hostname: "{{baseUrl}}",
  path: "/users/1?flag=true",
  headers: {
    "X-Api": "abc 123",
    "Content-Type": "application/json",
  },
}

const req = https.request(options, (res) => {
  let data = ""
  res.on("data", (chunk) => (data += chunk))
  res.on("end", () => console.log(res.statusCode, data))
})

req.on("error", (err) => console.error(err))
req.write("{\"name\":\"voltra\",\"n\":1}")
req.end()`,
  'java:okhttp': String.raw`import okhttp3.*
import java.io.IOException

public class Main {
    public static void main(String[] args) throws IOException {
        OkHttpClient client = new OkHttpClient().newBuilder()
                .build()
        RequestBody body = RequestBody.create(MediaType.parse("application/json"), "{\"name\":\"voltra\",\"n\":1}")
        Request request = new Request.Builder()
                .url("{{baseUrl}}/users/1?flag=true")
                .method("POST", body)
                .addHeader("X-Api", "abc 123")
                .addHeader("Content-Type", "application/json")
                .build()

        try (Response response = client.newCall(request).execute()) {
            System.out.println(response.body().string())
        }
    }
}`,
  'php:curl': String.raw`<?php
$curl = curl_init('{{baseUrl}}/users/1?flag=true')

curl_setopt_array($curl, array(
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_HTTPHEADER => array(
    'X-Api: abc 123',
    'Content-Type: application/json',
  ),
  CURLOPT_POSTFIELDS => '{"name":"voltra","n":1}',
))

$response = curl_exec($curl);
$err = curl_error($curl);

curl_close($curl);

if ($err) {
  echo "cURL Error #:" . $err;
} else {
  echo $response;
}`,
  'golang:net/http': String.raw`package main

import (
	fmt
	io
	net/http
	strings
)

func main() {
	method := "POST"
	url := "{{baseUrl}}/users/1?flag=true"

	payload := strings.NewReader("{\"name\":\"voltra\",\"n\":1}")
	req, _ := http.NewRequest(method, url, payload)
	req.Header.Add("X-Api", "abc 123")
	req.Header.Add("Content-Type", "application/json")

	client := http.DefaultClient
	res, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	fmt.Println(res.Status, string(body))
}`,
}

describe('golden（P1 验收语言，变量原样）', () => {
  for (const key of GOLDEN_KEYS) {
    it(key, () => {
      const r = setup()
      expect(gen(key, buildCodegenCtx(r, false))).toBe(RAW[key])
    })
  }
})

// ---------- golden（环境替换：{{baseUrl}} → https://api.example.com） ----------
describe('golden（当前环境真实值替换）', () => {
  for (const key of GOLDEN_KEYS) {
    it(key, () => {
      const r = setup()
      // node:native 拆 host/port/path，替换体现在 hostname 上
      const expected =
        key === 'node:native'
          ? RAW[key].replaceAll('hostname: "{{baseUrl}}"', 'hostname: "api.example.com"')
          : RAW[key].replaceAll('{{baseUrl}}', 'https://api.example.com')
      expect(gen(key, buildCodegenCtx(r, true))).toBe(expected)
    })
  }
})

// ---------- 行为断言 ----------
describe('行为', () => {
  it('basic auth：原样模式 curl 用 -u；替换模式注入 Authorization 头', () => {
    const r = setup()
    r.auth = { type: 'basic', basic: { username: 'u-{{e}}', password: 'p' } }
    const rawOut = gen('shell:curl', buildCodegenCtx(r, false))
    expect(rawOut).toContain(`-u 'u-{{e}}:p'`)
    expect(rawOut).not.toContain('Authorization')
    env.globalVars = [{ key: 'e', initialValue: '', currentValue: 'dev', enabled: true }]
    // 替换模式管线已算好 base64 注入 Authorization，生成器直接用该头
    expect(gen('shell:curl', buildCodegenCtx(r, true))).toContain(`-H 'Authorization: Basic dS1kZXY6cA=='`)
  })

  it('insecure + 自定义超时：curl --insecure/--max-time，Go 自定义 client', () => {
    const r = setup()
    r.settings = { ...r.settings, insecureSkipTlsVerify: true, timeoutMs: 5000 }
    const curl = gen('shell:curl', buildCodegenCtx(r, false))
    expect(curl).toContain('--insecure')
    expect(curl).toContain('--max-time 5')
    const go = gen('golang:net/http', buildCodegenCtx(r, false))
    expect(go).toContain('InsecureSkipVerify: true')
    expect(go).toContain('Timeout: 5 * time.Second')
  })

  it('form-data：curl -F（file 行带 @ 路径与 ;type=）', () => {
    const r = setup()
    r.body = {
      type: 'form-data',
      formData: [
        { key: 'note', value: 'hi', enabled: true, type: 'text' },
        { key: 'f', value: '', enabled: true, type: 'file', filePath: '/tmp/a.png', description: 'image/png' },
      ],
    }
    const out = gen('shell:curl', buildCodegenCtx(r, false))
    expect(out).toContain(`-F 'note=hi'`)
    expect(out).toContain(`-F 'f=@/tmp/a.png;type=image/png'`)
    expect(out).not.toContain('Content-Type: application/json')
  })

  it('urlencoded：空格编码为 +（与 Go 侧一致）', () => {
    const r = setup()
    r.body = { type: 'urlencoded', urlencoded: [{ key: 'a b', value: 'x y', enabled: true }] }
    const out = gen('shell:curl', buildCodegenCtx(r, false))
    expect(out).toContain(`--data 'a+b=x+y'`)
    expect(out).toContain(`-H 'Content-Type: application/x-www-form-urlencoded'`)
  })

  it('graphql：拼成 {"query","variables"} JSON body', () => {
    const r = setup()
    r.body = { type: 'graphql', graphql: { query: 'query { user }', variables: '{"id": 1}' } }
    const out = gen('shell:curl', buildCodegenCtx(r, false))
    expect(out).toContain(`--data-raw '{"query":"query { user }","variables":{"id":1}}'`)
  })

  it('继承 header 参与生成（集合级 X-From-Coll）', () => {
    const r = setup()
    const c = workspace.projects[0].collections[0]
    c.headers = [{ key: 'X-From-Coll', value: '1', enabled: true }]
    const out = gen('shell:curl', buildCodegenCtx(r, false))
    expect(out).toContain(`-H 'X-From-Coll: 1'`)
  })

  it('未定义变量：替换模式下原样保留', () => {
    const r = setup()
    r.url = '{{nope}}/x'
    const ctx = buildCodegenCtx(r, true)
    expect(ctx.fullUrl).toBe('{{nope}}/x?flag=true')
    expect(gen('shell:curl', ctx)).toContain("curl '{{nope}}/x?flag=true'")
  })
})

// ---------- 全语言 smoke ----------
describe('全语言 smoke', () => {
  it('每个 语言:客户端 都能生成非空代码且未走 fallback', () => {
    const r = setup()
    const ctx = buildCodegenCtx(r, false)
    for (const lang of LANGS) {
      for (const client of lang.clients) {
        const out = generate(lang.id, client.id, ctx)
        expect(out.length, `${lang.id}:${client.id} 为空`).toBeGreaterThan(50)
        expect(out).not.toContain('未实现的生成器')
        expect(out, `${lang.id}:${client.id} 缺 URL`).toContain('/users/1?flag=true')
      }
    }
  })

  it('form-data + binary + 各 body 类型不抛异常（所有生成器）', () => {
    const bodies: Request['body'][] = [
      { type: 'none' },
      { type: 'raw', rawLang: 'xml', raw: '<a/>' },
      { type: 'urlencoded', urlencoded: [{ key: 'k', value: 'v', enabled: true }] },
      {
        type: 'form-data',
        formData: [
          { key: 't', value: 'v', enabled: true, type: 'text' },
          { key: 'f', value: '', enabled: true, type: 'file', filePath: '/tmp/f.bin' },
        ],
      },
      { type: 'binary', binaryPath: '/tmp/f.bin' },
      { type: 'graphql', graphql: { query: 'q', variables: '{}' } },
    ]
    for (const body of bodies) {
      const r = setup()
      r.body = body
      const ctx = buildCodegenCtx(r, false)
      for (const lang of LANGS) {
        for (const client of lang.clients) {
          expect(() => generate(lang.id, client.id, ctx)).not.toThrow()
        }
      }
    }
  })
})

// ---------- 阶段17：签名型 auth NOTE + jwt 双模式 ----------
describe('签名型 auth（digest/oauth1/awsv4）：首行 NOTE 注释', () => {
  function withAuth(type: 'digest' | 'oauth1' | 'awsv4'): Request {
    const r = setup()
    if (type === 'digest') r.auth = { type: 'digest', digest: { username: 'u', password: 'p' } }
    else if (type === 'oauth1')
      r.auth = {
        type: 'oauth1',
        oauth1: { consumerKey: 'ck', consumerSecret: 'cs', token: 'tk', tokenSecret: 'ts', signatureMethod: 'HMAC-SHA1' },
      }
    else r.auth = { type: 'awsv4', awsv4: { accessKeyId: 'AK', secretAccessKey: 'SK', region: 'us-east-1', service: 's3' } }
    return r
  }

  for (const type of ['digest', 'oauth1', 'awsv4'] as const) {
    it(`${type}：shell/ruby 用 # 注释，其余用 //；正文不出现 Authorization`, () => {
      const r = withAuth(type)
      const ctx = buildCodegenCtx(r, false)
      expect(ctx.authNote).toBeTruthy()

      const shell = gen('shell:curl', ctx)
      expect(shell.startsWith('# NOTE: ')).toBe(true)
      expect(shell.split('\n')[0]).toContain('NOTE')
      const ruby = gen('ruby:net/http', ctx)
      expect(ruby.startsWith('# NOTE: ')).toBe(true)
      const go = gen('golang:net/http', ctx)
      expect(go.startsWith('// NOTE: ')).toBe(true)
      const py = gen('python:requests', ctx)
      expect(py.startsWith('// NOTE: ')).toBe(true)

      for (const key of GOLDEN_KEYS) {
        expect(gen(key, ctx)).not.toContain('Authorization')
      }
    })
  }

  it('bearer/jwt 等前端注入型无 NOTE（golden 逐字符不变已由上方 golden 套件覆盖）', () => {
    const r = setup()
    r.auth = { type: 'jwt', jwt: { token: 'abc' } }
    const ctx = buildCodegenCtx(r, false)
    expect(ctx.authNote).toBeNull()
    expect(gen('shell:curl', ctx)).not.toContain('NOTE')
  })
})

describe('jwt：raw / 环境替换双模式均注入 Bearer Authorization', () => {
  it('raw 模式保留 {{var}}；替换模式算出真实 token', () => {
    const r = setup()
    r.auth = { type: 'jwt', jwt: { token: 'eyJ.{{tok}}.sig' } }
    const rawOut = gen('shell:curl', buildCodegenCtx(r, false))
    expect(rawOut).toContain(`-H 'Authorization: Bearer eyJ.{{tok}}.sig'`)

    env.globalVars = [{ key: 'tok', initialValue: '', currentValue: 'real', enabled: true }]
    const resolvedOut = gen('shell:curl', buildCodegenCtx(r, true))
    expect(resolvedOut).toContain(`-H 'Authorization: Bearer eyJ.real.sig'`)
  })
})
