package services

// Go 侧鉴权：需要挑战-应答（Digest）或复杂签名（OAuth 1.0 / AWS SigV4）的类型在这里实现。
// Bearer / Basic / API Key / JWT 等由前端注入 Headers（见前端 send.ts），不经过本文件。
// 设计约束：所有纯函数把 now / nonce 作为参数注入，便于用官方固定向量做单测。

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ---------- 通用小工具 ----------

// rfc3986Encode 按 RFC 3986 / RFC 5849 百分号编码：仅未保留字符（A-Z a-z 0-9 - . _ ~）不编码。
// 注意 url.QueryEscape 会把空格编成 '+'、且会编码 '~'，不满足这两处规范，故自实现（按 UTF-8 字节编码）
func rfc3986Encode(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '.' || c == '_' || c == '~' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// randomHexN 生成 n 位十六进制随机串（crypto/rand），用于 OAuth1 nonce / Digest cnonce
func randomHexN(n int) (string, error) {
	b := make([]byte, (n+1)/2)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b)[:n], nil
}

// sha256HexStr 空切片 = 空 payload（对应 AWS 官方的 e3b0c442... 值）
func sha256HexStr(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// ---------- Digest（RFC 2069 / RFC 7616） ----------

type digestChallenge struct {
	Realm     string
	Nonce     string
	Opaque    string
	Algorithm string // MD5（默认）| MD5-sess | SHA-256 | SHA-256-sess
	Qop       string // 如 "auth"；多值时取 auth，否则取第一个
}

// parseDigestChallenge 解析 WWW-Authenticate 头里的 Digest 参数（引号 / 裸值都兼容）。
// 形如：Digest realm="Test", nonce="abc", opaque="xyz", qop="auth", algorithm=MD5
func parseDigestChallenge(header string) (*digestChallenge, error) {
	s := strings.TrimSpace(header)
	if !strings.HasPrefix(strings.ToLower(s), "digest") {
		return nil, fmt.Errorf("非 Digest 挑战: %s", s)
	}
	rest := strings.TrimSpace(s[len("Digest"):])
	if rest == "" {
		return &digestChallenge{Algorithm: "MD5"}, nil
	}
	// 按逗号切分但尊重引号（realm 里可能含逗号）
	var parts []string
	var cur strings.Builder
	inQuote := false
	for i := 0; i < len(rest); i++ {
		c := rest[i]
		switch {
		case c == '"':
			inQuote = !inQuote
			cur.WriteByte(c)
		case c == ',' && !inQuote:
			parts = append(parts, cur.String())
			cur.Reset()
		default:
			cur.WriteByte(c)
		}
	}
	parts = append(parts, cur.String())

	c := &digestChallenge{Algorithm: "MD5"}
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		eq := strings.IndexByte(part, '=')
		if eq < 0 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(part[:eq]))
		val := strings.Trim(strings.TrimSpace(part[eq+1:]), `"`)
		switch key {
		case "realm":
			c.Realm = val
		case "nonce":
			c.Nonce = val
		case "opaque":
			c.Opaque = val
		case "algorithm":
			c.Algorithm = strings.ToUpper(val)
		case "qop":
			for _, v := range strings.Split(val, ",") {
				v = strings.TrimSpace(v)
				if v == "" {
					continue
				}
				if v == "auth" {
					c.Qop = "auth"
					break
				}
				if c.Qop == "" {
					c.Qop = v
				}
			}
		}
	}
	if c.Nonce == "" {
		return nil, fmt.Errorf("Digest 挑战缺少 nonce")
	}
	return c, nil
}

// digestHash 按挑战算法算 H()（MD5 或 SHA-256，-sess 后缀只影响 HA1 组合方式，哈希函数相同）
func digestHash(algorithm, s string) string {
	switch algorithm {
	case "SHA-256", "SHA-256-SESS":
		sum := sha256.Sum256([]byte(s))
		return hex.EncodeToString(sum[:])
	default: // MD5 / MD5-SESS
		sum := md5.Sum([]byte(s))
		return hex.EncodeToString(sum[:])
	}
}

