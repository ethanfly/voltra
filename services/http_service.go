package services

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// HTTPService 负责发送普通 HTTP 请求，是接口调试的核心能力
type HTTPService struct{}

func NewHTTPService() *HTTPService {
	return &HTTPService{}
}

// KVPair 用于 Header / Query 等键值对，Enabled 对应前端"启用/禁用某一行"的勾选框
type KVPair struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// HTTPRequest 前端传入的请求描述
type HTTPRequest struct {
	Method         string   `json:"method"`
	URL            string   `json:"url"`
	Headers        []KVPair `json:"headers"`
	Query          []KVPair `json:"query"`
	Body           string   `json:"body"`
	BodyType       string   `json:"bodyType"` // none | json | form | x-www-form-urlencoded | raw | binary
	TimeoutSeconds int      `json:"timeoutSeconds"`
	InsecureSkipTLSVerify bool `json:"insecureSkipTlsVerify"`
}

// HTTPResponse 返回给前端展示的响应结果
type HTTPResponse struct {
	StatusCode int      `json:"statusCode"`
	Status     string   `json:"status"`
	Headers    []KVPair `json:"headers"`
	Body       string   `json:"body"`
	SizeBytes  int      `json:"sizeBytes"`
	DurationMs int64    `json:"durationMs"`
	Error      string   `json:"error,omitempty"`
}

// SendRequest 是暴露给前端的核心方法，前端调用 HTTPService.SendRequest(req) 即可发起请求
func (h *HTTPService) SendRequest(req HTTPRequest) (HTTPResponse, error) {
	start := time.Now()

	fullURL := buildURLWithQuery(req.URL, req.Query)

	var bodyReader io.Reader
	if req.BodyType != "none" && req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}

	httpReq, err := http.NewRequest(strings.ToUpper(req.Method), fullURL, bodyReader)
	if err != nil {
		return HTTPResponse{Error: err.Error()}, nil
	}

	for _, h := range req.Headers {
		if h.Enabled && h.Key != "" {
			httpReq.Header.Set(h.Key, h.Value)
		}
	}
	// 常见 body 类型自动补 Content-Type，前端如果已手动设置 Header 则不覆盖
	if httpReq.Header.Get("Content-Type") == "" {
		switch req.BodyType {
		case "json":
			httpReq.Header.Set("Content-Type", "application/json")
		case "x-www-form-urlencoded":
			httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
	}

	timeout := time.Duration(req.TimeoutSeconds) * time.Second
	if req.TimeoutSeconds <= 0 {
		timeout = 30 * time.Second
	}

	client := &http.Client{
		Timeout: timeout,
	}
	if req.InsecureSkipTLSVerify {
		client.Transport = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
	}

	resp, err := client.Do(httpReq)
	duration := time.Since(start).Milliseconds()
	if err != nil {
		return HTTPResponse{
			Error:      err.Error(),
			DurationMs: duration,
		}, nil
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return HTTPResponse{
			Error:      fmt.Sprintf("读取响应体失败: %v", err),
			DurationMs: duration,
		}, nil
	}

	respHeaders := make([]KVPair, 0, len(resp.Header))
	for k, values := range resp.Header {
		respHeaders = append(respHeaders, KVPair{
			Key:     k,
			Value:   strings.Join(values, ", "),
			Enabled: true,
		})
	}

	return HTTPResponse{
		StatusCode: resp.StatusCode,
		Status:     resp.Status,
		Headers:    respHeaders,
		Body:       string(bodyBytes),
		SizeBytes:  len(bodyBytes),
		DurationMs: duration,
	}, nil
}

func buildURLWithQuery(rawURL string, query []KVPair) string {
	hasQuery := strings.Contains(rawURL, "?")
	var b strings.Builder
	b.WriteString(rawURL)
	first := !hasQuery
	for _, q := range query {
		if !q.Enabled || q.Key == "" {
			continue
		}
		if first {
			b.WriteString("?")
			first = false
		} else {
			b.WriteString("&")
		}
		b.WriteString(q.Key)
		b.WriteString("=")
		b.WriteString(q.Value)
	}
	return b.String()
}

var _ = bytes.MinRead // 占位，后续做 multipart/form-data 时会用到 bytes/mime/multipart
