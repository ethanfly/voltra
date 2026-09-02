package services

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptrace"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"
)

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

// HTTPService 负责发送普通 HTTP 请求，是接口调试的核心能力
type HTTPService struct {
	app *application.App // 发送并下载时弹原生"保存文件"对话框用，main.go 里 BindApp 注入
}

func NewHTTPService() *HTTPService {
	return &HTTPService{}
}

// BindApp 在 main.go 里 application.New(...) 之后调用，
// 这样 DownloadRequest 才能拿到 app 实例弹出原生保存对话框
func (h *HTTPService) BindApp(app *application.App) {
	h.app = app
}

// KVPair 用于 Header / Query 等键值对，Enabled 对应前端"启用/禁用某一行"的勾选框
type KVPair struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Enabled     bool   `json:"enabled"`
	Description string `json:"description,omitempty"`
}

// FormField form-data 字段，file 类型用本地路径引用
type FormField struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Enabled     bool   `json:"enabled"`
	Description string `json:"description,omitempty"`
	Type        string `json:"type"` // text | file
	FilePath    string `json:"filePath,omitempty"`
}

// GraphQLBody GraphQL 请求体
type GraphQLBody struct {
	Query     string `json:"query"`
	Variables string `json:"variables"` // JSON 字符串，可为空
}

// HTTPRequest 前端传入的请求描述
// 注意：变量替换（{{var}}）已在前端发送前完成，Go 侧收到的是最终值，不感知变量
type HTTPRequest struct {
	Method                string       `json:"method"`
	URL                   string       `json:"url"`
	Headers               []KVPair     `json:"headers"`  // 已含 auth 注入与继承合并后的最终头
	Query                 []KVPair     `json:"query"`    // 最终 query 行
	Body                  string       `json:"body"`     // raw 文本
	BodyType              string       `json:"bodyType"` // none | form-data | urlencoded | raw | binary | graphql
	RawLang               string       `json:"rawLang"`  // json | xml | text | html
	UrlEncoded            []KVPair     `json:"urlEncoded"`
	FormData              []FormField  `json:"formData"`
	BinaryPath            string       `json:"binaryPath"`
	GraphQL               *GraphQLBody `json:"graphql"`
	TimeoutMs             int          `json:"timeoutMs"`             // 0 → 30000
	FollowRedirects       bool         `json:"followRedirects"`       // 默认 true（0 值语义由前端保证传 true）
	MaxRedirects          int          `json:"maxRedirects"`          // 0 → 10
	InsecureSkipTlsVerify bool         `json:"insecureSkipTlsVerify"`
	SendCookies           bool         `json:"sendCookies"` // false → 不挂 CookieJar
}

// ResponseTimings 各阶段耗时拆解（httptrace 采集）
type ResponseTimings struct {
	DnsMs      int64 `json:"dnsMs"`
	TcpMs      int64 `json:"tcpMs"`
	TlsMs      int64 `json:"tlsMs"`
	TtfbMs     int64 `json:"ttfbMs"`
	DownloadMs int64 `json:"downloadMs"`
}

// HTTPResponse 返回给前端展示的响应结果
type HTTPResponse struct {
	StatusCode   int             `json:"statusCode"`
	Status       string          `json:"status"`
	Headers      []KVPair        `json:"headers"`
	Body         string          `json:"body"`
	BodyEncoding string          `json:"bodyEncoding"` // utf8 | base64（二进制响应）
	ContentType  string          `json:"contentType"`
	SizeBytes    int             `json:"sizeBytes"`
	DurationMs   int64           `json:"durationMs"`
	Truncated    bool            `json:"truncated,omitempty"`
	Error        string          `json:"error,omitempty"`
	ErrorKind    string          `json:"errorKind,omitempty"` // bad_url | dns | timeout | tls | refused | canceled | other
	Timings      ResponseTimings `json:"timings"`
}

// maxBodyBytes 响应体读取硬上限（64MB），超出部分丢弃并置 Truncated
const maxBodyBytes = 64 * 1024 * 1024

