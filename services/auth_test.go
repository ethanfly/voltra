package services

import (
	"context"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// ---------- 测试小工具 ----------

func md5hex(s string) string {
	sum := md5.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

// digestField 从 Digest Authorization 头里取某个字段（引号 / 裸值都兼容）。
// 仅用于测试断言；Digest 各字段值本身不含逗号，按逗号切分安全
func digestField(header, key string) string {
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		eq := strings.IndexByte(part, '=')
		if eq < 0 {
			continue
		}
		if !strings.EqualFold(strings.TrimSpace(part[:eq]), key) {
			continue
		}
		return strings.Trim(strings.TrimSpace(part[eq+1:]), `"`)
	}
	return ""
}

// ---------- applyHeaders ----------

func TestApplyHeaders(t *testing.T) {
	// 用户头生效 / 禁用行跳过 / 空 key 跳过 / Content-Type 兜底不覆盖 / 无 UA 补默认
	req, _ := http.NewRequest("GET", "https://example.com", nil)
	applyHeaders(req, []KVPair{
		{Key: "X-A", Value: "1", Enabled: true},
		{Key: "X-Off", Value: "2", Enabled: false},
		{Key: "", Value: "3", Enabled: true},
		{Key: "Content-Type", Value: "text/custom", Enabled: true},
	}, "application/json")
	if got := req.Header.Get("X-A"); got != "1" {
		t.Errorf("X-A = %q, want 1", got)
	}
	if got := req.Header.Get("X-Off"); got != "" {
		t.Errorf("禁用行不应生效: X-Off = %q", got)
	}
	if got := req.Header.Get("Content-Type"); got != "text/custom" {
		t.Errorf("用户已设 Content-Type 不应被兜底覆盖: %q", got)
	}
	if got := req.Header.Get("User-Agent"); got != defaultUserAgent {
		t.Errorf("未设 UA 时应补默认: %q", got)
	}

	// 用户显式设了 UA → 保留，且无 hint 时不凭空加 Content-Type
	req2, _ := http.NewRequest("GET", "https://example.com", nil)
	applyHeaders(req2, []KVPair{{Key: "User-Agent", Value: "Custom/1.0", Enabled: true}}, "")
	if got := req2.Header.Get("User-Agent"); got != "Custom/1.0" {
		t.Errorf("用户 UA 应保留: %q", got)
	}
	if got := req2.Header.Get("Content-Type"); got != "" {
		t.Errorf("无 hint 时不应补 Content-Type: %q", got)
	}

	// 无用户头 + 有 hint → 只补 Content-Type 与 UA
	req3, _ := http.NewRequest("POST", "https://example.com", nil)
	applyHeaders(req3, nil, "application/json")
	if got := req3.Header.Get("Content-Type"); got != "application/json" {
		t.Errorf("hint 应补 Content-Type: %q", got)
	}
	if got := req3.Header.Get("User-Agent"); got != defaultUserAgent {
		t.Errorf("UA 兜底: %q", got)
	}
}

func TestMaterializeBody(t *testing.T) {
	if b, err := materializeBody(nil); err != nil || b != nil {
		t.Errorf("nil → (%v, %v)", b, err)
	}
	b, err := materializeBody(strings.NewReader("hello"))
	if err != nil || string(b) != "hello" {
		t.Errorf("got (%q, %v)", b, err)
	}
}

// ---------- Digest 挑战解析 ----------

func TestParseDigestChallenge(t *testing.T) {
	cases := []struct {
		in      string
		want    digestChallenge
		wantErr bool
	}{
		{`Digest realm="Test", nonce="abc123", qop="auth"`, digestChallenge{Realm: "Test", Nonce: "abc123", Algorithm: "MD5", Qop: "auth"}, false},
		{`Digest realm="a,b", nonce="n1"`, digestChallenge{Realm: "a,b", Nonce: "n1", Algorithm: "MD5"}, false},
		{`Digest nonce=n2`, digestChallenge{Nonce: "n2", Algorithm: "MD5"}, false},
		{`Digest realm="T", nonce="n", qop="auth-int, auth"`, digestChallenge{Realm: "T", Nonce: "n", Algorithm: "MD5", Qop: "auth"}, false},
		{`Digest realm="T", nonce="n", algorithm=sha-256`, digestChallenge{Realm: "T", Nonce: "n", Algorithm: "SHA-256"}, false},
		{`Digest realm="T", nonce="n", opaque="op1"`, digestChallenge{Realm: "T", Nonce: "n", Algorithm: "MD5", Opaque: "op1"}, false},
		{`Digest`, digestChallenge{Algorithm: "MD5"}, false}, // 无参数：默认 MD5（无 nonce，服务端会拒）
		{`Basic abc`, digestChallenge{}, true},
		{`Digest realm="T"`, digestChallenge{}, true}, // 缺 nonce
	}
	for _, c := range cases {
		got, err := parseDigestChallenge(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("parseDigestChallenge(%q) 期望报错，得到 %+v", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseDigestChallenge(%q) 意外报错: %v", c.in, err)
			continue
		}
		if *got != c.want {
			t.Errorf("%q:\ngot  %+v\nwant %+v", c.in, *got, c.want)
		}
	}
}

// ---------- Digest 响应头计算 ----------

// TestBuildDigestHeaderKnownVector RFC 2617 §3.5 官方完整示例（qop=auth）：
// Mufasa / "Circle Of Life" / testrealm@host.com / GET /dir/index.html
func TestBuildDigestHeaderKnownVector(t *testing.T) {
	c := &digestChallenge{
		Realm:     "testrealm@host.com",
		Nonce:     "dcd98b7102dd2f0e8b11d0f600bfb0c093",
		Opaque:    "5ccc069c403ebaf9f0171e9517f40e41",
		Algorithm: "MD5",
		Qop:       "auth",
	}
	h := buildDigestHeader(c, "GET", "/dir/index.html", "Mufasa", "Circle Of Life", "", 1, "0a4f113b")
	if got := digestField(h, "response"); got != "6629fae49393a05397450978507c4ef1" {
		t.Errorf("RFC 2617 §3.5 向量不符:\n%s", h)
	}
	if got := digestField(h, "nc"); got != "00000001" {
		t.Errorf("nc = %q", got)
	}
	if got := digestField(h, "cnonce"); got != "0a4f113b" {
		t.Errorf("cnonce = %q", got)
	}
	if got := digestField(h, "opaque"); got != "5ccc069c403ebaf9f0171e9517f40e41" {
		t.Errorf("opaque = %q", got)
	}
}

// TestBuildDigestHeaderNoQop 无 qop 走 RFC 2069 旧公式 resp = H(HA1:nonce:HA2)。
// 期望值用独立的 Python RFC 2069 公式实现交叉验证过（8ac92b43e8b88d90174ebffd95607a18）
func TestBuildDigestHeaderNoQop(t *testing.T) {
	c := &digestChallenge{Realm: "First Realm", Nonce: "dcd98b7102dd2f0e8b11d0f600bfb0c093", Algorithm: "MD5"}
	h := buildDigestHeader(c, "GET", "/dir/index.html", "Mufasa", "JA2JkscatjvJ5vdMon8xyF7sQ1N", "", 0, "")
	if got := digestField(h, "response"); got != "8ac92b43e8b88d90174ebffd95607a18" {
		t.Errorf("RFC 2069 公式不符:\n%s", h)
	}
	if strings.Contains(strings.ToLower(h), "qop") {
		t.Errorf("无 qop 挑战不应输出 qop/nc/cnonce 字段:\n%s", h)
	}
	if got := digestField(h, "username"); got != "Mufasa" {
		t.Errorf("username = %q", got)
	}
}

// TestBuildDigestHeaderQop qop=auth 公式自洽校验（测试内独立重算，不复用被测函数）
func TestBuildDigestHeaderQop(t *testing.T) {
	const (
		user, pass = "alice", "s3cret"
		realm      = "Test"
		nonce      = "dcd98b7102dd2f0e8b11d0f600bfb0c093"
		cnonce     = "0f2c3e4a"
	)
	c := &digestChallenge{Realm: realm, Nonce: nonce, Algorithm: "MD5", Qop: "auth"}
	h := buildDigestHeader(c, "POST", "/api/x", user, pass, "", 1, cnonce)

	ha1 := md5hex(user + ":" + realm + ":" + pass)
	ha2 := md5hex("POST:/api/x")
	want := md5hex(ha1 + ":" + nonce + ":00000001" + ":" + cnonce + ":auth:" + ha2)
	if got := digestField(h, "response"); got != want {
		t.Errorf("qop 公式不符: got %s, want %s\n%s", got, want, h)
	}
	if got := digestField(h, "nc"); got != "00000001" {
		t.Errorf("nc = %q", got)
	}
	if got := digestField(h, "cnonce"); got != cnonce {
		t.Errorf("cnonce = %q", got)
	}

	// 用户手动指定 realm 时 HA1 用用户 realm，输出头里 realm 字段也跟随
	h2 := buildDigestHeader(c, "POST", "/api/x", user, pass, "UserRealm", 1, cnonce)
	ha1u := md5hex(user + ":UserRealm:" + pass)
	want2 := md5hex(ha1u + ":" + nonce + ":00000001" + ":" + cnonce + ":auth:" + ha2)
	if got := digestField(h2, "response"); got != want2 {
		t.Errorf("用户 realm 覆盖不符: %s", h2)
	}
	if got := digestField(h2, "realm"); got != "UserRealm" {
		t.Errorf("realm = %q", got)
	}
}

// digestServer 构造一个"独立实现"的 Digest 认证服务器：自己重算 response 校验客户端头，
// 与被测代码零共享逻辑，保证真互验
type digestServer struct {
	server *httptest.Server
	count  int
	nonce  string
}

func startDigestServer(t *testing.T, user, pass string, behavior func(d *digestServer, w http.ResponseWriter, r *http.Request)) *digestServer {
	d := &digestServer{nonce: "dcd98b7102dd2f0e8b11d0f600bfb0c093"}
	d.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		d.count++
		behavior(d, w, r)
	}))
	t.Cleanup(d.server.Close)
	return d
}

