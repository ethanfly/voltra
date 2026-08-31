package services

import (
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
type WSService struct {
	app   *application.App
	mu    sync.Mutex
	conns map[string]*wsConnection
}

type wsConnection struct {
	conn   *websocket.Conn
	cancel chan struct{}
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

// WSMessageEvent 是通过事件系统推送给前端的消息结构
// 前端用 Events.On("ws:message", callback) 监听
type WSMessageEvent struct {
	ConnID    string `json:"connId"`
	Message   string `json:"message"`
	IsBinary  bool   `json:"isBinary"`
	Timestamp int64  `json:"timestamp"`
}

// WSStatusEvent 用于推送连接状态变化（已连接/已断开/出错）
type WSStatusEvent struct {
	ConnID string `json:"connId"`
	Status string `json:"status"` // connected | closed | error
	Detail string `json:"detail,omitempty"`
}

// Connect 建立一个新的 WebSocket 连接，返回 connID 给前端后续引用
// headers 用于自定义握手请求头，例如鉴权 token
func (w *WSService) Connect(url string, headers []KVPair) (string, error) {
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
		conn:   conn,
		cancel: make(chan struct{}),
	}

	w.mu.Lock()
	w.conns[connID] = entry
	w.mu.Unlock()

	w.emitStatus(connID, "connected", "")

	// 起一个协程持续读取消息，收到就通过事件推给前端
	go w.readLoop(connID, entry)

	return connID, nil
}

func (w *WSService) readLoop(connID string, entry *wsConnection) {
	defer func() {
		w.mu.Lock()
		delete(w.conns, connID)
		w.mu.Unlock()
	}()

	for {
		select {
		case <-entry.cancel:
			return
		default:
		}

		msgType, data, err := entry.conn.ReadMessage()
		if err != nil {
			w.emitStatus(connID, "closed", err.Error())
			return
		}

		w.emitMessage(WSMessageEvent{
			ConnID:    connID,
			Message:   string(data),
			IsBinary:  msgType == websocket.BinaryMessage,
			Timestamp: time.Now().UnixMilli(),
		})
	}
}

// Send 向指定连接发送一条文本消息
func (w *WSService) Send(connID string, message string) error {
	w.mu.Lock()
	entry, ok := w.conns[connID]
	w.mu.Unlock()
	if !ok {
		return fmt.Errorf("连接不存在或已关闭: %s", connID)
	}
	return entry.conn.WriteMessage(websocket.TextMessage, []byte(message))
}

// Close 主动关闭指定连接
func (w *WSService) Close(connID string) error {
	w.mu.Lock()
	entry, ok := w.conns[connID]
	delete(w.conns, connID)
	w.mu.Unlock()
	if !ok {
		return nil
	}
	close(entry.cancel)
	err := entry.conn.Close()
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
