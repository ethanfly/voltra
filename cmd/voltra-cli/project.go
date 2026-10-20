package main

// 项目管理 + API 文档生成：直接读写 GUI 同一份 projects.json（经 services.StorageService）。
// 写回时按原始 JSON 对象改字段，前端新增的字段不会丢。
//
// shortcut: GUI 运行中会以内存数据覆盖 projects.json，CLI 写操作请在 GUI 关闭时做；要并发安全需加文件锁或让 GUI 监听文件变化。

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/ramboLiang/voltra/services"
)

// ---------- 与 frontend/src/types/models.ts 对齐的只读子集（文档用） ----------

type project struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Collections []collection `json:"collections"`
	Variables   []variable   `json:"variables"`
	UpdatedAt   int64        `json:"updatedAt"`
}

type collection struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Auth        *authConfig       `json:"auth"`
	Headers     []services.KVPair `json:"headers"`
	Items       []node            `json:"items"`
}

// node 是 Folder | Request（按 kind 区分）
type node struct {
	Kind     string            `json:"kind"`
	Name     string            `json:"name"`
	Protocol string            `json:"protocol"`
	Method   string            `json:"method"`
	URL      string            `json:"url"`
	Params   []services.KVPair `json:"params"`
	Headers  []services.KVPair `json:"headers"`
	Body     requestBody       `json:"body"`
	Auth     *authConfig       `json:"auth"`
	Items    []node            `json:"items"`
	Examples []reqExample      `json:"examples"`
}

type requestBody struct {
	Type       string                `json:"type"`
	Raw        string                `json:"raw"`
	RawLang    string                `json:"rawLang"`
	FormData   []services.FormField  `json:"formData"`
	Urlencoded []services.KVPair     `json:"urlencoded"`
	BinaryPath string                `json:"binaryPath"`
	GraphQL    *services.GraphQLBody `json:"graphql"`
}

// authConfig 只取类型和 API Key 的键名/位置，密钥本身不进文档
type authConfig struct {
	Type   string `json:"type"`
	Apikey *struct {
		Key string `json:"key"`
		In  string `json:"in"`
	} `json:"apikey"`
}

type variable struct {
	Key          string `json:"key"`
	InitialValue string `json:"initialValue"`
	Enabled      bool   `json:"enabled"`
	Secret       bool   `json:"secret"`
}

type reqExample struct {
	Name     string `json:"name"`
	Response *struct {
		StatusCode int    `json:"statusCode"`
		Body       string `json:"body"`
	} `json:"response"`
}

type rawProject = map[string]json.RawMessage

// ---------- 存取 ----------

func openStore(dir string) (*services.StorageService, error) {
	if dir == "" {
		return services.NewStorageService()
	}
	return services.NewStorageServiceIn(dir)
}

func loadProjects(s *services.StorageService) ([]rawProject, error) {
	raw, err := s.LoadProjects()
	if err != nil {
		return nil, err
	}
	var ps []rawProject
	if err := json.Unmarshal([]byte(raw), &ps); err != nil {
		return nil, fmt.Errorf("projects.json 不是合法的项目数组: %v", err)
	}
	return ps, nil
}

func saveProjects(s *services.StorageService, ps []rawProject) error {
	if ps == nil {
		ps = []rawProject{}
	}
	b, err := json.Marshal(ps)
	if err != nil {
		return err
	}
	return s.SaveProjects(string(b))
}

func strField(p rawProject, k string) string {
	var s string
	_ = json.Unmarshal(p[k], &s)
	return s
}

func setField(p rawProject, k string, v any) {
	b, _ := json.Marshal(v)
	p[k] = b
}

func decodeProject(p rawProject) project {
	var out project
	b, _ := json.Marshal(p)
	_ = json.Unmarshal(b, &out) // 字段类型不符时按零值处理，文档尽量出
	return out
}

// findProject 先按 id 精确匹配，再按名称；重名时要求改用 id
func findProject(ps []rawProject, ref string) (int, error) {
	for i, p := range ps {
		if strField(p, "id") == ref {
			return i, nil
		}
	}
	var hits []int
	for i, p := range ps {
		if strField(p, "name") == ref {
			hits = append(hits, i)
		}
	}
	switch len(hits) {
	case 0:
		return -1, fmt.Errorf("找不到项目 %q（用 project list 查看 id / 名称）", ref)
	case 1:
		return hits[0], nil
	}
	ids := make([]string, len(hits))
	for j, i := range hits {
		ids[j] = strField(ps[i], "id")
	}
	return -1, fmt.Errorf("有 %d 个项目叫 %q，请改用 id: %s", len(hits), ref, strings.Join(ids, ", "))
}