func (d *digestServer) challenge(w http.ResponseWriter, extra string) {
	ca := `Digest realm="Test", nonce="` + d.nonce + `", qop="auth"` + extra
	w.Header().Set("WWW-Authenticate", ca)
	w.WriteHeader(http.StatusUnauthorized)
}

// verifyAuth 服务端独立重算并校验客户端 Authorization 头
func (d *digestServer) verifyAuth(t *testing.T, user, pass string, r *http.Request, wantNC string) {
	t.Helper()
	auth := r.Header.Get("Authorization")
	if got := digestField(auth, "username"); got != user {
		t.Errorf("username = %q", got)
	}
	if got := digestField(auth, "uri"); got != r.URL.RequestURI() {
		t.Errorf("uri = %q, want %q", got, r.URL.RequestURI())
	}
	if got := digestField(auth, "nonce"); got != d.nonce {
		t.Errorf("nonce = %q, want %q", got, d.nonce)
	}
	if got := digestField(auth, "qop"); got != "auth" {
		t.Errorf("qop = %q", got)
	}
	nc := digestField(auth, "nc")
	if wantNC != "" && nc != wantNC {
		t.Errorf("nc = %q, want %q", nc, wantNC)
	}
	ha1 := md5hex(user + ":Test:" + pass)
	ha2 := md5hex(r.Method + ":" + r.URL.RequestURI())
	want := md5hex(ha1 + ":" + d.nonce + ":" + nc + ":" + digestField(auth, "cnonce") + ":auth:" + ha2)
	if got := digestField(auth, "response"); got != want {
		t.Errorf("response 验签失败: got %s, want %s\n%s", got, want, auth)
	}
}

