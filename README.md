# Voltra

轻量级跨平台 API 接口调试工具（Wails v3 + Go + Vue3）。

当前是 **MVP 骨架**，已实现：
- HTTP 请求发送与响应展示（方法 / URL / Query / Headers / Body / 状态码 / 耗时）
- WebSocket 连接、收发消息、断开（Go 侧用 gorilla/websocket，通过 Wails 事件系统实时推送消息给前端）
- 本地 JSON 文件存储服务骨架（collections / environments / history，读写方法已就绪，前端 UI 暂未接入，留作下一步）

未实现（`docs/` 里的 v0.2 重构方案覆盖）：专业化界面（活动栏/侧栏/多标签/主题）、项目化接口管理 UI、环境变量替换、生成多语言代码、Postman/OpenAPI 导入导出、脚本引擎等。

---

## 目录结构

```
voltra/
├── main.go                     # 应用入口，注册服务、创建窗口
├── go.mod
├── services/
│   ├── http_service.go         # HTTPService：发送 HTTP 请求
│   ├── ws_service.go           # WSService：WebSocket 连接管理
│   └── storage_service.go      # StorageService：本地 JSON 文件存储
└── frontend/
    ├── src/
    │   ├── App.vue
    │   ├── main.ts
    │   ├── api/backend.ts       # 对接 Wails 自动生成绑定的封装层
    │   ├── types/models.ts      # 与 Go 结构体对应的 TS 类型
    │   └── components/
    │       ├── RequestPanel.vue
    │       ├── ResponsePanel.vue
    │       ├── WSPanel.vue
    │       └── KvEditor.vue
    ├── package.json
    ├── vite.config.ts
    └── index.html
```

## 本地运行前置条件

- Go 1.22+
- Node.js 18+
- 三端分别需要的系统依赖：
  - **Windows**：WebView2 Runtime（Win10 1809+ 一般已自带，或首次运行时会提示安装）
  - **macOS**：无需额外安装（使用系统 WebKit）
  - **Linux**：`libwebkit2gtk-4.1-dev`（或对应发行版包名），具体见 [Wails 安装文档](https://v3.wails.io/quick-start/installation/)
- 安装 `wails3` CLI：
  ```bash
  go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.3
  wails3 setup
  ```

## 本地运行

本仓库**已经是一个完整的 Wails v3 脚手架项目**（含 `build/config.yml`、各平台 `build/*/Taskfile.yml`、`Taskfile.yml`、已生成的 `frontend/bindings/`），直接跑即可，无需再合并进官方模板。

```bash
# 一次性：安装 wails3 CLI 与系统依赖
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.3
wails3 setup

# 安装前端依赖
cd frontend && npm install && cd ..

# 开发模式（热重载）
task dev          # 等价于 wails3 dev -config ./build/config.yml -port 9245
```

`task dev` 会在 `services/*.go` 的导出方法变化时自动重新生成 `frontend/bindings/`。

## 打包发布

```bash
task build        # 产物在 bin/
```

跨平台交叉编译参考 [Cross-Platform Builds](https://v3.wails.io/guides/build/cross-platform/)。

## 重构文档（v0.2）

重做界面 + 项目化接口管理 + 修复发送链路的完整方案见 `docs/`：

- `docs/交接说明.md` —— 实施总纲（先读这个）
- `docs/需求文档.md` —— 产品需求
- `docs/功能清单.md` —— 逐条功能与优先级
- `docs/界面原型说明.md` + `docs/prototype/index.html` —— 界面原型

## 关于 Wails v3（beta）的已知风险

详见 `docs/需求文档.md` §12 风险表：v3 目前是 beta.3，桌面 API 稳定但仍有开放 bug（Linux 端相对偏多），文档也在持续完善中。遇到问题优先查 [GitHub Issues](https://github.com/wailsapp/wails/issues) 和 [Discord](https://discord.gg/JDdSxwjhGf)。

## 数据存储位置

`StorageService` 把数据存放在系统标准配置目录下的 `voltra` 文件夹：

- macOS: `~/Library/Application Support/voltra`
- Windows: `%APPDATA%/voltra`
- Linux: `~/.config/voltra`

方便直接用 Git 做版本管理或手动备份。