// buildDigestHeader 计算 Digest Authorization 头的值。
// userRealm 非空时覆盖 HA1 用的 realm（用户手动指定）；nc 为本次交换序号（%08x）；
// cnonce 整个交换只生成一次；挑战带 qop 时走 RFC 2617 的 resp 公式，否则走 RFC 2069 旧公式
func buildDigestHeader(c *digestChallenge, method, uri, user, pass, userRealm string, nc int, cnonce string) string {
	realm := c.Realm
	if userRealm != "" {
		realm = userRealm
	}
	ha1 := digestHash(c.Algorithm, user+":"+realm+":"+pass)
	if strings.HasSuffix(strings.ToUpper(c.Algorithm), "-SESS") {
		ha1 = digestHash(c.Algorithm, ha1+":"+c.Nonce+":"+cnonce)
	}
	ha2 := digestHash(c.Algorithm, strings.ToUpper(method)+":"+uri)
	var resp string
	if c.Qop != "" {
		resp = digestHash(c.Algorithm, ha1+":"+c.Nonce+":"+fmt.Sprintf("%08x", nc)+":"+cnonce+":"+c.Qop+":"+ha2)
	} else {
		resp = digestHash(c.Algorithm, ha1+":"+c.Nonce+":"+ha2)
	}

	var parts []string
	parts = append(parts, fmt.Sprintf(`username="%s"`, user))
	if realm != "" {
		parts = append(parts, fmt.Sprintf(`realm="%s"`, realm))
	}
	parts = append(parts, fmt.Sprintf(`nonce="%s"`, c.Nonce))
	parts = append(parts, fmt.Sprintf(`uri="%s"`, uri))
	if c.Qop != "" {
		parts = append(parts, "qop="+c.Qop)
		parts = append(parts, fmt.Sprintf("nc=%08x", nc))
		parts = append(parts, fmt.Sprintf(`cnonce="%s"`, cnonce))
	}
	if c.Opaque != "" {
		parts = append(parts, fmt.Sprintf(`opaque="%s"`, c.Opaque))
	}
	if a := c.Algorithm; a != "" && a != "MD5" {
		parts = append(parts, "algorithm="+a)
	}
	parts = append(parts, fmt.Sprintf(`response="%s"`, resp))
	return strings.Join(parts, ", ")
}

// doAuthedRequest 执行请求；req.Digest 非 nil 时处理 401 Digest 挑战-应答：
// 首发不带 Authorization，收到 401 + WWW-Authenticate: Digest 后计算响应头重试，
// 重试请求以重定向跟随后的最终请求（resp.Request）为模板——挑战里的 uri 指的实际就是它。
// 硬上限 2 次重试（覆盖 stale=true 换 nonce 再试一次）；client.Timeout 按每次 Do 独立计。
// ctx 贯穿全部 Do，前端取消随时生效。
func doAuthedRequest(ctx context.Context, client *http.Client, httpReq *http.Request, bodyBytes []byte, req HTTPRequest) (*http.Response, error) {
	if req.Digest == nil {
		return client.Do(httpReq)
	}
	d := req.Digest
	cnonce, err := randomHexN(16)
	if err != nil {
		return nil, err
	}
	cur := httpReq
	nc := 0
	for attempt := 0; attempt < 3; attempt++ { // 首发 + 最多 2 次重试
		resp, err := client.Do(cur)
		if err != nil {
			return nil, err
		}
		ch := resp.Header.Get("WWW-Authenticate")
		if resp.StatusCode != http.StatusUnauthorized || !strings.HasPrefix(strings.ToLower(ch), "digest") {
			return resp, nil // 非 401 / 非 Digest 挑战 → 交给调用方正常处理
		}
		c, err := parseDigestChallenge(ch)
		if err != nil {
			return resp, nil // 挑战无法解析 → 按普通 401 展示
		}
		if attempt == 2 {
			return resp, nil // 重试耗尽，按普通 401 展示
		}
		// 用原请求的 context 克隆：既保留调用方 ctx 的取消语义，又保留 httptrace 采集
		next := resp.Request.Clone(resp.Request.Context())
		if bodyBytes != nil {
			next.Body = io.NopCloser(bytes.NewReader(bodyBytes))
			next.ContentLength = int64(len(bodyBytes))
		}
		nc++
		next.Header.Set("Authorization", buildDigestHeader(c, next.Method, next.URL.RequestURI(), d.Username, d.Password, d.Realm, nc, cnonce))
		resp.Body.Close()
		cur = next
	}
	panic("unreachable")
}

