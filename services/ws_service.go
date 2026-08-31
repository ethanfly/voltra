package services

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// WSService 负责 WebSocket 连接的建立、收发消息、关闭
//
// 设计说明：
//   - 一个 WSService 实例可以同时维护多个 WebSocket 连接（对应前端多个打开的 WS 请求标签页）
//   - 每个连接用一个 connID（uuid）标识，前端通过 connID 来发送消息 / 关闭连接
//   - Go 侧收到消息后，通过 Wails 的事件系统主动推送给前端（"ws:message"事件），
//     而不是让前端轮询，这样更符合 WebSocket 的双向实时特性
//   - 支持自动重连（复用原 connID，前端无感）与心跳（协议 Ping 或定时文本）
type WSService struct {
	app   *application.App
	mu    sync.Mutex
	conns map[string]*wsConnection
}

type wsConnection struct {
	mu         sync.Mutex // 保护 conn / hbStop / userClosed
	conn       *websocket.Conn
	hbStop     chan struct{}
	userClosed bool
	stop       chan struct{} // 整个连接（含重连）的终止信号
	url        string
	headers    http.Header
	opts       WSConnectOptions
}

func NewWSService() *WSService {
	return &WSService{
		conns: make(map[string]*wsConnection),
	}
}

// BindApp 在 main.go 里，application.New(...) 创建完 app 之后调用，
// 这样 WSService 才能拿到 app 实例用于向前端 Emit 事件
func (w *WSService) BindApp(app *application.App) {
	w.app = app
}

// WSConnectOptions 连接级选项（自动重连 / 心跳）
type WSConnectOptions struct {
	AutoReconnect       bool   `json:"autoReconnect"`
	ReconnectIntervalMs int    `json:"reconnectIntervalMs"` // 0 → 2000，指数退避上限 15000
	HeartbeatEnabled    bool   `json:"heartbeatEnabled"`
	HeartbeatIntervalMs int    `json:"heartbeatIntervalMs"` // 0 → 30000
	HeartbeatMessage    string `json:"heartbeatMessage"`    // 空串 → 发协议级 Ping 帧
}

// WSMessageEvent 是通过事件系统推送给前端的消息结构
// 前端用 Events.On("ws:message", callback) 监听
type WSMessageEvent struct {
	ConnID      string `json:"connId"`
	Message     string `json:"message"`      // 文本原样；二进制帧为 base64
	IsBinary    bool   `json:"isBinary"`
	IsBase64    bool   `json:"isBase64"`     // true 时 Message 需要前端 base64 解码
	Direction   string `json:"direction"`    // in | out
	IsHeartbeat bool   `json:"isHeartbeat"`  // 心跳产生的消息
	Timestamp   int64  `json:"timestamp"`
}

