package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRun(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"method": r.Method, "ct": r.Header.Get("Content-Type"), "x": r.Header.Get("X-A"),
			"q": r.URL.RawQuery, "body": string(b),
		})
	}))
	defer srv.Close()

	call := func(stdin string, args ...string) (int, map[string]any, string) {
		var out, errb bytes.Buffer
		code := run(args, strings.NewReader(stdin), &out, &errb)
		var resp map[string]any
		_ = json.Unmarshal(out.Bytes(), &resp)
		return code, resp, out.String() + errb.String()
	}
	echo := func(resp map[string]any) map[string]string {
		var m map[string]string
		_ = json.Unmarshal([]byte(resp["body"].(string)), &m)
		return m
	}

	// flag 模式：-d 合法 JSON → POST + application/json
	code, resp, raw := call("", "send", "-H", "X-A: 1", "-d", `{"a":1}`, srv.URL)
	if code != 0 || resp["statusCode"].(float64) != 200 {
		t.Fatalf("code=%d %s", code, raw)
	}
	if e := echo(resp); e["method"] != "POST" || e["ct"] != "application/json" || e["x"] != "1" || e["body"] != `{"a":1}` {
		t.Errorf("echo = %v", e)
	}

	// JSON 模式（stdin），没写 enabled 的行视为启用，显式 false 保留
	in := `{"url":"` + srv.URL + `","headers":[{"key":"X-A","value":"2"}],"query":[{"key":"k","value":"v"},{"key":"off","value":"1","enabled":false}]}`
	code, resp, raw = call(in, "send", "--json", "-")
	if code != 0 {
		t.Fatalf("code=%d %s", code, raw)
	}
	if e := echo(resp); e["method"] != "GET" || e["x"] != "2" || e["q"] != "k=v" {
		t.Errorf("json echo = %v", e)
	}

	// 网络失败 → 退出码 1 + errorKind
	if code, resp, _ = call("", "send", "--timeout", "2000", "http://127.0.0.1:1"); code != 1 || resp["errorKind"] != "refused" {
		t.Errorf("refused: code=%d resp=%v", code, resp)
	}
	// 用法错误 → 2
	if code, _, _ = call("", "send"); code != 2 {
		t.Errorf("usage code=%d", code)
	}
	if code, _, _ = call("", "bogus"); code != 2 {
		t.Errorf("unknown cmd code=%d", code)
	}
}
