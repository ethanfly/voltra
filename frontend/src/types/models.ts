// ============================================================
// 数据模型（PRD §7 单一事实来源）+ 应用层辅助类型
// 前端维护、落盘为本地 JSON；Go 侧 StorageService 只存取整段 JSON 文本
// ============================================================

// 基础类型直接复用 wails3 生成的绑定（字段名 = Go json tag）
export type {
  KVPair,
  FormField,
  GraphQLBody,
  HTTPResponse,
  DownloadResult,
  WSConnectOptions,
  AuthDigest,
  AuthOAuth1,
  AuthAWSV4,
} from '../../bindings/github.com/ramboLiang/voltra/services'
import type {
  KVPair,
  FormField,
  GraphQLBody,
  HTTPResponse,
} from '../../bindings/github.com/ramboLiang/voltra/services'

/** 应用版本（与 build/config.yml、Go 侧 defaultUserAgent 常量保持一致；升级时三处同改） */
export const APP_VERSION = '0.2.0'

export type ID = string // uuid
export type HTTPResponseModel = HTTPResponse

// ---------- 项目 / 树 ----------

export interface Project {
  id: ID
  name: string
  collections: Collection[]
  environments: Environment[]
  variables: Variable[] // 项目级变量
  createdAt: number
  updatedAt: number
}

export interface Collection {
  id: ID
  name: string
  description?: string
  auth?: AuthConfig // 子节点默认继承
  headers?: KVPair[] // 公共 header
  items: TreeNode[]
}

export type TreeNode = Folder | Request

export interface Folder {
  kind: 'folder'
  id: ID
  name: string
  auth?: AuthConfig
  headers?: KVPair[]
  items: TreeNode[]
}

export interface Request {
  kind: 'request'
  id: ID
  name: string
  protocol: 'http' | 'ws'
  method: string // http 用；ws 忽略
  url: string
  params: KVPair[] // query
  headers: KVPair[]
  body: RequestBody
  auth: AuthConfig
  settings: RequestSettings
  preRequestScript?: string
  testScript?: string
  examples?: Example[] // P2，v0.2 只定义类型不做 UI
  updatedAt: number
}

export interface RequestBody {
  type: 'none' | 'form-data' | 'urlencoded' | 'raw' | 'binary' | 'graphql'
  raw?: string
  rawLang?: 'json' | 'xml' | 'text' | 'html'
  formData?: FormField[]
  urlencoded?: KVPair[]
  binaryPath?: string
  graphql?: GraphQLBody
}

export interface RequestSettings {
  timeoutMs: number
  followRedirects: boolean
  maxRedirects: number
  insecureSkipTlsVerify: boolean
  sendCookies: boolean
}

export type AuthType =
  | 'none'
  | 'inherit'
  | 'bearer'
  | 'basic'
  | 'apikey'
  | 'jwt'
  | 'digest'
  | 'oauth1'
  | 'oauth2'
  | 'awsv4'

export interface AuthConfig {
  type: AuthType
  bearer?: { token: string }
  basic?: { username: string; password: string }
  apikey?: { key: string; value: string; in: 'header' | 'query' }
  jwt?: { token: string } // Bearer 注入 + 前端 payload 解码展示
  digest?: { username: string; password: string; realm?: string } // Go 侧 401 挑战-应答
  oauth1?: {
    consumerKey: string
    consumerSecret: string
    token: string
    tokenSecret: string
    signatureMethod: 'HMAC-SHA1' | 'HMAC-SHA256' | 'PLAINTEXT' // 空/缺省 → HMAC-SHA1
    realm?: string
  } // Go 侧运行时签名（RFC 5849）
  oauth2?: {
    accessToken: string // 非空 → 前端 Bearer 注入；为空且 grant≠manual 时用 [获取新 Token] 拉取
    grant: 'manual' | 'client_credentials' | 'password'
    tokenUrl: string
    clientId: string
    clientSecret: string
    username: string // 仅 password grant
    password: string // 仅 password grant
    scope: string
  }
  awsv4?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string; service: string } // Go 侧 SigV4
}

export interface Environment {
  id: ID
  name: string
  variables: Variable[]
}

export interface Variable {
  key: string
  initialValue: string
  currentValue: string
  enabled: boolean
  secret?: boolean
}

export interface Example {
  id: ID
  name: string
  request: Request
  response?: { statusCode: number; headers: KVPair[]; body: string }
}

// ---------- 历史 ----------

