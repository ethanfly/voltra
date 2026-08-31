# Voltra

轻量级跨平台 API 接口调试工具（Wails v3 + Go + Vue3），Postman/Apifox 同类的本地优先（local-first）实现。

## 功能（v0.2）

- **六区专业化界面**：标题栏 / 活动栏 / 侧栏（可折叠、拖拽宽度）/ 标签区 / 主编辑区（请求-响应分栏，可双向拖拽）/ 状态栏；明 / 暗 / 跟随系统三主题，设计令牌单源
- **项目化接口管理**：项目 → 集合 → 文件夹 → 接口树；拖拽排序 / 移动、右键菜单、内联重命名、复制、搜索即时平铺过滤（1000 节点无压力）
- **HTTP 请求**：6 种 Body（none / form-data / urlencoded / raw·4 语言 / binary / graphql）、URL 与 Query 双向同步、Header 补全、集合级公共 Header / Auth 继承
- **Auth**：Bearer / Basic / API Key（header 或 query）/ 继承，发送时自动注入
- **环境与变量**：全局 / 项目 / 环境 / 请求四层作用域，`{{变量}}` 在 URL、Query、Header、Body、Auth 中替换；未定义变量高亮告警
- **响应查看**：状态行（按状态码着色 + 耗时 + 大小 + 时间戳）、Body Pretty / Raw / Preview、复制 / 下载 / 换行 / 搜索 / JSONPath 过滤、响应头、Set-Cookie 解析、网络错误中文说明 + 重试、取消发送
- **WebSocket**：WS/WSS 连接入树（青色标）、握手 Header、收/发气泡时间线（JSON 自动格式化、二进制 hex 摘要）、Text / JSON / Binary 发送、常用片段、自动重连 / 心跳
- **历史记录**：每次发送自动记录，日期分组、搜索、还原为新标签、另存为接口、清空 / 上限
- **生成代码**：11 语言 24 客户端（cURL / HTTPie / wget、Python、JS、Node、Java、PHP、Go、C#、Ruby、Swift、Kotlin），变量原样 / 当前环境真实值替换双模式
- **导入 / 导出**：Postman Collection v2.1 导入（含预览报告）与导出、Postman Environment 导入、cURL 粘贴解析、项目 JSON 导出
- **持久化**：重启恢复项目 / 环境 / 历史 / 主题 / 标签 / 侧栏宽度 / 分栏比例；数据文件损坏自动隔离（`.corrupt` 后缀）不崩；设置页可打开数据目录、导出全部数据备份

## 目录结构

```
voltra/
├── main.go                     # 应用入口，注册服务、创建窗口
├── go.mod
├── build/config.yml            # 应用元信息（名称 / 标识 / 版本）
├── services/
│   ├── http_service.go         # HTTPService：发送（ctx 取消、错误分类、计时、大响应截断）
│   ├── ws_service.go           # WSService：连接 / 重连 / 心跳 / 二进制
│   ├── storage_service.go      # StorageService：JSON 持久化 + 文件对话框 + 损坏隔离
│   ├── http_service_test.go    # 纯逻辑单测
│   └── storage_service_test.go # 纯逻辑单测
└── frontend/
    ├── src/
    │   ├── App.vue             # 六区布局装配
    │   ├── main.ts
    │   ├── api/backend.ts      # Wails 绑定封装
    │   ├── types/models.ts     # 全量数据模型（PRD §7）
    │   ├── stores/             # 模块级 reactive store（workspace/tabs/env/history/settings/ui-state）
    │   ├── lib/                # vars 替换、url、curl 解析、postman 导入导出、发送管线、persist、codegen 生成器
    │   ├── locales/zh-CN.ts    # 全部文案
    │   ├── styles/tokens.css   # 设计令牌（:root + [data-theme]）
    │   └── components/         # shell / tree / request / response / ws / env / history / codegen / settings / common
    ├── test/                   # vitest 纯逻辑单测
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

```bash
# 一次性：安装 wails3 CLI 与前端依赖
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.3
wails3 setup
cd frontend && npm install && cd ..

# 开发模式（热重载）
task dev          # 等价于 wails3 dev -config ./build/config.yml -port 9245
```

`task dev` 会在 `services/*.go` 的导出方法变化时自动重新生成 `frontend/bindings/`。

## 测试与构建

```bash
# Go 侧
go build . ./services && go vet . ./services && go test ./services/...

# 前端（类型检查 + 构建 + 单测）
cd frontend && npm run build && npm run test
```

## 打包发布

```bash
task build        # 产物在 bin/
```

跨平台交叉编译参考 [Cross-Platform Builds](https://v3.wails.io/guides/build/cross-platform/)。

## 文档（`docs/`）

- `docs/需求文档.md` —— 产品需求（PRD：数据模型 §7、验收标准 §10）
- `docs/功能清单.md` —— 逐条功能与优先级
- `docs/界面原型说明.md` + `docs/prototype/index.html` —— 界面原型
- `docs/交接说明.md` —— 早期实施说明（v0.2 实现完成后部分内容已过时）

## 关于 Wails v3（beta）的已知风险

v3 目前是 beta，桌面 API 稳定但仍有开放 bug（Linux 端相对偏多），文档也在持续完善中。遇到问题优先查 [GitHub Issues](https://github.com/wailsapp/wails/issues) 和 [Discord](https://discord.gg/JDdSxwjhGf)。

## 数据存储位置

`StorageService` 把数据存放在系统标准配置目录下的 `voltra` 文件夹：

- macOS: `~/Library/Application Support/voltra`
- Windows: `%APPDATA%/voltra`
- Linux: `~/.config/voltra`

包含 `projects.json`（项目 + 环境 + 项目变量）、`settings.json`、`ui-state.json`、`history.json`。方便直接用 Git 做版本管理或手动备份；损坏的文件启动时会自动隔离为 `*.corrupt.<时间戳>` 并降级为空。
