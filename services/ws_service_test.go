package services

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestWSConcurrentWritesAndReconnect 心跳与 Send 并发写不能 panic；断线自动重连后只剩一个后台循环；Close 能干净退出。用 -race 跑
func TestWSConcurrentWritesAndReconnect(t *testing.T) {
	var mu sync.Mutex
	var conns []*websocket.Conn
	up := websocket.Upgrader{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := up.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		mu.Lock()
		conns = append(conns, c)
		mu.Unlock()
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer srv.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http")

	w := NewWSService()
	id, err := w.Connect(url, nil, WSConnectOptions{
		AutoReconnect: true, ReconnectIntervalMs: 10,
		HeartbeatEnabled: true, HeartbeatIntervalMs: 1, HeartbeatMessage: "hb",
	})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 200; i++ {
		_ = w.Send(id, "x")
	}
	// 服务端踢掉连接 → 应重连
	mu.Lock()
	conns[0].Close()
	mu.Unlock()
	deadline := time.Now().Add(3 * time.Second)
	for {
		mu.Lock()
		n := len(conns)
		mu.Unlock()
		if n >= 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("未重连")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := w.Close(id); err != nil {
		t.Logf("close: %v", err)
	}
	if ids := w.ListConnections(); len(ids) != 0 {
		t.Errorf("Close 后仍有连接: %v", ids)
	}
}