// ---------- OAuth 1.0（RFC 5849） ----------

// oauth1BaseString 构造 Signature Base String（§3.4.1.1）：
// METHOD & encode(baseURI) & encode(规范化参数)。
// params 已含 URL query + urlencoded body + oauth_* 六参（除签名）。
// 排序依据 §3.4.1.3.2：按**编码后**的 key / value 升序（ASCII）——
// 例：编码后 "c%40" < "c2"，与原始字符顺序（'2' < '@'）相反，故必须先编码再排序
func oauth1BaseString(method string, baseURI string, params url.Values) string {
	type kv struct{ k, v string } // 均为百分号编码后的值
	all := make([]kv, 0, len(params))
	for k, vs := range params {
		for _, v := range vs {
			all = append(all, kv{rfc3986Encode(k), rfc3986Encode(v)})
		}
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].k != all[j].k {
			return all[i].k < all[j].k
		}
		return all[i].v < all[j].v
	})
	pairs := make([]string, len(all))
	for i, p := range all {
		pairs[i] = p.k + "=" + p.v
	}
	return strings.ToUpper(method) + "&" + rfc3986Encode(baseURI) + "&" + rfc3986Encode(strings.Join(pairs, "&"))
}

// oauth1Signature 计算签名（HMAC-SHA1 默认 / HMAC-SHA256 / PLAINTEXT），base64 编码。
// 复合密钥 = consumerSecret & tokenSecret
func oauth1Signature(baseString, consumerSecret, tokenSecret, sigMethod string) string {
	key := consumerSecret + "&" + tokenSecret
	switch sigMethod {
	case "HMAC-SHA256":
		m := hmac.New(sha256.New, []byte(key))
		m.Write([]byte(baseString))
		return base64.StdEncoding.EncodeToString(m.Sum(nil))
	case "PLAINTEXT":
		return base64.StdEncoding.EncodeToString([]byte(key))
	default: // HMAC-SHA1
		m := hmac.New(sha1.New, []byte(key))
		m.Write([]byte(baseString))
		return base64.StdEncoding.EncodeToString(m.Sum(nil))
	}
}

// signOAuth1 为请求附加 oauth_* 参数与 Authorization: OAuth 头。
// now / nonce 注入以便固定时间戳测已知向量。
// 仅 URL query 与 urlencoded body 参与签名（RFC 5849 规定），raw / form-data body 不参与
func signOAuth1(req *http.Request, o *AuthOAuth1, bodyBytes []byte, now time.Time, nonce string) error {
	if o.ConsumerKey == "" || o.ConsumerSecret == "" {
		return fmt.Errorf("OAuth 1.0 鉴权不完整：consumerKey / consumerSecret 必填")
	}
	sigMethod := o.SignatureMethod
	if sigMethod == "" {
		sigMethod = "HMAC-SHA1"
	}
	u := req.URL
	baseURI := u.Scheme + "://" + u.Host + u.EscapedPath()

	params := url.Values{}
	for k, vs := range u.Query() {
		params[k] = append([]string(nil), vs...)
	}
	if ct := req.Header.Get("Content-Type"); strings.HasPrefix(strings.ToLower(ct), "application/x-www-form-urlencoded") {
		if bp, err := url.ParseQuery(string(bodyBytes)); err == nil {
			for k, vs := range bp {
				params[k] = append(params[k], vs...)
			}
		}
	}
	params.Set("oauth_consumer_key", o.ConsumerKey)
	params.Set("oauth_nonce", nonce)
	params.Set("oauth_signature_method", sigMethod)
	params.Set("oauth_timestamp", strconv.FormatInt(now.Unix(), 10))
	params.Set("oauth_version", "1.0")
	if o.Token != "" {
		params.Set("oauth_token", o.Token)
	}
	// realm 不参与签名（RFC 5849 §3.4.1.3.1），只写在头里

	base := oauth1BaseString(req.Method, baseURI, params)
	sig := oauth1Signature(base, o.ConsumerSecret, o.TokenSecret, sigMethod)

	// 只用 Authorization 头传协议参数：不改 URL（旧实现把 urlencoded body 参数也写进了 query，
	// 且头和 query 双份协议参数，部分服务端会拒绝）
	oauth := url.Values{}
	for k, vs := range params {
		if strings.HasPrefix(k, "oauth_") {
			oauth[k] = vs
		}
	}
	oauth.Set("oauth_signature", sig)
	req.Header.Set("Authorization", formatOAuthHeader(o.Realm, oauth))
	return nil
}

