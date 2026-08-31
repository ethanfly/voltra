// 与 Go 侧 services 包的结构体一一对应。
// 基础类型（KVPair/FormField/GraphQLBody/HTTPResponse）复用 wails3 生成的绑定；
// 应用层模型在此声明（请求对象在应用内数组恒为非空，发送时直接透传给绑定）。
// 注意：阶段 2 会用 PRD §7 的完整数据模型（Project/Environment/History 等）替换本文件。
import type {
  KVPair,
  FormField,
  GraphQLBody,
  HTTPResponse,
  WSConnectOptions,
} from '../../bindings/voltra/services'

export type { KVPair, FormField, GraphQLBody, WSConnectOptions }
export type HTTPResponseModel = HTTPResponse

// 应用层请求模型：比绑定层 HTTPRequest 收紧了数组字段（应用内恒为非空）
export interface HTTPRequestModel {
  method: string
  url: string
  headers: KVPair[]
  query: KVPair[]
  body: string
  bodyType: string // none | form-data | urlencoded | raw | binary | graphql
  rawLang: string // json | xml | text | html
  urlEncoded: KVPair[]
  formData: FormField[]
  binaryPath: string
  graphql: GraphQLBody | null
  timeoutMs: number // 0 → 30000
  followRedirects: boolean
  maxRedirects: number // 0 → 10
  insecureSkipTlsVerify: boolean
  sendCookies: boolean
}

// Go 侧 WSService 通过 Events 推送的事件负载（生成器不产出：未出现在方法签名中），
// 字段名与 Go 侧 WSMessageEvent / WSStatusEvent 的 json tag 一致
export interface WSMessageEvent {
  connId: string
  message: string // 文本原样；二进制帧为 base64
  isBinary: boolean
  isBase64: boolean
  direction: 'in' | 'out'
  isHeartbeat: boolean
  timestamp: number
}

export interface WSStatusEvent {
  connId: string
  status: string // connected | reconnecting | closed | error
  detail?: string
}

export function emptyRequest(): HTTPRequestModel {
  return {
    method: 'GET',
    url: '',
    headers: [{ key: '', value: '', enabled: true }],
    query: [{ key: '', value: '', enabled: true }],
    body: '',
    bodyType: 'none',
    rawLang: 'text',
    urlEncoded: [{ key: '', value: '', enabled: true }],
    formData: [],
    binaryPath: '',
    graphql: null,
    timeoutMs: 30000,
    followRedirects: true,
    maxRedirects: 10,
    insecureSkipTlsVerify: false,
    sendCookies: false,
  }
}