func countRequests(items []node) int {
	n := 0
	for _, it := range items {
		if it.Kind == "folder" {
			n += countRequests(it.Items)
		} else {
			n++
		}
	}
	return n
}

func projectRequests(p project) int {
	n := 0
	for _, c := range p.Collections {
		n += countRequests(c.Items)
	}
	return n
}

func writeJSON(w io.Writer, v any) int {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
	return 0
}

// ---------- project 子命令 ----------

func projectCmd(args []string, stdout, stderr io.Writer) int {
	argc := map[string]int{"list": 0, "show": 1, "create": 1, "rename": 2, "delete": 1}
	if len(args) == 0 {
		fmt.Fprintln(stderr, "用法: voltra-cli project list|show|create|rename|delete …（--help 查看详情）")
		return 2
	}
	sub := args[0]
	want, ok := argc[sub]
	if !ok {
		fmt.Fprintf(stderr, "未知子命令 project %s\n", sub)
		return 2
	}
	fs := flag.NewFlagSet("project "+sub, flag.ContinueOnError)
	fs.SetOutput(stderr)
	dataDir := fs.String("data-dir", "", "")
	yes := fs.Bool("yes", false, "")
	if fs.Parse(args[1:]) != nil {
		return 2
	}
	if fs.NArg() != want {
		fmt.Fprintf(stderr, "project %s 需要 %d 个参数（flag 写在参数前），收到 %d 个\n", sub, want, fs.NArg())
		return 2
	}
	if (sub == "create" && strings.TrimSpace(fs.Arg(0)) == "") || (sub == "rename" && strings.TrimSpace(fs.Arg(1)) == "") {
		fmt.Fprintln(stderr, "项目名称不能为空")
		return 2
	}
	if sub == "delete" && !*yes {
		fmt.Fprintln(stderr, "删除项目不可恢复，确认请加 --yes")
		return 2
	}

	fail := func(err error) int {
		fmt.Fprintln(stderr, "错误:", err)
		return 1
	}
	s, err := openStore(*dataDir)
	if err != nil {
		return fail(err)
	}
	ps, err := loadProjects(s)
	if err != nil {
		return fail(err)
	}

	summary := func(p rawProject) map[string]any {
		pj := decodeProject(p)
		return map[string]any{"id": pj.ID, "name": pj.Name, "collections": len(pj.Collections), "requests": projectRequests(pj), "updatedAt": pj.UpdatedAt}
	}

	switch sub {
	case "list":
		out := make([]map[string]any, 0, len(ps))
		for _, p := range ps {
			out = append(out, summary(p))
		}
		return writeJSON(stdout, out)
	case "create":
		now := time.Now().UnixMilli()
		p := rawProject{}
		setField(p, "id", uuid.NewString())
		setField(p, "name", strings.TrimSpace(fs.Arg(0)))
		for _, k := range []string{"collections", "environments", "variables"} {
			setField(p, k, []any{})
		}
		setField(p, "createdAt", now)
		setField(p, "updatedAt", now)
		if err := saveProjects(s, append(ps, p)); err != nil {
			return fail(err)
		}
		return writeJSON(stdout, summary(p))
	}

	i, err := findProject(ps, fs.Arg(0))
	if err != nil {
		return fail(err)
	}
	switch sub {
	case "show":
		return writeJSON(stdout, ps[i])
	case "rename":
		setField(ps[i], "name", strings.TrimSpace(fs.Arg(1)))
		setField(ps[i], "updatedAt", time.Now().UnixMilli())
		if err := saveProjects(s, ps); err != nil {
			return fail(err)
		}
		return writeJSON(stdout, summary(ps[i]))
	default: // delete
		gone := summary(ps[i])
		if err := saveProjects(s, slices.Delete(ps, i, i+1)); err != nil {
			return fail(err)
		}
		return writeJSON(stdout, gone)
	}
}

// ---------- doc 子命令 ----------

