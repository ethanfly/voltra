// voltra-cli：无界面发请求，复用 GUI 同一套 services.HTTPService（鉴权 / 超时 / 编码行为完全一致）。
// 面向脚本与 AI agent：输入是 flag 或 JSON，输出是单个 JSON 对象，退出码稳定。
//
// shortcut: send 的变量替换 / 集合继承 / Bearer 等注入在前端 TS 里，CLI 收到的是最终值；要跑已保存的集合请求需把 send.ts 的解析移到 Go 侧再做。
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"

	"github.com/ramboLiang/voltra/services"
)

const usage = `voltra-cli — Voltra 命令行（对 agent 友好：JSON 输出 + 稳定退出码）

用法:
  voltra-cli send [flags] <url>       用 flag 描述请求（flag 必须写在 url 前）
  voltra-cli send --json <file|->     用 HTTPRequest JSON 描述请求（- 表示 stdin），可用全部字段（digest/oauth1/awsV4/formData…）
  voltra-cli example                  打印一份 HTTPRequest JSON 样例
  voltra-cli project list|show|create|rename|delete   管理 GUI 同一份项目数据（projects.json）
  voltra-cli doc [-o file.md] <项目 id|名称>        生成项目 Markdown API 文档（无 -o 时输出到 stdout）

project 子命令（输出均为 JSON；flag 写在参数前）:
  project list                        [{id,name,collections,requests,updatedAt}]
  project show <id|名称>              项目完整 JSON
  project create <名称>               新建空项目
  project rename <id|名称> <新名称>
  project delete --yes <id|名称>      不可恢复，必须加 --yes
  通用 flag: --data-dir <dir>         指定数据目录（默认 GUI 的用户配置目录/voltra）
  注意: GUI 运行时会用内存数据覆盖 projects.json，写操作请在 GUI 关闭时执行

doc flags:
  -o <file>         写入文件，stdout 输出 {path,project,requests}
  --data-dir <dir>  同上
  文档中 {{变量}} 原样保留；secret 变量与写死的 Authorization/Cookie/X-Api-Key 值以 ****** 代替

send flags:
  -X <method>       请求方法，默认 GET（有 -d 时默认 POST）
  -H 'K: V'         请求头，可重复
  -d <body>         raw 请求体；@path 读文件，@- 读 stdin；是合法 JSON 时自动 Content-Type: application/json
  --timeout <ms>    超时毫秒，默认 30000
  --no-follow       不跟随重定向
  -k                跳过 TLS 证书校验
  --body            只把响应体原样写到 stdout（二进制已解码），不输出 JSON
  --json <file|->   见上

输出（默认）: stdout 一个 JSON 对象，字段同 GUI 的 HTTPResponse：
  statusCode, status, headers[{key,value}], body, bodyEncoding(utf8|base64), contentType,
  sizeBytes, durationMs, truncated, error, errorKind(bad_url|dns|timeout|tls|refused|canceled|other), timings

退出码:
  0  拿到 HTTP 响应（任何状态码，包括 4xx/5xx —— 请看 statusCode）
  1  请求失败（网络 / 超时 / URL 错误等），详见 JSON 的 error / errorKind
  2  用法错误
`

const example = `{
  "method": "POST",
  "url": "https://httpbin.org/post",
  "headers": [{"key": "Accept", "value": "application/json", "enabled": true}],
  "query": [{"key": "q", "value": "1", "enabled": true}],
  "bodyType": "raw",
  "rawLang": "json",
  "body": "{\"hello\":\"world\"}",
  "timeoutMs": 30000,
  "followRedirects": true,
  "sendCookies": true
}
`

type headerFlags []string

func (h *headerFlags) String() string     { return strings.Join(*h, ", ") }
func (h *headerFlags) Set(v string) error { *h = append(*h, v); return nil }

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] == "-h" || args[0] == "--help" || args[0] == "help" {
		fmt.Fprint(stdout, usage)
		return 0
	}
	switch args[0] {
	case "example":
		fmt.Fprint(stdout, example)
		return 0
	case "send":
		return send(args[1:], stdin, stdout, stderr)
	case "project":
		return projectCmd(args[1:], stdout, stderr)
	case "doc":
		return docCmd(args[1:], stdout, stderr)
	}
	fmt.Fprintf(stderr, "未知命令 %q，运行 voltra-cli --help 查看用法\n", args[0])
	return 2
}

