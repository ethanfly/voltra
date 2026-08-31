// 与 Go 侧 services 包中的结构体一一对应，字段名使用 JSON tag（小驼峰）

export interface KVPair {
  key: string
  value: string
  enabled: boolean
}

export interface HTTPRequestModel {
  method: string
  url: string
  headers: KVPair[]
  query: KVPair[]
  body: string
  bodyType: 'none' | 'json' | 'form' | 'x-www-form-urlencoded' | 'raw' | 'binary'
  timeoutSeconds: number
  insecureSkipTlsVerify: boolean
}

export interface HTTPResponseModel {
  statusCode: number
  status: string
  headers: KVPair[]
  body: string
  sizeBytes: number
  durationMs: number
  error?: string
}

export interface WSMessageEvent {
  connId: string
  message: string
  isBinary: boolean
  timestamp: number
}

export interface WSStatusEvent {
  connId: string
  status: 'connected' | 'closed' | 'error'
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
    timeoutSeconds: 30,
    insecureSkipTlsVerify: false,
  }
}
