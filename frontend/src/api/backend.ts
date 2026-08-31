// ⚠️ 重要说明
//
// Wails 会根据 Go 侧 services/*.go 里的导出方法，在你第一次执行
// `wails3 dev`（或 `wails3 generate bindings`）时，自动生成对应的
// TypeScript 绑定文件，输出目录通常是 frontend/bindings/voltra/services/。
//
// 生成之后，请对照 frontend/bindings/ 目录下的实际文件路径，
// 把下面这行 import 换成真实路径（不同 Wails 版本的目录层级可能略有差异，
// 以你本地生成的为准，其余业务代码都不需要跟着改）。
//
// 官方示例：import {GreetService} from "../bindings/changeme"
//          await GreetService.Greet(name)

// @ts-expect-error 绑定文件由 wails3 生成，首次运行前 IDE 会报找不到模块，属于正常现象
import { HTTPService, WSService, StorageService } from '../../bindings/voltra/services'

export { HTTPService, WSService, StorageService }

// 前端事件监听同样依赖 wails 运行时注入的全局对象，来自官方 @wailsio/runtime 包
// 用于监听 Go 侧 WSService 主动推送的 ws:message / ws:status 事件
export { Events } from '@wailsio/runtime'