// SendRequest 发送请求。
// ctx 由 Wails 运行时自动注入（生成器会跳过该参数，前端签名不变），
// 前端调用 CancellablePromise.cancel() 时 ctx 被取消，请求随之中断
func (h *HTTPService) SendRequest(ctx context.Context, req HTTPRequest) (HTTPResponse, error) {
	start := time.Now()

	normalized, err := normalizeURL(req.URL)
	if err != nil {
		return errorResponse(err, "bad_url", time.Since(start)), nil
	}

	fullURL, err := buildURLWithQuery(normalized, req.Query)
	if err != nil {
		return errorResponse(err, "bad_url", time.Since(start)), nil
	}

	bodyReader, contentTypeHint, err := buildBody(req)
	if err != nil {
		return errorResponse(err, "bad_url", time.Since(start)), nil
	}

	httpReq, err := http.NewRequestWithContext(ctx, strings.ToUpper(req.Method), fullURL, bodyReader)
	if err != nil {
		return errorResponse(err, "bad_url", time.Since(start)), nil
	}

	for _, hd := range req.Headers {
		if hd.Enabled && hd.Key != "" {
			httpReq.Header.Set(hd.Key, hd.Value)
		}
	}
	// 常见 body 类型自动补 Content-Type，前端如果已手动设置 Header 则不覆盖
	if contentTypeHint != "" && httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", contentTypeHint)
	}

	client := buildClient(req)

	// httptrace 采集 DNS / TCP / TLS / TTFB / 下载 各阶段耗时
	tt := &traceTimer{}
	trace := &httptrace.ClientTrace{
		DNSStart:            func(httptrace.DNSStartInfo) { tt.set(&tt.dnsStart) },
		DNSDone:             func(httptrace.DNSDoneInfo) { tt.set(&tt.dnsDone) },
		ConnectStart:        func(string, string) { tt.set(&tt.connStart) },
		ConnectDone:         func(string, string, error) { tt.set(&tt.connDone) },
		TLSHandshakeStart:   func() { tt.set(&tt.tlsStart) },
		TLSHandshakeDone:    func(tls.ConnectionState, error) { tt.set(&tt.tlsDone) },
		GotFirstResponseByte: func() { tt.set(&tt.firstByte) },
	}
	httpReq = httpReq.WithContext(httptrace.WithClientTrace(ctx, trace))

	resp, err := client.Do(httpReq)
	durationMs := time.Since(start).Milliseconds()
	tt.end()
	if err != nil {
		return HTTPResponse{
			Error:      err.Error(),
			ErrorKind:  classifyError(err),
			DurationMs: durationMs,
			Timings:    tt.timings(start),
		}, nil
	}
	defer resp.Body.Close()

	limited := io.LimitReader(resp.Body, maxBodyBytes+1)
	bodyBytes, readErr := io.ReadAll(limited)
	if readErr != nil && !errors.Is(readErr, context.Canceled) {
		// 连接在读取中中断：把已读到的部分交给前端，同时标记错误
		if len(bodyBytes) == 0 {
			return HTTPResponse{
				Error:      readErr.Error(),
				ErrorKind:  classifyError(readErr),
				DurationMs: time.Since(start).Milliseconds(),
				Timings:    tt.timings(start),
			}, nil
		}
	}

	truncated := len(bodyBytes) > maxBodyBytes
	if truncated {
		bodyBytes = bodyBytes[:maxBodyBytes]
	}

	contentType := resp.Header.Get("Content-Type")
	bodyEncoding := "utf8"
	if !isTextLike(contentType, bodyBytes) {
		bodyEncoding = "base64"
	}
	bodyText := string(bodyBytes)
	if bodyEncoding == "base64" {
		bodyText = base64.StdEncoding.EncodeToString(bodyBytes)
	}

	respHeaders := make([]KVPair, 0, len(resp.Header))
	for k, values := range resp.Header {
		respHeaders = append(respHeaders, KVPair{
			Key:     k,
			Value:   strings.Join(values, ", "),
			Enabled: true,
		})
	}
	sort.Slice(respHeaders, func(i, j int) bool { return respHeaders[i].Key < respHeaders[j].Key })

	return HTTPResponse{
		StatusCode:   resp.StatusCode,
		Status:       resp.Status,
		Headers:      respHeaders,
		Body:         bodyText,
		BodyEncoding: bodyEncoding,
		ContentType:  contentType,
		SizeBytes:    len(bodyBytes),
		DurationMs:   durationMs,
		Truncated:    truncated,
		Timings:      tt.timings(start),
	}, nil
}