export interface HistoryEntry {
  id: ID
  requestSnapshot: Request // 完整快照，便于还原
  responseSummary: { statusCode: number; durationMs: number; sizeBytes: number }
  sentAt: number
}

// ---------- 设置 / UI 状态 ----------

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: 'zh' | 'en'
  defaultTimeoutMs: number
  autoCompleteScheme: boolean // SET-4：是否自动补全 URL scheme
  defaultScheme: 'http' | 'https'
  historyLimit: number // HIS-5，默认 500
  importLimitMB: number // 导入文件上限（MB），默认 30；越大越可能占用更多内存
  hideAutoHeaders: boolean // 是否隐藏 Headers 页底部"自动生成的请求头"灰色预览区
}

export interface WsSnippet {
  id: ID
  name: string
  content: string
}

export interface OpenTab {
  tabId: ID
  request: Request // ws 标签同样用 Request（protocol: 'ws'）
}

export interface UIState {
  currentProjectId: ID | null
  openTabs: OpenTab[]
  activeTabId: ID | null
  sidebarWidth: number // 240–480
  splitRatio: number // 请求区 / 响应区 分栏比例 0–1
  expandedNodeIds: ID[]
  wsSnippets: WsSnippet[]
  varPageOpen?: boolean // 变量/环境编辑整页是否打开（可选，旧档无此字段）
}

// ---------- 工厂函数 ----------

export function uid(): ID {
  return crypto.randomUUID()
}

export function defaultAuth(): AuthConfig {
  return { type: 'none' }
}

/**
 * 新建请求的默认请求头（可编辑的普通行，用户可删改）。
 * User-Agent 与 Go 侧 defaultUserAgent 常量交叉锁定：两侧测试各自钉死 "Voltra/0.2.0"。
 * cURL/Postman 导入显式传 headers 经 ...partial 覆盖，不会带上这批默认行。
 */
export function defaultHeaders(): KVPair[] {
  return [
    { key: 'User-Agent', value: `Voltra/${APP_VERSION}`, enabled: true },
    { key: 'Accept', value: '*/*', enabled: true },
    { key: 'Accept-Language', value: 'zh-CN', enabled: true },
    { key: 'Cache-Control', value: 'no-cache', enabled: true },
  ]
}

export function newRequestSettings(defaultTimeoutMs = 30000): RequestSettings {
  return {
    timeoutMs: defaultTimeoutMs,
    followRedirects: true,
    maxRedirects: 10,
    insecureSkipTlsVerify: false,
    sendCookies: false,
  }
}

export function newRequest(partial?: Partial<Request>): Request {
  return {
    kind: 'request',
    id: uid(),
    name: '新建请求',
    protocol: 'http',
    method: 'GET',
    url: '',
    params: [],
    headers: defaultHeaders(),
    body: { type: 'none' },
    auth: defaultAuth(),
    settings: newRequestSettings(),
    updatedAt: Date.now(),
    ...partial,
  }
}

export function newFolder(partial?: Partial<Folder>): Folder {
  return {
    kind: 'folder',
    id: uid(),
    name: '新建文件夹',
    items: [],
    ...partial,
  }
}

export function newCollection(partial?: Partial<Collection>): Collection {
  return {
    id: uid(),
    name: '新建集合',
    items: [],
    ...partial,
  }
}

export function newProject(partial?: Partial<Project>): Project {
  const now = Date.now()
  return {
    id: uid(),
    name: '新建项目',
    collections: [],
    environments: [],
    variables: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function defaultSettings(): AppSettings {
  return {
    theme: 'system',
    language: 'zh',
    defaultTimeoutMs: 30000,
    autoCompleteScheme: true,
    defaultScheme: 'https',
    historyLimit: 500,
    importLimitMB: 30,
    hideAutoHeaders: false,
  }
}

export function defaultUIState(): UIState {
  return {
    currentProjectId: null,
    openTabs: [],
    activeTabId: null,
    sidebarWidth: 280,
    splitRatio: 0.5,
    expandedNodeIds: [],
    wsSnippets: [],
    varPageOpen: false,
  }
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

/**
 * 模型数据深拷贝（请求快照 / 历史还原 / 另存为新节点用）。
 * 不能用 structuredClone：它对 Vue reactive 代理会抛 DataCloneError
 * （模型本身是纯 JSON 结构——落盘即 JSON.stringify——JSON 往返最稳）
 */
export function cloneDeep<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}