func TestSendRequestDigestFlow(t *testing.T) {
	const user, pass = "alice", "s3cret"
	d := startDigestServer(t, user, pass, func(d *digestServer, w http.ResponseWriter, r *http.Request) {
		if d.count == 1 {
			if r.Header.Get("Authorization") != "" {
				t.Errorf("首发不应带 Authorization")
			}
			d.challenge(w, "")
			return
		}
		d.verifyAuth(t, user, pass, r, "00000001")
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, "ok")
	})

	h := NewHTTPService()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := h.SendRequest(ctx, HTTPRequest{
		Method: "GET",
		URL:    d.server.URL + "/secure",
		Digest: &AuthDigest{Username: user, Password: pass},
	})
	if err != nil {
		t.Fatalf("SendRequest: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, error = %q", resp.StatusCode, resp.Error)
	}
	if resp.Body != "ok" {
		t.Errorf("body = %q", resp.Body)
	}
	if d.count != 2 {
		t.Errorf("请求次数 = %d, want 2（首发 + 重试一次）", d.count)
	}
}

// TestSendRequestDigestStaleRetry 401 → stale=true 换 nonce → 重试成功，共 3 次请求
func TestSendRequestDigestStaleRetry(t *testing.T) {
	const user, pass = "alice", "s3cret"
	nonce1 := "111111111111111111111111"
	d := startDigestServer(t, user, pass, func(d *digestServer, w http.ResponseWriter, r *http.Request) {
		switch d.count {
		case 1:
			d.challenge(w, "")
		case 2:
			if got := digestField(r.Header.Get("Authorization"), "nonce"); got != d.nonce {
				t.Errorf("第二次请求应使用首个 nonce: got %q, want %q", got, d.nonce)
			}
			d.nonce = nonce1 // 换 nonce（模拟 stale）
			d.challenge(w, `, stale=true`)
		default:
			d.verifyAuth(t, user, pass, r, "00000002")
			w.WriteHeader(http.StatusOK)
			io.WriteString(w, "ok2")
		}
	})

	h := NewHTTPService()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := h.SendRequest(ctx, HTTPRequest{
		Method:   "POST",
		URL:      d.server.URL + "/secure",
		Body:     `{"a":1}`,
		BodyType: "raw",
		Digest:   &AuthDigest{Username: user, Password: pass},
	})
	if err != nil {
		t.Fatalf("SendRequest: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, error = %q", resp.StatusCode, resp.Error)
	}
	if d.count != 3 {
		t.Errorf("请求次数 = %d, want 3（首发 + stale 重试 + 换 nonce 重试）", d.count)
	}
}