// buildClient 按请求设置构造 http.Client（超时 / 重定向 / Cookie / TLS），
// SendRequest 与 DownloadRequest 共用，保证两条路径行为一致
func buildClient(req HTTPRequest) *http.Client {
	timeout := time.Duration(req.TimeoutMs) * time.Millisecond
	if req.TimeoutMs <= 0 {
		timeout = 30 * time.Second
	}
	maxRedirects := req.MaxRedirects
	if maxRedirects <= 0 {
		maxRedirects = 10
	}

	client := &http.Client{Timeout: timeout}
	client.CheckRedirect = func(r *http.Request, via []*http.Request) error {
		if !req.FollowRedirects {
			return http.ErrUseLastResponse
		}
		if len(via) > maxRedirects {
			return fmt.Errorf("重定向次数超过上限 %d", maxRedirects)
		}
		return nil
	}
	if req.SendCookies {
		if jar, err := cookiejar.New(nil); err == nil {
			client.Jar = jar
		}
	}
	if req.InsecureSkipTlsVerify {
		client.Transport = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
	}
	return client
}

// DownloadResult 发送并下载的结果。Path 为空且 Cancelled=true 表示用户在保存对话框点了取消
type DownloadResult struct {
	Path        string `json:"path"`
	Cancelled   bool   `json:"cancelled"`
	SizeBytes   int    `json:"sizeBytes"`
	DurationMs  int64  `json:"durationMs"`
	ContentType string `json:"contentType"`
	StatusCode  int    `json:"statusCode"`
	Status      string `json:"status"`
	Error       string `json:"error,omitempty"`
	ErrorKind   string `json:"errorKind,omitempty"`
}