// formatOAuthHeader 拼 Authorization: OAuth ... 头（值按 RFC 5849 百分号编码 + 双引号）
func formatOAuthHeader(realm string, p url.Values) string {
	var parts []string
	if realm != "" {
		parts = append(parts, `realm="`+realm+`"`)
	}
	keys := make([]string, 0, len(p))
	for k := range p {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		for _, v := range p[k] {
			parts = append(parts, k+`="`+rfc3986Encode(v)+`"`)
		}
	}
	return "OAuth " + strings.Join(parts, ", ")
}

// ---------- AWS Signature V4 ----------

// awsV4Sign 计算 AWS SigV4 签名并写 Authorization / X-Amz-Date（+ X-Amz-Security-Token）头。
// payloadHash 为 body 的 SHA256 hex（无 body 传 sha256HexStr(nil)）；now 注入以便固定时间戳测官方向量。
// 注意：CanonicalURI 用 EscapedPath()，S3 对象键含特殊字符时与主流 SDK 的二次编码行为存在差异（README 已声明限制）
func awsV4Sign(req *http.Request, a *AuthAWSV4, payloadHash string, now time.Time) error {
	if a.AccessKeyID == "" || a.SecretAccessKey == "" || a.Region == "" || a.Service == "" {
		return fmt.Errorf("AWS SigV4 鉴权不完整：accessKeyId / secretAccessKey / region / service 必填")
	}
	nowUTC := now.UTC()
	amzDate := nowUTC.Format("20060102T150405Z")
	dateStamp := nowUTC.Format("20060102")
	req.Header.Set("X-Amz-Date", amzDate)

	// CanonicalHeaders 冒号后**无空格**（AWS 规范：Lowercase(name) + ':' + Trim(value)）
	signedHeaders := "host;x-amz-date"
	canonicalHeaders := "host:" + req.URL.Host + "\n" + "x-amz-date:" + amzDate + "\n"
	if a.SessionToken != "" {
		req.Header.Set("X-Amz-Security-Token", a.SessionToken)
		canonicalHeaders += "x-amz-security-token:" + a.SessionToken + "\n"
		signedHeaders = "host;x-amz-date;x-amz-security-token"
	}

	// Canonical query：先 RFC 3986 编码（空格 → %20），再按编码后的 key、value 升序（含同名多值）
	type kv struct{ k, v string }
	all := make([]kv, 0)
	for k, vs := range req.URL.Query() {
		ek := rfc3986Encode(k)
		for _, v := range vs {
			all = append(all, kv{ek, rfc3986Encode(v)})
		}
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].k != all[j].k {
			return all[i].k < all[j].k
		}
		return all[i].v < all[j].v
	})
	pairs := make([]string, len(all))
	for i, p := range all {
		pairs[i] = p.k + "=" + p.v
	}

	canonicalURI := req.URL.EscapedPath()
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalRequest := strings.ToUpper(req.Method) + "\n" +
		canonicalURI + "\n" +
		strings.Join(pairs, "&") + "\n" +
		canonicalHeaders + "\n" +
		signedHeaders + "\n" +
		payloadHash
	stringToSign := "AWS4-HMAC-SHA256\n" +
		amzDate + "\n" +
		dateStamp + "/" + a.Region + "/" + a.Service + "/aws4_request\n" +
		sha256HexStr([]byte(canonicalRequest))

	kDate := hmacSHA256([]byte("AWS4"+a.SecretAccessKey), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(a.Region))
	kService := hmacSHA256(kRegion, []byte(a.Service))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	signature := hex.EncodeToString(hmacSHA256(kSigning, []byte(stringToSign)))

	req.Header.Set("Authorization",
		"AWS4-HMAC-SHA256 Credential="+a.AccessKeyID+"/"+dateStamp+"/"+a.Region+"/"+a.Service+"/aws4_request, "+
			"SignedHeaders="+signedHeaders+", "+
			"Signature="+signature)
	return nil
}

