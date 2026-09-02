// wails3 生成的绑定入口：HTTP / WS / Storage 三个服务的调用代理。
// Go 侧 services/*.go 变更后需重新生成：wails3 generate bindings -ts -i -clean=true -d frontend/bindings
export { HTTPService, WSService, StorageService } from '../../bindings/github.com/ramboLiang/voltra/services'

// 前端事件监听依赖 wails 运行时（@wailsio/runtime），
// 用于监听 Go 侧 WSService 主动推送的 ws:message / ws:status 事件
export { Events } from '@wailsio/runtime'