// TestSendRequestDigestRetryExhausted 异常服务器持续 401 → 硬上限 3 次后按普通 401 返回
func TestSendRequestDigestRetryExhausted(t *testing.T) {
	d := startDigestServer(t, "u", "p", func(d *digestServer, w http.ResponseWriter, r *http.Request) {
		d.challenge(w, "")
	})

	h := NewHTTPService()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := h.SendRequest(ctx, HTTPRequest{
		Method: "GET",
		URL:    d.server.URL + "/x",
		Digest: &AuthDigest{Username: "u", Password: "wrong"},
	})
	if err != nil {
		t.Fatalf("SendRequest: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("重试耗尽应返回 401: %d", resp.StatusCode)
	}
	if d.count != 3 {
		t.Errorf("请求次数 = %d, want 3（硬上限）", d.count)
	}
}

// ---------- OAuth 1.0 ----------

// TestOAuth1SignatureKnownVector RFC 5849 §3.1 / §3.4.1.1 官方完整示例：
// POST http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b，body "c2&a3=2+q"
func TestOAuth1SignatureKnownVector(t *testing.T) {
	// RFC 示例的规范化参数（query + urlencoded body + oauth_* 协议参数；示例未带 oauth_version）
	params := url.Values{
		"a2":                     {"r b"},
		"a3":                     {"2 q", "a"},
		"b5":                     {"=%3D"},
		"c@":                     {""},
		"c2":                     {""},
		"oauth_consumer_key":     {"9djdj82h48djs9d2"},
		"oauth_nonce":            {"7d8f3e4a"},
		"oauth_signature_method": {"HMAC-SHA1"},
		"oauth_timestamp":        {"137131201"},
		"oauth_token":            {"kkk9d7dh3k39sjv7"},
	}
	wantBase := "POST&http%3A%2F%2Fexample.com%2Frequest&a2%3Dr%2520b%26a3%3D2%2520q%26a3%3Da%26" +
		"b5%3D%253D%25253D%26c%2540%3D%26c2%3D%26oauth_consumer_key%3D9djdj82h48djs9d2%26" +
		"oauth_nonce%3D7d8f3e4a%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D137131201%26" +
		"oauth_token%3Dkkk9d7dh3k39sjv7"
	if got := oauth1BaseString("POST", "http://example.com/request", params); got != wantBase {
		t.Errorf("base string 不符:\ngot  %s\nwant %s", got, wantBase)
	}

	// 复合密钥 j49sk3j29djd & dh893hdasih9 → 签名值。
	// 注意：RFC 5849 正文印的 bYT5CMsGcbgUdFHObYMEfcx6bsw= 是用 GET 误算的，
	// Errata 2550（Verified/Technical）更正为 POST 签名 r6/TJjbCOr97/+UU0NsvSne7s5g=
	if sig := oauth1Signature(wantBase, "j49sk3j29djd", "dh893hdasih9", "HMAC-SHA1"); sig != "r6/TJjbCOr97/+UU0NsvSne7s5g=" {
		t.Errorf("RFC 5849（Errata 2550）官方向量签名不符: %s", sig)
	}

	// PLAINTEXT = base64(consumerSecret & tokenSecret)
	if plain := oauth1Signature(wantBase, "cs", "ts", "PLAINTEXT"); plain != base64.StdEncoding.EncodeToString([]byte("cs&ts")) {
		t.Errorf("PLAINTEXT = %s", plain)
	}

	// HMAC-SHA256 自洽：与标准库独立计算一致
	m := hmac.New(sha256.New, []byte("j49sk3j29djd&dh893hdasih9"))
	m.Write([]byte(wantBase))
	if got := oauth1Signature(wantBase, "j49sk3j29djd", "dh893hdasih9", "HMAC-SHA256"); got != base64.StdEncoding.EncodeToString(m.Sum(nil)) {
		t.Errorf("HMAC-SHA256 = %s", got)
	}
}

// TestSignOAuth1 固定 now/nonce 的端到端签名 + 交叉自验
func TestSignOAuth1(t *testing.T) {
	o := &AuthOAuth1{
		ConsumerKey: "dpf43f3p2l4k3l03p4", ConsumerSecret: "kd94hf93k423kf44",
		Token: "nnch734d00sl2jdk", TokenSecret: "pfdkd39348",
		SignatureMethod: "HMAC-SHA1",
	}
	now := time.Unix(137131201, 0).UTC()

	// query 里带业务参数
	req, _ := http.NewRequest("GET", "http://photos.example.net/photos?file=vacation.jpg", nil)
	if err := signOAuth1(req, o, nil, now, "7d8f3e4a"); err != nil {
		t.Fatalf("signOAuth1: %v", err)
	}
	q := parseOAuthHeader(t, req.Header.Get("Authorization"))
	if req.URL.RawQuery != "file=vacation.jpg" {
		t.Errorf("URL query 不应被改写: %s", req.URL.RawQuery)
	}
	if q.Get("oauth_timestamp") != "137131201" || q.Get("oauth_nonce") != "7d8f3e4a" ||
		q.Get("oauth_version") != "1.0" || q.Get("oauth_token") != "nnch734d00sl2jdk" {
		t.Errorf("oauth_* 参数不完整: %v", q)
	}
	// 交叉自验：头里参数（去掉签名）+ URL query 重算，应等于写入的值
	sigInQuery := q.Get("oauth_signature")
	if sigInQuery == "" {
		t.Fatal("Authorization 缺少 oauth_signature")
	}
	q.Del("oauth_signature")
	q.Set("file", "vacation.jpg")
	base := oauth1BaseString("GET", "http://photos.example.net/photos", q)
	if want := oauth1Signature(base, o.ConsumerSecret, o.TokenSecret, "HMAC-SHA1"); sigInQuery != want {
		t.Errorf("交叉自验失败: %s != %s", sigInQuery, want)
	}
	// 头里 oauth_signature 是 query 值的百分号编码
	auth := req.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "OAuth ") {
		t.Errorf("Authorization 头格式: %s", auth)
	}
	if enc := rfc3986Encode(sigInQuery); !strings.Contains(auth, `oauth_signature="`+enc+`"`) {
		t.Errorf("头内签名编码不符: %s", auth)
	}

	// realm 非空时出现在头里
	req2, _ := http.NewRequest("GET", "https://api.example.com/x", nil)
	o2 := *o
	o2.Realm = "MyRealm"
	if err := signOAuth1(req2, &o2, nil, now, "n2"); err != nil {
		t.Fatalf("signOAuth1: %v", err)
	}
	if !strings.Contains(req2.Header.Get("Authorization"), `realm="MyRealm"`) {
		t.Errorf("realm 未写入头: %s", req2.Header.Get("Authorization"))
	}

	// 缺必填字段 → 报错
	if err := signOAuth1(req2, &AuthOAuth1{ConsumerSecret: "x"}, nil, now, "n"); err == nil {
		t.Error("缺 consumerKey 应报错")
	}

	// urlencoded body 参与签名：body 不同 → 签名不同
	signed := func(body string) string {
		r, _ := http.NewRequest("POST", "http://api.example.com/x", nil)
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		if err := signOAuth1(r, o, []byte(body), now, "n3"); err != nil {
			t.Fatalf("signOAuth1: %v", err)
		}
		return parseOAuthHeader(t, r.Header.Get("Authorization")).Get("oauth_signature")
	}
	if s1, s2 := signed("a=1&b=2"), signed("a=1&b=3"); s1 == s2 {
		t.Error("body 参与签名：不同 body 应产生不同签名")
	}

	// 非 urlencoded body 不参与签名（raw json）
	signedRaw := func(body string) string {
		r, _ := http.NewRequest("POST", "http://api.example.com/x", nil)
		r.Header.Set("Content-Type", "application/json")
		if err := signOAuth1(r, o, []byte(body), now, "n4"); err != nil {
			t.Fatalf("signOAuth1: %v", err)
		}
		return parseOAuthHeader(t, r.Header.Get("Authorization")).Get("oauth_signature")
	}
	if s1, s2 := signedRaw(`{"a":1}`), signedRaw(`{"a":2}`); s1 != s2 {
		t.Error("raw body 不应参与签名，不同 body 签名应相同")
	}
}