func hmacSHA256(key, data []byte) []byte {
	m := hmac.New(sha256.New, key)
	m.Write(data)
	return m.Sum(nil)
}

// ---------- OAuth 2.0 一键取 token ----------

// OAuth2TokenRequest 一键取 token 参数。GrantType 白名单：client_credentials | password
// （authorization_code / PKCE / implicit / refresh 需要浏览器回调或长期存储 refresh_token，明确不做）
type OAuth2TokenRequest struct {
	TokenURL     string `json:"tokenUrl"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	GrantType    string `json:"grantType"`
	Username     string `json:"username"` // 仅 password grant
	Password     string `json:"password"` // 仅 password grant
	Scope        string `json:"scope"`
	TimeoutMs    int    `json:"timeoutMs"` // 0 → 30000
}

// OAuth2TokenResponse token 端点响应里取用的三个字段，其余字段忽略
type OAuth2TokenResponse struct {
	AccessToken string `json:"accessToken"`
	TokenType   string `json:"tokenType"`
	ExpiresIn   int64  `json:"expiresIn"`
}

// FetchOAuth2Token 以 Basic 保护的 form（client 凭证）POST token 端点。
// 非 2xx / 非 JSON / 缺 access_token 都返回带响应体片段的中文错误，供前端 toast 展示
func (h *HTTPService) FetchOAuth2Token(ctx context.Context, t OAuth2TokenRequest) (OAuth2TokenResponse, error) {
	if t.GrantType != "client_credentials" && t.GrantType != "password" {
		return OAuth2TokenResponse{}, fmt.Errorf("不支持的 OAuth 2.0 授权方式: %s（仅支持 client_credentials / password）", t.GrantType)
	}
	if strings.TrimSpace(t.TokenURL) == "" {
		return OAuth2TokenResponse{}, fmt.Errorf("Token 端点（tokenUrl）不能为空")
	}
	form := url.Values{}
	form.Set("grant_type", t.GrantType)
	if t.Scope != "" {
		form.Set("scope", t.Scope)
	}
	if t.GrantType == "password" {
		form.Set("username", t.Username)
		form.Set("password", t.Password)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSpace(t.TokenURL), strings.NewReader(form.Encode()))
	if err != nil {
		return OAuth2TokenResponse{}, fmt.Errorf("无法解析 Token 端点: %v", err)
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpReq.Header.Set("Accept", "application/json")
	if t.ClientID != "" {
		httpReq.SetBasicAuth(t.ClientID, t.ClientSecret)
	}
	timeout := time.Duration(t.TimeoutMs) * time.Millisecond
	if t.TimeoutMs <= 0 {
		timeout = 30 * time.Second
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(httpReq)
	if err != nil {
		return OAuth2TokenResponse{}, fmt.Errorf("Token 请求失败: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return OAuth2TokenResponse{}, fmt.Errorf("读取 Token 响应失败: %v", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		frag := strings.TrimSpace(string(body))
		if len(frag) > 300 {
			frag = frag[:300] + "…"
		}
		if frag == "" {
			frag = "(无响应体)"
		}
		return OAuth2TokenResponse{}, fmt.Errorf("Token 端点返回 %d: %s", resp.StatusCode, frag)
	}
	var out struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return OAuth2TokenResponse{}, fmt.Errorf("Token 响应不是合法 JSON: %v", err)
	}
	if out.AccessToken == "" {
		return OAuth2TokenResponse{}, fmt.Errorf("Token 响应缺少 access_token 字段")
	}
	if out.TokenType == "" {
		out.TokenType = "Bearer"
	}
	return OAuth2TokenResponse{AccessToken: out.AccessToken, TokenType: out.TokenType, ExpiresIn: out.ExpiresIn}, nil
}