func send(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("send", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() { fmt.Fprint(stderr, usage) }
	var headers headerFlags
	method := fs.String("X", "", "")
	data := fs.String("d", "", "")
	jsonIn := fs.String("json", "", "")
	timeout := fs.Int("timeout", 30000, "")
	noFollow := fs.Bool("no-follow", false, "")
	insecure := fs.Bool("k", false, "")
	bodyOnly := fs.Bool("body", false, "")
	fs.Var(&headers, "H", "")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	req, err := buildRequest(fs, stdin, *jsonIn, *method, *data, headers, *timeout, *noFollow, *insecure)
	if err != nil {
		fmt.Fprintln(stderr, "错误:", err)
		return 2
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	resp, _ := services.NewHTTPService().SendRequest(ctx, req) // SendRequest 把错误放进 resp.Error，不返回 error

	if *bodyOnly && resp.Error == "" {
		b := []byte(resp.Body)
		if resp.BodyEncoding == "base64" {
			b, _ = base64.StdEncoding.DecodeString(resp.Body)
		}
		stdout.Write(b)
		return 0
	}
	enc := json.NewEncoder(stdout)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(resp)
	if resp.Error != "" {
		return 1
	}
	return 0
}

func buildRequest(fs *flag.FlagSet, stdin io.Reader, jsonIn, method, data string, headers []string, timeout int, noFollow, insecure bool) (services.HTTPRequest, error) {
	if jsonIn != "" {
		raw, err := readSource(jsonIn, stdin)
		if err != nil {
			return services.HTTPRequest{}, err
		}
		// 先填默认值再反序列化：JSON 里没写的字段保持 GUI 的默认行为
		req := services.HTTPRequest{Method: "GET", FollowRedirects: true, SendCookies: true}
		if err := json.Unmarshal(raw, &req); err != nil {
			return req, fmt.Errorf("--json 不是合法的 HTTPRequest JSON: %v", err)
		}
		if fs.NArg() > 0 && req.URL == "" {
			req.URL = fs.Arg(0)
		}
		defaultEnabled(raw, "headers", req.Headers)
		defaultEnabled(raw, "query", req.Query)
		defaultEnabled(raw, "urlEncoded", req.UrlEncoded)
		return req, nil
	}

	if fs.NArg() != 1 {
		return services.HTTPRequest{}, errors.New("需要且只需要一个 url（flag 写在 url 前面）")
	}
	req := services.HTTPRequest{
		Method:                method,
		URL:                   fs.Arg(0),
		TimeoutMs:             timeout,
		FollowRedirects:       !noFollow,
		InsecureSkipTlsVerify: insecure,
		SendCookies:           true,
	}
	for _, h := range headers {
		k, v, ok := strings.Cut(h, ":")
		if !ok || strings.TrimSpace(k) == "" {
			return req, fmt.Errorf("-H 格式应为 'Key: Value'，收到 %q", h)
		}
		req.Headers = append(req.Headers, services.KVPair{Key: strings.TrimSpace(k), Value: strings.TrimSpace(v), Enabled: true})
	}
	if data != "" {
		body := data
		if strings.HasPrefix(data, "@") {
			b, err := readSource(data[1:], stdin)
			if err != nil {
				return req, err
			}
			body = string(b)
		}
		req.BodyType, req.Body, req.RawLang = "raw", body, "text"
		if json.Valid([]byte(body)) {
			req.RawLang = "json"
		}
		if req.Method == "" {
			req.Method = "POST"
		}
	}
	if req.Method == "" {
		req.Method = "GET"
	}
	return req, nil
}

// defaultEnabled 没写 enabled 的行视为启用（agent 常漏写；Go 零值会把它当禁用），显式 false 保留
func defaultEnabled(raw []byte, field string, rows []services.KVPair) {
	var top map[string]json.RawMessage
	var list []map[string]json.RawMessage
	if json.Unmarshal(raw, &top) != nil || json.Unmarshal(top[field], &list) != nil {
		return
	}
	for i, r := range list {
		if _, ok := r["enabled"]; !ok && i < len(rows) {
			rows[i].Enabled = true
		}
	}
}

func readSource(src string, stdin io.Reader) ([]byte, error) {
	if src == "-" {
		return io.ReadAll(stdin)
	}
	b, err := os.ReadFile(src)
	if err != nil {
		return nil, fmt.Errorf("读取 %s 失败: %v", src, err)
	}
	return b, nil
}