func docCmd(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("doc", flag.ContinueOnError)
	fs.SetOutput(stderr)
	dataDir := fs.String("data-dir", "", "")
	outPath := fs.String("o", "", "")
	if fs.Parse(args) != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(stderr, "用法: voltra-cli doc [-o file.md] [--data-dir dir] <项目 id|名称>")
		return 2
	}
	fail := func(err error) int {
		fmt.Fprintln(stderr, "错误:", err)
		return 1
	}
	s, err := openStore(*dataDir)
	if err != nil {
		return fail(err)
	}
	ps, err := loadProjects(s)
	if err != nil {
		return fail(err)
	}
	i, err := findProject(ps, fs.Arg(0))
	if err != nil {
		return fail(err)
	}
	p := decodeProject(ps[i])
	md := renderDoc(p, time.Now())
	if *outPath == "" {
		io.WriteString(stdout, md)
		return 0
	}
	if err := os.WriteFile(*outPath, []byte(md), 0o644); err != nil {
		return fail(errors.New("写入文档失败: " + err.Error()))
	}
	return writeJSON(stdout, map[string]any{"path": *outPath, "project": p.Name, "requests": projectRequests(p)})
}

// ---------- Markdown 渲染 ----------

var cellEscaper = strings.NewReplacer("|", `\|`, "\r\n", "<br>", "\n", "<br>")

var sensitiveHeaders = []string{"authorization", "proxy-authorization", "cookie", "x-api-key"}

func renderDoc(p project, now time.Time) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s API 文档\n\n> 由 voltra-cli 生成于 %s，共 %d 个接口。`{{变量}}` 原样保留，取值见「变量」。\n\n",
		p.Name, now.Format("2006-01-02"), projectRequests(p))

	var vars []variable
	for _, v := range p.Variables {
		if v.Enabled && v.Key != "" {
			vars = append(vars, v)
		}
	}
	if len(vars) > 0 {
		b.WriteString("## 变量\n\n| 变量 | 初始值 |\n|---|---|\n")
		for _, v := range vars {
			val := v.InitialValue
			if v.Secret {
				val = "******"
			}
			fmt.Fprintf(&b, "| `%s` | %s |\n", cellEscaper.Replace(v.Key), cellEscaper.Replace(val))
		}
		b.WriteString("\n")
	}

	for _, c := range p.Collections {
		fmt.Fprintf(&b, "## %s\n\n", c.Name)
		if c.Description != "" {
			b.WriteString(c.Description + "\n\n")
		}
		renderNodes(&b, c.Items, nil, []*authConfig{c.Auth}, mergeKV(nil, c.Headers))
	}
	return b.String()
}

// renderNodes 递归展开文件夹；auths / hdrs 是祖先链（外 → 内），按 send.ts 同样的规则继承
func renderNodes(b *strings.Builder, items []node, path []string, auths []*authConfig, hdrs []services.KVPair) {
	for _, n := range items {
		if n.Kind == "folder" {
			renderNodes(b, n.Items, append(slices.Clip(path), n.Name), append(slices.Clip(auths), n.Auth), mergeKV(hdrs, n.Headers))
			continue
		}
		renderRequest(b, n, path, auths, hdrs)
	}
}

func renderRequest(b *strings.Builder, n node, path []string, auths []*authConfig, hdrs []services.KVPair) {
	method := strings.ToUpper(n.Method)
	if n.Protocol == "ws" {
		method = "WS"
	} else if method == "" {
		method = "GET"
	}
	fmt.Fprintf(b, "### %s\n\n**`%s`** `%s`\n\n", strings.Join(append(slices.Clip(path), n.Name), " / "), method, n.URL)
	if a := authText(effectiveAuth(n.Auth, auths)); a != "" {
		fmt.Fprintf(b, "- 鉴权：%s\n\n", a)
	}
	kvTable(b, "Query 参数", n.Params, false)
	kvTable(b, "请求头", mergeKV(hdrs, n.Headers), true)

	switch n.Body.Type {
	case "raw":
		lang := n.Body.RawLang
		if lang == "text" {
			lang = ""
		}
		b.WriteString("**请求体**\n\n" + fence(lang, pretty(n.Body.Raw)))
	case "urlencoded":
		kvTable(b, "请求体（x-www-form-urlencoded）", n.Body.Urlencoded, false)
	case "form-data":
		var rows []services.KVPair
		for _, f := range n.Body.FormData {
			v := f.Value
			if f.Type == "file" {
				v = "（文件）"
			}
			rows = append(rows, services.KVPair{Key: f.Key, Value: v, Enabled: f.Enabled, Description: f.Description})
		}
		kvTable(b, "请求体（multipart/form-data）", rows, false)
	case "binary":
		fmt.Fprintf(b, "**请求体**：二进制文件 `%s`\n\n", n.Body.BinaryPath)
	case "graphql":
		if g := n.Body.GraphQL; g != nil {
			b.WriteString("**GraphQL**\n\n" + fence("graphql", g.Query))
			if strings.TrimSpace(g.Variables) != "" {
				b.WriteString("**Variables**\n\n" + fence("json", pretty(g.Variables)))
			}
		}
	}

	for _, ex := range n.Examples {
		if ex.Response == nil {
			continue
		}
		fmt.Fprintf(b, "**响应示例** `%d` %s\n\n", ex.Response.StatusCode, ex.Name)
		if ex.Response.Body != "" {
			body := pretty(ex.Response.Body)
			lang := ""
			if json.Valid([]byte(ex.Response.Body)) {
				lang = "json"
			}
			b.WriteString(fence(lang, body))
		}
	}
}