// parseOAuthHeader 把 `OAuth k="v", ...` 解成 url.Values（值已百分号解码）
func parseOAuthHeader(t *testing.T, h string) url.Values {
	t.Helper()
	out := url.Values{}
	for _, p := range strings.Split(strings.TrimPrefix(h, "OAuth "), ", ") {
		k, v, _ := strings.Cut(p, "=")
		dv, err := url.PathUnescape(strings.Trim(v, `"`))
		if err != nil {
			t.Fatalf("头值解码失败 %s: %v", p, err)
		}
		out.Add(k, dv)
	}
	return out
}

// ---------- AWS Signature V4 ----------

// 官方 SigV4 测试套件共用凭据
const (
	awsAK      = "AKIDEXAMPLE"
	awsSecret  = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
	awsAmzDate = "20150830T123600Z"
)

var awsTestNow = time.Date(2015, 8, 30, 12, 36, 0, 0, time.UTC)

// TestAWSV4SignatureKnownVector 官方测试套件 get-vanilla 用例
func TestAWSV4SignatureKnownVector(t *testing.T) {
	req, _ := http.NewRequest("GET", "https://example.amazonaws.com/", nil)
	a := &AuthAWSV4{AccessKeyID: awsAK, SecretAccessKey: awsSecret, Region: "us-east-1", Service: "service"}
	if err := awsV4Sign(req, a, sha256HexStr(nil), awsTestNow); err != nil {
		t.Fatalf("awsV4Sign: %v", err)
	}
	if got := req.Header.Get("X-Amz-Date"); got != awsAmzDate {
		t.Errorf("X-Amz-Date = %q", got)
	}
	auth := req.Header.Get("Authorization")
	const wantPrefix = "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature="
	if !strings.HasPrefix(auth, wantPrefix) {
		t.Errorf("Authorization 前缀不符:\n%s", auth)
	}
	if !strings.HasSuffix(auth, "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31") {
		t.Errorf("get-vanilla 官方向量签名不符:\n%s", auth)
	}

	// 缺必填字段 → 报错
	if err := awsV4Sign(req, &AuthAWSV4{AccessKeyID: "x"}, sha256HexStr(nil), awsTestNow); err == nil {
		t.Error("缺必填字段应报错")
	}
}