// DownloadRequest 发送请求并把响应体直接流式写入用户选择的文件（二进制不进前端内存）。
// 流程：发送 → 从响应头 / URL 推导默认文件名 → 弹原生"保存文件"对话框 → 流式拷贝到所选路径。
// ctx 由 Wails 注入，前端取消时 ctx 取消、网络阶段随之中断（对话框已弹出后无法中途收回）。
func (h *HTTPService) DownloadRequest(ctx context.Context, req HTTPRequest) (DownloadResult, error) {
	start := time.Now()
	if h.app == nil {
		return DownloadResult{Error: "文件对话框暂不可用", ErrorKind: "other", DurationMs: time.Since(start).Milliseconds()}, nil
	}

	normalized, err := normalizeURL(req.URL)
	if err != nil {
		return DownloadResult{Error: err.Error(), ErrorKind: "bad_url", DurationMs: time.Since(start).Milliseconds()}, nil
	}
	fullURL, err := buildURLWithQuery(normalized, req.Query)
	if err != nil {
		return DownloadResult{Error: err.Error(), ErrorKind: "bad_url", DurationMs: time.Since(start).Milliseconds()}, nil
	}
	bodyReader, contentTypeHint, err := buildBody(req)
	if err != nil {
		return DownloadResult{Error: err.Error(), ErrorKind: "bad_url", DurationMs: time.Since(start).Milliseconds()}, nil
	}

	httpReq, err := http.NewRequestWithContext(ctx, strings.ToUpper(req.Method), fullURL, bodyReader)
	if err != nil {
		return DownloadResult{Error: err.Error(), ErrorKind: "bad_url", DurationMs: time.Since(start).Milliseconds()}, nil
	}
	for _, hd := range req.Headers {
		if hd.Enabled && hd.Key != "" {
			httpReq.Header.Set(hd.Key, hd.Value)
		}
	}
	if contentTypeHint != "" && httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", contentTypeHint)
	}

	resp, err := buildClient(req).Do(httpReq)
	if err != nil {
		return DownloadResult{
			Error:      err.Error(),
			ErrorKind:  classifyError(err),
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	}
	defer resp.Body.Close()

	// 默认文件名：Content-Disposition 优先，其次 URL 末段，最后 download.bin
	defaultName := defaultDownloadName(resp.Header.Get("Content-Disposition"), fullURL)

	// 弹保存对话框（阻塞，用户选择目录与文件名）。取消 → 丢弃响应体
	savePath, err := h.app.Dialog.SaveFile().
		SetMessage("选择文件保存位置").
		SetFilename(defaultName).
		PromptForSingleSelection()
	if err != nil {
		return DownloadResult{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			Error:      err.Error(),
			ErrorKind:  "other",
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	}
	if savePath == "" {
		return DownloadResult{
			Cancelled:  true,
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	}

	fh, err := os.Create(savePath)
	if err != nil {
		return DownloadResult{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			Error:      fmt.Sprintf("创建文件失败: %v", err),
			ErrorKind:  "other",
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	}
	n, copyErr := io.Copy(fh, resp.Body)
	closeErr := fh.Close()
	if copyErr != nil {
		return DownloadResult{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			SizeBytes:  int(n),
			Error:      copyErr.Error(),
			ErrorKind:  classifyError(copyErr),
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	}
	if closeErr != nil {
		return DownloadResult{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			SizeBytes:  int(n),
			Error:      closeErr.Error(),
			ErrorKind:  "other",
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	}

	return DownloadResult{
		Path:        savePath,
		SizeBytes:   int(n),
		ContentType: resp.Header.Get("Content-Type"),
		StatusCode:  resp.StatusCode,
		Status:      resp.Status,
		DurationMs:  time.Since(start).Milliseconds(),
	}, nil
}

// defaultDownloadName 推导建议保存文件名：
// 优先 Content-Disposition 的 filename（含 filename*=UTF-8''... 形式），
// 其次 URL 路径末段，都没有则 download.bin
func defaultDownloadName(contentDisposition, fullURL string) string {
	if cd := strings.TrimSpace(contentDisposition); cd != "" {
		if i := strings.IndexByte(cd, ';'); i >= 0 {
			for _, part := range strings.Split(cd[i+1:], ";") {
				part = strings.TrimSpace(part)
				lower := strings.ToLower(part)
				if strings.HasPrefix(lower, "filename*=") {
					v := part[len("filename*="):]
					// 形如 UTF-8''%E4%B8%AD%E6%96%87.pdf：取两个单引号之间的百分号编码
					if q := strings.IndexByte(v, '\''); q >= 0 {
						v = v[q+1:]
						if q2 := strings.IndexByte(v, '\''); q2 >= 0 {
							v = v[q2+1:]
						}
						if u, err := url.QueryUnescape(v); err == nil && u != "" {
							return sanitizeFilename(u)
						}
					}
				} else if strings.HasPrefix(lower, "filename=") {
					v := strings.Trim(strings.TrimSpace(part[len("filename="):]), `"`)
					if v != "" {
						return sanitizeFilename(v)
					}
				}
			}
		}
	}
	if u, err := url.Parse(fullURL); err == nil {
		base := filepath.Base(u.Path)
		if base != "" && base != "." && base != "/" {
			return sanitizeFilename(base)
		}
	}
	return "download.bin"
}

// sanitizeFilename 只保留 basename 并把路径分隔符替换成下划线，避免跨目录写入。
// 用 LastIndexByte 同时找 / 和 \（filepath.Base 只认当前 OS 的分隔符，跨平台不可靠）
func sanitizeFilename(s string) string {
	i := strings.LastIndexByte(s, '/')
	if j := strings.LastIndexByte(s, '\\'); j > i {
		i = j
	}
	if i >= 0 {
		s = s[i+1:]
	}
	s = strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == 0 {
			return '_'
		}
		return r
	}, s)
	if s == "" || s == "." {
		return "download.bin"
	}
	return s
}

func errorResponse(err error, kind string, elapsed time.Duration) HTTPResponse {
	return HTTPResponse{
		Error:      err.Error(),
		ErrorKind:  kind,
		DurationMs: elapsed.Milliseconds(),
	}
}

// normalizeURL 对用户输入的 URL 做规范化：
//   - 无 scheme 时自动补全：本地地址（localhost/127.x/::1/0.0.0.0/.local/裸端口）补 http://，其余补 https://
//   - 已含 scheme 原样保留
//   - 补全后 host 为空 → 返回错误
func normalizeURL(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("URL 不能为空")
	}

	host := s
	if i := strings.IndexAny(s, "/?#"); i >= 0 {
		host = s[:i]
	}
	h := strings.ToLower(host)

	if !strings.Contains(s, "://") {
		scheme := "https"
		hnp := hostWithoutPort(h) // 判定前去掉端口（localhost:3000 → localhost）
		if hnp == "localhost" || strings.HasPrefix(hnp, "127.") || hnp == "[::1]" ||
			hnp == "::1" || hnp == "0.0.0.0" || strings.HasSuffix(hnp, ".local") ||
			strings.HasPrefix(h, ":") {
			scheme = "http"
		}
		s = scheme + "://" + s
	}

	u, err := url.Parse(s)
	if err != nil {
		return "", fmt.Errorf("无法解析 URL: %v", err)
	}
	if u.Host == "" {
		return "", fmt.Errorf("URL 缺少主机名，请检查输入（例如 https://api.example.com）")
	}
	return u.String(), nil
}

// buildURLWithQuery 把启用的 query 行拼进 URL，key/value 均做百分号编码。
// 不用 url.Values.Encode()（会按键名排序），保持用户在前端表格里的行序；
// 行在前，URL 上已有的 query 追加在后（正常路径前端已把 URL query 拆进行，这里只是兜底）
func buildURLWithQuery(normalized string, query []KVPair) (string, error) {
	u, err := url.Parse(normalized)
	if err != nil {
		return "", err
	}
	parts := make([]string, 0, len(query)+2)
	// 表格行在前（前端传的是最终 query 行，保持用户行序，不用 url.Values.Encode 的排序）
	for _, kv := range query {
		if !kv.Enabled || kv.Key == "" {
			continue
		}
		parts = append(parts, url.QueryEscape(kv.Key)+"="+url.QueryEscape(kv.Value))
	}
	// URL 上残留的 query 追加在后兜底（正常路径前端已把 URL query 拆进行）
	if u.RawQuery != "" {
		for k, vs := range u.Query() {
			for _, v := range vs {
				parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(v))
			}
		}
	}
	u.RawQuery = strings.Join(parts, "&")
	return u.String(), nil
}

// hostWithoutPort 去掉 host 上的端口：localhost:3000 → localhost、[::1]:8080 → [::1]
func hostWithoutPort(h string) string {
	if i := strings.IndexByte(h, '['); i == 0 {
		if j := strings.IndexByte(h, ']'); j >= 0 {
			return h[:j+1]
		}
		return h
	}
	if i := strings.LastIndexByte(h, ':'); i >= 0 {
		return h[:i]
	}
	return h
}

// buildBody 按 BodyType 构造请求体 reader，返回缺省 Content-Type（可能为空）
func buildBody(req HTTPRequest) (io.Reader, string, error) {
	switch req.BodyType {
	case "raw":
		if req.Body == "" {
			return nil, "", nil
		}
		hint := "text/plain"
		switch req.RawLang {
		case "json":
			hint = "application/json"
		case "xml":
			hint = "application/xml"
		case "html":
			hint = "text/html"
		}
		return strings.NewReader(req.Body), hint, nil

	case "urlencoded":
		if len(req.UrlEncoded) == 0 {
			return nil, "", nil
		}
		v := url.Values{}
		for _, kv := range req.UrlEncoded {
			if kv.Enabled && kv.Key != "" {
				v.Add(kv.Key, kv.Value)
			}
		}
		return strings.NewReader(v.Encode()), "application/x-www-form-urlencoded", nil

	case "form-data":
		fields := make([]FormField, 0, len(req.FormData))
		for _, f := range req.FormData {
			if f.Enabled && f.Key != "" {
				fields = append(fields, f)
			}
		}
		if len(fields) == 0 {
			return nil, "", nil
		}
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		for _, f := range fields {
			if f.Type == "file" && f.FilePath != "" {
				src, err := os.Open(f.FilePath)
				if err != nil {
					return nil, "", fmt.Errorf("无法读取文件 %s: %v", f.FilePath, err)
				}
				fw, err := mw.CreateFormFile(f.Key, filepathBase(f.FilePath))
				if err != nil {
					src.Close()
					return nil, "", err
				}
				_, err = io.Copy(fw, src)
				src.Close()
				if err != nil {
					return nil, "", fmt.Errorf("读取文件 %s 失败: %v", f.FilePath, err)
				}
			} else {
				if err := mw.WriteField(f.Key, f.Value); err != nil {
					return nil, "", err
				}
			}
		}
		if err := mw.Close(); err != nil {
			return nil, "", err
		}
		return &buf, mw.FormDataContentType(), nil

	case "binary":
		if req.BinaryPath == "" {
			return nil, "", nil
		}
		fh, err := os.Open(req.BinaryPath)
		if err != nil {
			return nil, "", fmt.Errorf("无法读取文件 %s: %v", req.BinaryPath, err)
		}
		return fh, "application/octet-stream", nil

	case "graphql":
		if req.GraphQL == nil {
			return nil, "", nil
		}
		payload := map[string]any{"query": req.GraphQL.Query}
		if strings.TrimSpace(req.GraphQL.Variables) != "" {
			var vars any
			if err := json.Unmarshal([]byte(req.GraphQL.Variables), &vars); err != nil {
				return nil, "", fmt.Errorf("GraphQL variables 不是合法 JSON: %v", err)
			}
			payload["variables"] = vars
		}
		data, err := json.Marshal(payload)
		if err != nil {
			return nil, "", err
		}
		return bytes.NewReader(data), "application/json", nil

	default: // none
		return nil, "", nil
	}
}

// classifyError 把 Go 原始错误分类为前端可展示的类型
// bad_url 在调用处单独判定，这里处理网络层错误
func classifyError(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.Canceled) {
		return "canceled"
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return "dns"
	}
	var certErr *x509.CertificateInvalidError
	if errors.As(err, &certErr) {
		return "tls"
	}
	var tlsVerifyErr *tls.CertificateVerificationError
	if errors.As(err, &tlsVerifyErr) {
		return "tls"
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		if errors.Is(opErr.Err, syscall.ECONNREFUSED) {
			return "refused"
		}
	}
	return "other"
}

