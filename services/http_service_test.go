package services

import (
	"context"
	"crypto/x509"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestNormalizeURL(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"www.baidu.com", "https://www.baidu.com"},
		{"api.example.com/users?x=1", "https://api.example.com/users?x=1"},
		{"localhost:3000", "http://localhost:3000"},
		{"localhost", "http://localhost"},
		{"127.0.0.1:8080", "http://127.0.0.1:8080"},
		{"[::1]", "http://[::1]"},
		{"::1:8080", "http://::1:8080"},
		{"0.0.0.0:9000", "http://0.0.0.0:9000"},
		{"foo.local:3000", "http://foo.local:3000"},
		{":8080", "http://:8080"},
		{"https://example.com/a", "https://example.com/a"},
		{"http://10.0.0.1/x", "http://10.0.0.1/x"},
		{"  www.example.com  ", "https://www.example.com"},
		{"api.x.com/r?to=http://y.com", "https://api.x.com/r?to=http://y.com"},
	}
	for _, c := range cases {
		got, err := normalizeURL(c.in)
		if err != nil {
			t.Errorf("normalizeURL(%q) unexpected error: %v", c.in, err)
			continue
		}
		if got != c.want {
			t.Errorf("normalizeURL(%q) = %q, want %q", c.in, got, c.want)
		}
	}

	badInputs := []string{"", "   ", "/only/path"}
	for _, in := range badInputs {
		if _, err := normalizeURL(in); err == nil {
			t.Errorf("normalizeURL(%q) expected error, got nil", in)
		}
	}
}