func effectiveAuth(own *authConfig, chain []*authConfig) *authConfig {
	if own == nil || own.Type != "inherit" {
		return own
	}
	for i := len(chain) - 1; i >= 0; i-- { // 直接父级优先
		if a := chain[i]; a != nil && a.Type != "none" && a.Type != "inherit" {
			return a
		}
	}
	return nil
}

func authText(a *authConfig) string {
	if a == nil {
		return ""
	}
	switch a.Type {
	case "bearer":
		return "Bearer Token（`Authorization: Bearer <token>`）"
	case "basic":
		return "Basic Auth"
	case "apikey":
		if a.Apikey != nil {
			where := "请求头"
			if a.Apikey.In == "query" {
				where = "Query"
			}
			return fmt.Sprintf("API Key（%s `%s`）", where, a.Apikey.Key)
		}
		return "API Key"
	case "jwt":
		return "JWT（`Authorization: Bearer <jwt>`）"
	case "digest":
		return "Digest Auth"
	case "oauth1":
		return "OAuth 1.0"
	case "oauth2":
		return "OAuth 2.0（`Authorization: Bearer <access_token>`）"
	case "awsv4":
		return "AWS Signature V4"
	}
	return ""
}

// mergeKV 内层覆盖外层（key 忽略大小写），只保留启用且 key 非空的行
func mergeKV(base, own []services.KVPair) []services.KVPair {
	out := slices.Clone(base)
	for _, h := range own {
		k := strings.TrimSpace(h.Key)
		if !h.Enabled || k == "" {
			continue
		}
		i := slices.IndexFunc(out, func(x services.KVPair) bool { return strings.EqualFold(strings.TrimSpace(x.Key), k) })
		if i >= 0 {
			out[i] = h
		} else {
			out = append(out, h)
		}
	}
	return out
}

func kvTable(b *strings.Builder, title string, rows []services.KVPair, maskSecrets bool) {
	var on []services.KVPair
	for _, r := range rows {
		if r.Enabled && strings.TrimSpace(r.Key) != "" {
			on = append(on, r)
		}
	}
	if len(on) == 0 {
		return
	}
	fmt.Fprintf(b, "**%s**\n\n| 名称 | 值 | 说明 |\n|---|---|---|\n", title)
	for _, r := range on {
		v := r.Value
		// 写死的凭据不进文档；{{var}} 引用保留，便于读者知道取哪个变量
		if maskSecrets && slices.Contains(sensitiveHeaders, strings.ToLower(strings.TrimSpace(r.Key))) && !strings.Contains(v, "{{") {
			v = "******"
		}
		fmt.Fprintf(b, "| `%s` | %s | %s |\n", cellEscaper.Replace(r.Key), cellEscaper.Replace(v), cellEscaper.Replace(r.Description))
	}
	b.WriteString("\n")
}

func fence(lang, s string) string {
	f := "```"
	for strings.Contains(s, f) {
		f += "`"
	}
	return f + lang + "\n" + strings.TrimRight(s, "\n") + "\n" + f + "\n\n"
}

func pretty(s string) string {
	var buf bytes.Buffer
	if json.Indent(&buf, []byte(s), "", "  ") == nil {
		return buf.String()
	}
	return s
}