// TestAWSV4QueryOrdering 官方套件 get-vanilla-query-order-key：
// 同名多值按 ASCII 升序（大写 V < 小写 v），且按编码后字符串排序
func TestAWSV4QueryOrdering(t *testing.T) {
	req, _ := http.NewRequest("GET", "https://example.amazonaws.com/?Param1=value2&Param1=Value1", nil)
	a := &AuthAWSV4{AccessKeyID: awsAK, SecretAccessKey: awsSecret, Region: "us-east-1", Service: "service"}
	if err := awsV4Sign(req, a, sha256HexStr(nil), awsTestNow); err != nil {
		t.Fatalf("awsV4Sign: %v", err)
	}
	auth := req.Header.Get("Authorization")
	if !strings.HasSuffix(auth, "eedbc4e291e521cf13422ffca22be7d2eb8146eecf653089df300a15b2382bd1") {
		t.Errorf("get-vanilla-query-order-key 官方向量签名不符:\n%s", auth)
	}
}

// TestAWSV4UnreservedPath 官方套件 get-unreserved：
// 未保留字符（-._~ 与字母数字）不参与编码，EscapedPath 原样进 CanonicalURI
func TestAWSV4UnreservedPath(t *testing.T) {
	req, _ := http.NewRequest("GET", "https://example.amazonaws.com/-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", nil)
	a := &AuthAWSV4{AccessKeyID: awsAK, SecretAccessKey: awsSecret, Region: "us-east-1", Service: "service"}
	if err := awsV4Sign(req, a, sha256HexStr(nil), awsTestNow); err != nil {
		t.Fatalf("awsV4Sign: %v", err)
	}
	auth := req.Header.Get("Authorization")
	if !strings.HasSuffix(auth, "07ef7494c76fa4850883e2b006601f940f8a34d404d0cfa977f52a65bbf5f24f") {
		t.Errorf("get-unreserved 官方向量签名不符:\n%s", auth)
	}
}