func TestBuildURLWithQuery(t *testing.T) {
	// 空格 / 中文 / & / = 都要正确编码
	got, err := buildURLWithQuery("https://api.example.com/search", []KVPair{
		{Key: "q", Value: "中文 词", Enabled: true},
		{Key: "a&b", Value: "x=y", Enabled: true},
		{Key: "off", Value: "1", Enabled: false},
		{Key: "", Value: "2", Enabled: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := "https://api.example.com/search?q=%E4%B8%AD%E6%96%87+%E8%AF%8D&a%26b=x%3Dy"
	if got != want {
		t.Errorf("buildURLWithQuery = %q, want %q", got, want)
	}

	// 保留 URL 上已有的 query
	got, err = buildURLWithQuery("https://api.example.com/p?keep=1", []KVPair{
		{Key: "add", Value: "2", Enabled: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != "https://api.example.com/p?add=2&keep=1" {
		t.Errorf("buildURLWithQuery = %q", got)
	}

	// URL 自带 query 原样保留：顺序稳定、裸 flag 不被改成 flag=
	got, _ = buildURLWithQuery("https://api.example.com/p?z=1&a=2&flag", nil)
	if got != "https://api.example.com/p?z=1&a=2&flag" {
		t.Errorf("buildURLWithQuery raw = %q", got)
	}
}

func TestClassifyError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	cases := []struct {
		name string
		err  error
		want string
	}{
		{"canceled", context.Canceled, "canceled"},
		{"deadline", context.DeadlineExceeded, "timeout"},
		{"dns", &net.DNSError{Err: "no such host"}, "dns"},
		{"tls-cert-invalid", &x509.CertificateInvalidError{Reason: x509.Expired}, "tls"},
		{"tls-verify", errors.New("tls: failed to verify certificate: " + "x"), "other"}, // 非结构化错误不识别
		{"refused", &net.OpError{Op: "dial", Err: &os.SyscallError{Syscall: "connect", Err: syscall.ECONNREFUSED}}, "refused"},
		{"wrapped-refused", &urlError{err: &net.OpError{Op: "dial", Err: &os.SyscallError{Syscall: "connect", Err: syscall.ECONNREFUSED}}}, "refused"},
		{"unknown", errors.New("boom"), "other"},
		{"nil", nil, ""},
	}
	for _, c := range cases {
		if got := classifyError(c.err); got != c.want {
			t.Errorf("%s: classifyError = %q, want %q", c.name, got, c.want)
		}
	}
	_ = ctx
}

// urlError 模拟 http 包对底层错误的包装
type urlError struct{ err error }

func (u *urlError) Error() string { return "Get: " + u.err.Error() }
func (u *urlError) Unwrap() error { return u.err }

func TestBuildBody(t *testing.T) {
	tmp := t.TempDir()

	// urlencoded
	r, hint, err := buildBody(HTTPRequest{BodyType: "urlencoded", UrlEncoded: []KVPair{
		{Key: "a", Value: "1 2", Enabled: true},
		{Key: "off", Value: "x", Enabled: false},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if hint != "application/x-www-form-urlencoded" {
		t.Errorf("hint = %q", hint)
	}
	if s := readAll(t, r); s != "a=1+2" {
		t.Errorf("urlencoded body = %q", s)
	}

	// form-data（text + file）
	filePath := filepath.Join(tmp, "up.txt")
	if err := os.WriteFile(filePath, []byte("file-content"), 0o644); err != nil {
		t.Fatal(err)
	}
	r, hint, err = buildBody(HTTPRequest{BodyType: "form-data", FormData: []FormField{
		{Key: "name", Value: "bob", Enabled: true, Type: "text"},
		{Key: "file", FilePath: filePath, Enabled: true, Type: "file"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hint, "multipart/form-data; boundary=") {
		t.Errorf("form-data hint = %q", hint)
	}
	if s := readAll(t, r); !strings.Contains(s, "name=\"name\"\r\n\r\nbob") || !strings.Contains(s, "file-content") || !strings.Contains(s, `filename="up.txt"`) {
		t.Errorf("form-data body missing expected parts: %q", s)
	}

	// form-data 文件不存在 → 中文错误
	_, _, err = buildBody(HTTPRequest{BodyType: "form-data", FormData: []FormField{
		{Key: "f", FilePath: filepath.Join(tmp, "nope.bin"), Enabled: true, Type: "file"},
	}})
	if err == nil || !strings.Contains(err.Error(), "无法读取文件") {
		t.Errorf("expected 无法读取文件 error, got %v", err)
	}

	// raw json
	r, hint, err = buildBody(HTTPRequest{BodyType: "raw", RawLang: "json", Body: `{"a":1}`})
	if err != nil {
		t.Fatal(err)
	}
	if hint != "application/json" {
		t.Errorf("raw hint = %q", hint)
	}
	if s := readAll(t, r); s != `{"a":1}` {
		t.Errorf("raw body = %q", s)
	}

	// graphql（variables 非法 JSON 报错）
	_, _, err = buildBody(HTTPRequest{BodyType: "graphql", GraphQL: &GraphQLBody{Query: "q", Variables: "{bad"}})
	if err == nil || !strings.Contains(err.Error(), "variables") {
		t.Errorf("expected variables error, got %v", err)
	}
	r, hint, err = buildBody(HTTPRequest{BodyType: "graphql", GraphQL: &GraphQLBody{Query: "query { me }", Variables: `{"id":"1"}`}})
	if err != nil {
		t.Fatal(err)
	}
	if hint != "application/json" {
		t.Errorf("graphql hint = %q", hint)
	}
	if s := readAll(t, r); !strings.Contains(s, `"variables":{"id":"1"}`) {
		t.Errorf("graphql body = %q", s)
	}

	// none
	r, _, _ = buildBody(HTTPRequest{BodyType: "none", Body: "ignored"})
	if r != nil {
		t.Errorf("none body should be nil")
	}
}

func TestIsTextLike(t *testing.T) {
	cases := []struct {
		ct   string
		body []byte
		want bool
	}{
		{"", []byte("hello"), true},
		{"", []byte{0xff, 0xfe, 0x00, 0x01}, false},
		{"application/json; charset=utf-8", []byte("{}"), true},
		{"text/html", []byte("<p>"), true},
		{"image/png", []byte{0x89}, false},
		{"application/zip", nil, false},
		{"image/svg+xml", []byte("<svg>"), true},
	}
	for _, c := range cases {
		if got := isTextLike(c.ct, c.body); got != c.want {
			t.Errorf("isTextLike(%q) = %v, want %v", c.ct, got, c.want)
		}
	}
}

func TestErrorKindBadURL(t *testing.T) {
	// 直接走 SendRequest 的 bad_url 分支
	h := NewHTTPService()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := h.SendRequest(ctx, HTTPRequest{URL: ""})
	if err != nil {
		t.Fatal(err)
	}
	if resp.ErrorKind != "bad_url" || resp.Error == "" {
		t.Errorf("expected bad_url, got %+v", resp)
	}
}

func readAll(t *testing.T, r interface{ Read([]byte) (int, error) }) string {
	t.Helper()
	var sb strings.Builder
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		sb.Write(buf[:n])
		if err != nil {
			break
		}
	}
	return sb.String()
}

func TestDefaultDownloadName(t *testing.T) {
	cases := []struct {
		cd   string
		url  string
		want string
	}{
		{`attachment; filename="report.pdf"`, "https://x.com/dl", "report.pdf"},
		{`attachment; filename*=UTF-8''%E4%B8%AD%E6%96%87.pdf`, "https://x.com/dl", "中文.pdf"},
		{`attachment; filename=evil/../../etc/passwd`, "https://x.com/dl", "passwd"}, // 路径穿越被 basename 挡住
		{"", "https://x.com/files/video.mp4?dl=1", "video.mp4"},                      // 无 CD 回退 URL 末段
		{"", "https://x.com/", "download.bin"},                                       // URL 无路径末段
		{"", "https://x.com", "download.bin"},
		{"inline", "https://x.com/a.png", "a.png"}, // 有 CD 但无 filename → 回退 URL
	}
	for _, c := range cases {
		if got := defaultDownloadName(c.cd, c.url); got != c.want {
			t.Errorf("defaultDownloadName(%q, %q) = %q, want %q", c.cd, c.url, got, c.want)
		}
	}
}

func TestSanitizeFilename(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"/a/b/c.txt", "c.txt"},
		{`..\win\name.exe`, "name.exe"}, // Windows 分隔符在任意平台都要能剥掉
		{"", "download.bin"},
		{".", "download.bin"},
		{"ok name.txt", "ok name.txt"},
	}
	for _, c := range cases {
		if got := sanitizeFilename(c.in); got != c.want {
			t.Errorf("sanitizeFilename(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