// isTextLike 判断响应体是否可按文本直接展示
func isTextLike(contentType string, body []byte) bool {
	ct := strings.ToLower(strings.Split(contentType, ";")[0])
	switch {
	case ct == "":
		return utf8.Valid(body)
	case strings.HasPrefix(ct, "text/"):
		return true
	case strings.HasSuffix(ct, "/json"), strings.HasSuffix(ct, "/xml"),
		strings.HasSuffix(ct, "/javascript"), strings.HasSuffix(ct, "/x-www-form-urlencoded"),
		ct == "image/svg+xml", ct == "application/graphql":
		return true
	default:
		return false
	}
}

func filepathBase(p string) string {
	if i := strings.LastIndexByte(p, '/'); i >= 0 {
		return p[i+1:]
	}
	return p
}

// traceTimer 线程安全地记录 httptrace 各阶段时间点
type traceTimer struct {
	mu        sync.Mutex
	dnsStart  time.Time
	dnsDone   time.Time
	connStart time.Time
	connDone  time.Time
	tlsStart  time.Time
	tlsDone   time.Time
	firstByte time.Time
	endAt     time.Time
}

func (t *traceTimer) set(p *time.Time) {
	t.mu.Lock()
	*p = time.Now()
	t.mu.Unlock()
}

func (t *traceTimer) end() {
	t.mu.Lock()
	t.endAt = time.Now()
	t.mu.Unlock()
}

func (t *traceTimer) timings(start time.Time) ResponseTimings {
	t.mu.Lock()
	defer t.mu.Unlock()
	return ResponseTimings{
		DnsMs:      durMs(t.dnsStart, t.dnsDone),
		TcpMs:      durMs(t.connStart, t.connDone),
		TlsMs:      durMs(t.tlsStart, t.tlsDone),
		TtfbMs:     durMs(start, t.firstByte),
		DownloadMs: durMs(t.firstByte, t.endAt),
	}
}

func durMs(a, b time.Time) int64 {
	if a.IsZero() || b.IsZero() || b.Before(a) {
		return 0
	}
	return b.Sub(a).Milliseconds()
}