// TestAWSV4SessionToken 官方测试套件 post-sts-header-before 用例（token 参与签名）
func TestAWSV4SessionToken(t *testing.T) {
	const stsToken = "AQoDYXdzEPT//////////wEXAMPLEtc764bNrC9SAPBSM22wDOk4x4HIZ8j4FZTwdQWLWsKWHGBuFqwAeMicRXmxfpSPfIeoIYRqTflfKD8YUuwthAx7mSEI/qkPpKPi/kMcGdQrmGdeehM4IC1NtBmUpp2wUE8phUZampKsburEDy0KPkyQDYwT7WZ0wq5VSXDvp75YU9HFvlRd8Tx6q6fE8YQcHNVXAkiY9q6d+xo0rKwT38xVqr7ZD0u0iPPkUL64lIZbqBAz+scqKmlzm8FDrypNC9Yjc8fPOLn9FX9KSYvKTr4rvx3iSIlTJabIQwj2ICCR/oLxBA=="
	req, _ := http.NewRequest("POST", "https://example.amazonaws.com/", nil)
	a := &AuthAWSV4{AccessKeyID: awsAK, SecretAccessKey: awsSecret, Region: "us-east-1", Service: "service", SessionToken: stsToken}
	if err := awsV4Sign(req, a, sha256HexStr(nil), awsTestNow); err != nil {
		t.Fatalf("awsV4Sign: %v", err)
	}
	if got := req.Header.Get("X-Amz-Security-Token"); got != stsToken {
		t.Errorf("X-Amz-Security-Token = %q", got)
	}
	auth := req.Header.Get("Authorization")
	const wantPrefix = "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date;x-amz-security-token, Signature="
	if !strings.HasPrefix(auth, wantPrefix) {
		t.Errorf("Authorization 前缀不符:\n%s", auth)
	}
	if !strings.HasSuffix(auth, "85d96828115b5dc0cfc3bd16ad9e210dd772bbebba041836c64533a82be05ead") {
		t.Errorf("post-sts-header-before 官方向量签名不符:\n%s", auth)
	}
}

// TestSendRequestAwsV4 完整发送链路：Go 侧签名后头格式正确、body 完整送达
func TestSendRequestAwsV4(t *testing.T) {
	var gotAuth, gotAmzDate, gotBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotAmzDate = r.Header.Get("X-Amz-Date")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		if !strings.HasPrefix(gotAuth, "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/") {
			t.Errorf("Authorization 前缀: %s", gotAuth)
		}
		if !strings.Contains(gotAuth, "us-east-1/service/aws4_request") {
			t.Errorf("Credential 范围: %s", gotAuth)
		}
		sig := gotAuth[strings.LastIndex(gotAuth, "Signature=")+len("Signature="):]
		if len(sig) != 64 {
			t.Errorf("签名应 64 位 hex: %s", sig)
		}
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, "signed-ok")
	}))
	defer server.Close()

	h := NewHTTPService()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := h.SendRequest(ctx, HTTPRequest{
		Method:   "POST",
		URL:      server.URL + "/items?prefix=photo",
		Body:     "hello-sig",
		BodyType: "raw",
		RawLang:  "text",
		AWSV4: &AuthAWSV4{
			AccessKeyID: awsAK, SecretAccessKey: awsSecret,
			Region: "us-east-1", Service: "service",
		},
	})
	if err != nil {
		t.Fatalf("SendRequest: %v", err)
	}
	if resp.StatusCode != 200 || resp.Body != "signed-ok" {
		t.Fatalf("status = %d, body = %q, error = %q", resp.StatusCode, resp.Body, resp.Error)
	}
	if len(gotAmzDate) != 16 || !strings.HasSuffix(gotAmzDate, "Z") {
		t.Errorf("X-Amz-Date 格式: %q", gotAmzDate)
	}
	if gotBody != "hello-sig" {
		t.Errorf("body 送达: %q", gotBody)
	}
}

// ---------- OAuth 2.0 一键取 token ----------