// WSStatusEvent 用于推送连接状态变化
// Status: connected | reconnecting | closed | error
type WSStatusEvent struct {
	ConnID string `json:"connId"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

// Connect 建立一个新的 WebSocket 连接，返回 connID 给前端后续引用
// headers 用于自定义握手请求头（例如鉴权 token），opts 控制重连与心跳
func (w *WSService) Connect(url string, headers []KVPair, opts WSConnectOptions) (string, error) {
	reqHeader := http.Header{}
	for _, h := range headers {
		if h.Enabled && h.Key != "" {
			reqHeader.Set(h.Key, h.Value)
		}
	}

	conn, _, err := websocket.DefaultDialer.Dial(url, reqHeader)
	if err != nil {
		return "", fmt.Errorf("连接 WebSocket 失败: %w", err)
	}

	connID := uuid.NewString()
	entry := &wsConnection{
		conn:    conn,
		url:     url,
		headers: reqHeader,
		opts:    opts,
		stop:    make(chan struct{}),
	}

	w.mu.Lock()
	w.conns[connID] = entry
	w.mu.Unlock()

	w.emitStatus(connID, "connected", "")

	if opts.HeartbeatEnabled {
		w.startHeartbeat(connID, entry)
	}
	go w.readLoop(connID, entry)

	return connID, nil
}

func (c *wsConnection) getConn() *websocket.Conn {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn
}

func (c *wsConnection) setConn(conn *websocket.Conn) {
	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()
}

func (c *wsConnection) isUserClosed() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.userClosed
}

func (c *wsConnection) markUserClosed() {
	c.mu.Lock()
	c.userClosed = true
	c.mu.Unlock()
}

// startHeartbeat 为当前 conn 启动一个心跳 goroutine；
// 返回前会停止旧的心跳（重连后换 conn 时调用）
func (w *WSService) startHeartbeat(connID string, entry *wsConnection) {
	entry.mu.Lock()
	old := entry.hbStop
	entry.hbStop = make(chan struct{})
	stop := entry.hbStop
	entry.mu.Unlock()
	if old != nil {
		close(old)
	}
	go w.heartbeatLoop(connID, entry, stop)
}

func (w *WSService) stopHeartbeat(entry *wsConnection) {
	entry.mu.Lock()
	old := entry.hbStop
	entry.hbStop = nil
	entry.mu.Unlock()
	if old != nil {
		close(old)
	}
}

func (w *WSService) heartbeatLoop(connID string, entry *wsConnection, stop chan struct{}) {
	interval := time.Duration(entry.opts.HeartbeatIntervalMs) * time.Millisecond
	if interval <= 0 {
		interval = 30 * time.Second
	}
	msg := entry.opts.HeartbeatMessage
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-entry.stop:
			return
		case <-ticker.C:
		}
		conn := entry.getConn()
		if conn == nil {
			continue
		}
		if msg == "" {
			// 协议级 Ping 帧：服务端自动回 Pong，不进消息时间线
			deadline := time.Now().Add(5 * time.Second)
			_ = conn.WriteControl(websocket.PingMessage, nil, deadline)
			continue
		}
		if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
			continue
		}
		w.emitMessage(WSMessageEvent{
			ConnID:      connID,
			Message:     msg,
			Direction:   "out",
			IsHeartbeat: true,
			Timestamp:   time.Now().UnixMilli(),
		})
	}
}

func (w *WSService) readLoop(connID string, entry *wsConnection) {
	conn := entry.getConn()
	for {
		select {
		case <-entry.stop:
			return
		default:
		}

		msgType, data, err := conn.ReadMessage()
		if err != nil {
			if entry.isUserClosed() {
				// Close 已负责发状态事件并移除
				return
			}
			if entry.opts.AutoReconnect {
				// 保持在 map 中，前端可通过 connID 继续发送（断开期间会提示未连接）
				w.emitStatus(connID, "reconnecting", err.Error())
				go w.reconnectLoop(connID, entry)
			} else {
				w.mu.Lock()
				delete(w.conns, connID)
				w.mu.Unlock()
				w.emitStatus(connID, "closed", err.Error())
			}
			return
		}

		evt := WSMessageEvent{
			ConnID:    connID,
			Message:   string(data),
			IsBinary:  msgType == websocket.BinaryMessage,
			Direction: "in",
			Timestamp: time.Now().UnixMilli(),
		}
		if evt.IsBinary {
			evt.Message = base64.StdEncoding.EncodeToString(data)
			evt.IsBase64 = true
		}
		w.emitMessage(evt)
	}
}

// reconnectLoop 断线后按指数退避重新握手，成功后复用原 connID 继续收发
func (w *WSService) reconnectLoop(connID string, entry *wsConnection) {
	base := time.Duration(entry.opts.ReconnectIntervalMs) * time.Millisecond
	if base <= 0 {
		base = 2 * time.Second
	}
	const maxInterval = 15 * time.Second
	interval := base

	for {
		if entry.isUserClosed() {
			w.removeConn(connID)
			return
		}
		// 可被 Close 中断的等待
		timer := time.NewTimer(interval)
		select {
		case <-entry.stop:
			timer.Stop()
			w.removeConn(connID)
			return
		case <-timer.C:
		}

		conn, _, err := websocket.DefaultDialer.Dial(entry.url, entry.headers)
		if err != nil {
			interval *= 2
			if interval > maxInterval {
				interval = maxInterval
			}
			continue
		}

		// 换上新连接
		entry.setConn(conn)
		interval = base
		w.emitStatus(connID, "connected", "重连成功")
		if entry.opts.HeartbeatEnabled {
			w.startHeartbeat(connID, entry)
		}

		// 同步进入读循环；返回时若仍是自动重连场景则继续循环
		w.readLoop(connID, entry)

		if entry.isUserClosed() {
			w.removeConn(connID)
			return
		}
	}
}

func (w *WSService) removeConn(connID string) {
	w.mu.Lock()
	delete(w.conns, connID)
	w.mu.Unlock()
}

// Send 向指定连接发送一条文本消息
func (w *WSService) Send(connID string, message string) error {
	entry := w.getConnEntry(connID)
	if entry == nil {
		return fmt.Errorf("连接不存在或已关闭: %s", connID)
	}
	conn := entry.getConn()
	if conn == nil {
		return fmt.Errorf("连接断开中，暂不可发送: %s", connID)
	}
	if err := conn.WriteMessage(websocket.TextMessage, []byte(message)); err != nil {
		return err
	}
	w.emitMessage(WSMessageEvent{
		ConnID:    connID,
		Message:   message,
		Direction: "out",
		Timestamp: time.Now().UnixMilli(),
	})
	return nil
}

// SendBinary 向指定连接发送一条二进制消息（base64 编码传入）
func (w *WSService) SendBinary(connID string, base64Data string) error {
	entry := w.getConnEntry(connID)
	if entry == nil {
		return fmt.Errorf("连接不存在或已关闭: %s", connID)
	}
	conn := entry.getConn()
	if conn == nil {
		return fmt.Errorf("连接断开中，暂不可发送: %s", connID)
	}
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return fmt.Errorf("二进制数据不是合法 base64: %v", err)
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
		return err
	}
	w.emitMessage(WSMessageEvent{
		ConnID:    connID,
		Message:   base64Data,
		IsBinary:  true,
		IsBase64:  true,
		Direction: "out",
		Timestamp: time.Now().UnixMilli(),
	})
	return nil
}

// SetAutoReconnect 运行时切换自动重连开关（影响之后的断线行为）
func (w *WSService) SetAutoReconnect(connID string, enabled bool) error {
	entry := w.getConnEntry(connID)
	if entry == nil {
		return fmt.Errorf("连接不存在或已关闭: %s", connID)
	}
	entry.opts.AutoReconnect = enabled
	return nil
}

// SetHeartbeat 运行时切换心跳开关
func (w *WSService) SetHeartbeat(connID string, enabled bool) error {
	entry := w.getConnEntry(connID)
	if entry == nil {
		return fmt.Errorf("连接不存在或已关闭: %s", connID)
	}
	entry.opts.HeartbeatEnabled = enabled
	if enabled {
		w.startHeartbeat(connID, entry)
	} else {
		w.stopHeartbeat(entry)
	}
	return nil
}

// Close 主动关闭指定连接（包括中止进行中的自动重连）
func (w *WSService) Close(connID string) error {
	w.mu.Lock()
	entry, ok := w.conns[connID]
	delete(w.conns, connID)
	w.mu.Unlock()
	if !ok {
		return nil
	}

	entry.markUserClosed()
	close(entry.stop)
	w.stopHeartbeat(entry)

	conn := entry.getConn()
	var err error
	if conn != nil {
		err = conn.Close()
	}
	w.emitStatus(connID, "closed", "已由用户主动关闭")
	return err
}

// ListConnections 返回当前所有活跃连接的 ID，便于前端刷新状态
func (w *WSService) ListConnections() []string {
	w.mu.Lock()
	defer w.mu.Unlock()
	ids := make([]string, 0, len(w.conns))
	for id := range w.conns {
		ids = append(ids, id)
	}
	return ids
}

func (w *WSService) getConnEntry(connID string) *wsConnection {
	w.mu.Lock()
	entry, ok := w.conns[connID]
	w.mu.Unlock()
	if !ok {
		return nil
	}
	return entry
}

func (w *WSService) emitMessage(evt WSMessageEvent) {
	if w.app == nil {
		return
	}
	w.app.Event.Emit("ws:message", evt)
}

func (w *WSService) emitStatus(connID, status, detail string) {
	if w.app == nil {
		return
	}
	w.app.Event.Emit("ws:status", WSStatusEvent{
		ConnID: connID,
		Status: status,
		Detail: detail,
	})
}
