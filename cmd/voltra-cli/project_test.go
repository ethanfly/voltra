package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProjectAndDoc(t *testing.T) {
	dir := t.TempDir()
	call := func(args ...string) (int, string) {
		var out, errb bytes.Buffer
		code := run(args, strings.NewReader(""), &out, &errb)
		return code, out.String() + errb.String()
	}

	// create → list → rename → 找不到 → delete 需 --yes
	code, out := call("project", "create", "--data-dir", dir, "Demo")
	if code != 0 {
		t.Fatalf("create: %d %s", code, out)
	}
	var created map[string]any
	_ = json.Unmarshal([]byte(out), &created)
	id, _ := created["id"].(string)
	if id == "" {
		t.Fatalf("create 未返回 id: %s", out)
	}
	if code, out = call("project", "list", "--data-dir", dir); code != 0 || !strings.Contains(out, `"Demo"`) {
		t.Fatalf("list: %d %s", code, out)
	}
	if code, out = call("project", "rename", "--data-dir", dir, id, "Shop"); code != 0 || !strings.Contains(out, `"Shop"`) {
		t.Fatalf("rename: %d %s", code, out)
	}
	if code, _ = call("project", "show", "--data-dir", dir, "nope"); code != 1 {
		t.Errorf("找不到项目应退出 1，得到 %d", code)
	}
	if code, _ = call("project", "delete", "--data-dir", dir, id); code != 2 {
		t.Errorf("delete 无 --yes 应退出 2，得到 %d", code)
	}

	// 写一份带继承 / 密钥 / 未知字段的项目，检查 doc 输出且 rename 不丢未知字段
	proj := `[{"id":"p1","name":"API","futureField":{"keep":true},
	  "variables":[{"key":"base","initialValue":"https://x.io","enabled":true},{"key":"tok","initialValue":"s3cret","enabled":true,"secret":true}],
	  "collections":[{"name":"Users","auth":{"type":"bearer","bearer":{"token":"hardcoded"}},
	    "headers":[{"key":"X-App","value":"v","enabled":true}],
	    "items":[{"kind":"folder","name":"Admin","items":[
	      {"kind":"request","name":"Create","protocol":"http","method":"post","url":"{{base}}/users",
	       "params":[{"key":"dry","value":"1","enabled":true,"description":"a|b"}],
	       "headers":[{"key":"Authorization","value":"Bearer raw-token","enabled":true},{"key":"Cookie","value":"{{tok}}","enabled":true}],
	       "auth":{"type":"inherit"},
	       "body":{"type":"raw","rawLang":"json","raw":"{\"name\":\"bob\"}"}}]}]}]}]`
	if err := os.WriteFile(filepath.Join(dir, "projects.json"), []byte(proj), 0o644); err != nil {
		t.Fatal(err)
	}
	code, md := call("doc", "--data-dir", dir, "API")
	if code != 0 {
		t.Fatalf("doc: %d %s", code, md)
	}
	for _, want := range []string{
		"# API API 文档", "### Admin / Create", "**`POST`** `{{base}}/users`", "Bearer Token",
		"| `X-App` | v |", "| `dry` | 1 | a\\|b |", "| `Cookie` | {{tok}} |", "| `tok` | ****** |", "\"name\": \"bob\"",
	} {
		if !strings.Contains(md, want) {
			t.Errorf("文档缺少 %q\n%s", want, md)
		}
	}
	for _, leak := range []string{"raw-token", "s3cret", "hardcoded"} {
		if strings.Contains(md, leak) {
			t.Errorf("文档泄露了密钥 %q", leak)
		}
	}

	out2 := filepath.Join(dir, "api.md")
	if code, out = call("doc", "--data-dir", dir, "-o", out2, "p1"); code != 0 || !strings.Contains(out, `"requests": 1`) {
		t.Fatalf("doc -o: %d %s", code, out)
	}
	if b, _ := os.ReadFile(out2); string(b) != md {
		t.Errorf("-o 文件内容不对")
	}

	if code, out = call("project", "rename", "--data-dir", dir, "p1", "API2"); code != 0 {
		t.Fatalf("rename: %d %s", code, out)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "projects.json")); !strings.Contains(string(b), `"futureField":{"keep":true}`) {
		t.Errorf("rename 丢了未知字段: %s", b)
	}
	if code, _ = call("project", "delete", "--data-dir", dir, "--yes", "p1"); code != 0 {
		t.Errorf("delete --yes 失败: %d", code)
	}
}
