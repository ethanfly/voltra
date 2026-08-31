// ws 事件桥：全局订阅一次 ws:message / ws:status，按 connId 分发到对应标签的
// wsLogs / wsStatuses（Go 侧多连接并发，前端按 connId 过滤）。
// 每标签日志封顶 MAX_LOG 条，防止长连接撑爆内存
import { Events } from '../api/backend'
import { wsConnIds, wsLogs, wsStatuses, type WsLogItem } from '../stores/tabs'
import type { ID, WSMessageEvent, WSStatusEvent } from '../types/models'

const MAX_LOG = 2000

function tabIdOf(connId: string): ID | null {
  for (const [tabId, cid] of Object.entries(wsConnIds)) {
    if (cid === connId) return tabId
  }
  return null
}

function pushLog(tabId: ID, item: WsLogItem) {
  const log = wsLogs[tabId] ?? (wsLogs[tabId] = [])
  log.push(item)
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG)
}

let started = false
export function startWsBridge() {
  if (started) return
  started = true
  Events.On('ws:message', (evt: { data: WSMessageEvent }) => {
    const d = evt.data
    const tabId = tabIdOf(d.connId)
    if (!tabId) return
    pushLog(tabId, { kind: 'msg', msg: d })
  })
  Events.On('ws:status', (evt: { data: WSStatusEvent }) => {
    const d = evt.data
    const tabId = tabIdOf(d.connId)
    if (!tabId) return
    wsStatuses[tabId] = d.status
    pushLog(tabId, { kind: 'sys', status: d.status, detail: d.detail, timestamp: Date.now() })
    if (d.status === 'closed') {
      delete wsConnIds[tabId]
    }
  })
}