func TestFetchOAuth2Token(t *testing.T) {
	// password grant 成功：校验请求形态（method / content-type / Basic / form 字段）+ 响应解析
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/x-www-form-urlencoded" {
			t.Errorf("Content-Type = %s", ct)
		}
		wantUA := "Basic " + base64.StdEncoding.EncodeToString([]byte("cid:csecret"))
		if got := r.Header.Get("Authorization"); got != wantUA {
			t.Errorf("Basic 头 = %s", got)
		}
		_ = r.ParseForm()
		if r.Form.Get("grant_type") != "password" || r.Form.Get("username") != "u1" ||
			r.Form.Get("password") != "p1" || r.Form.Get("scope") != "read" {
			t.Errorf("form 字段: %s", r.Form.Encode())
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"access_token":"tok-123","token_type":"Bearer","expires_in":3600}`)
	}))
	defer server.Close()

	h := NewHTTPService()
	out, err := h.FetchOAuth2Token(context.Background(), OAuth2TokenRequest{
		TokenURL: server.URL, ClientID: "cid", ClientSecret: "csecret",
		GrantType: "password", Username: "u1", Password: "p1", Scope: "read",
	})
	if err != nil {
		t.Fatalf("FetchOAuth2Token: %v", err)
	}
	if out.AccessToken != "tok-123" || out.TokenType != "Bearer" || out.ExpiresIn != 3600 {
		t.Errorf("解析结果: %+v", out)
	}

	// client_credentials：form 不应含 username/password
	cc := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("grant_type") != "client_credentials" {
			t.Errorf("grant_type = %s", r.Form.Get("grant_type"))
		}
		if r.Form.Get("username") != "" || r.Form.Get("password") != "" {
			t.Errorf("client_credentials 不应带 user/pass: %s", r.Form.Encode())
		}
		fmt.Fprint(w, `{"access_token":"tok-cc"}`) // 缺 token_type → 默认 Bearer
	}))
	defer cc.Close()
	out2, err := h.FetchOAuth2Token(context.Background(), OAuth2TokenRequest{
		TokenURL: cc.URL, ClientID: "cid", ClientSecret: "csecret", GrantType: "client_credentials",
	})
	if err != nil {
		t.Fatalf("client_credentials: %v", err)
	}
	if out2.AccessToken != "tok-cc" || out2.TokenType != "Bearer" {
		t.Errorf("client_credentials 结果: %+v", out2)
	}

	// 401 → 错误含状态码与响应体片段
	unauth := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `{"error":"invalid_client"}`)
	}))
	defer unauth.Close()
	_, err = h.FetchOAuth2Token(context.Background(), OAuth2TokenRequest{
		TokenURL: unauth.URL, ClientID: "cid", ClientSecret: "bad", GrantType: "password",
		Username: "u", Password: "p",
	})
	if err == nil || !strings.Contains(err.Error(), "401") || !strings.Contains(err.Error(), "invalid_client") {
		t.Errorf("401 错误信息: %v", err)
	}

	// 非 JSON 响应
	plain := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "not json")
	}))
	defer plain.Close()
	if _, err = h.FetchOAuth2Token(context.Background(), OAuth2TokenRequest{
		TokenURL: plain.URL, GrantType: "password", Username: "u", Password: "p",
	}); err == nil || !strings.Contains(err.Error(), "JSON") {
		t.Errorf("非 JSON 错误信息: %v", err)
	}

	// 缺 access_token
	noTok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"token_type":"Bearer"}`)
	}))
	defer noTok.Close()
	if _, err = h.FetchOAuth2Token(context.Background(), OAuth2TokenRequest{
		TokenURL: noTok.URL, GrantType: "password", Username: "u", Password: "p",
	}); err == nil || !strings.Contains(err.Error(), "access_token") {
		t.Errorf("缺 access_token 错误: %v", err)
	}

	// 不支持的 grant
	if _, err = h.FetchOAuth2Token(context.Background(), OAuth2TokenRequest{
		TokenURL: server.URL, GrantType: "authorization_code",
	}); err == nil || !strings.Contains(err.Error(), "不支持") {
		t.Errorf("grant 白名单错误: %v", err)
	}
	// 空 tokenUrl
	if _, err = h.FetchOAuth2Token(context.Background(), OAuth2TokenRequest{
		GrantType: "password", Username: "u", Password: "p",
	}); err == nil || !strings.Contains(err.Error(), "tokenUrl") {
		t.Errorf("空 tokenUrl 错误: %v", err)
	}
}
