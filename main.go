package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"voltra/services"
)

// 前端构建产物会输出到 frontend/dist，构建时一并打包进二进制
//
//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// 初始化各个后端服务
	httpService := services.NewHTTPService()
	wsService := services.NewWSService()
	storageService, err := services.NewStorageService()
	if err != nil {
		log.Fatalf("初始化本地存储失败: %v", err)
	}

	app := application.New(application.Options{
		Name:        "Voltra",
		Description: "轻量级跨平台 API 接口调试工具",
		Services: []application.Service{
			application.NewService(httpService),
			application.NewService(wsService),
			application.NewService(storageService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	// WSService 需要引用 app 实例才能向前端推送事件（收到消息/断开连接等）
	wsService.BindApp(app)

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:      "main",
		Title:     "Voltra",
		Width:     1280,
		Height:    840,
		MinWidth:  960,
		MinHeight: 600,
	})

	log.Println("Voltra 启动中...")
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
