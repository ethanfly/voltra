<template>
  <div class="ws-panel">
    <div class="ws-bar">
      <input
        class="url-input"
        type="text"
        v-model="url"
        placeholder="ws://echo.websocket.events"
        :disabled="!!connId"
      />
      <button v-if="!connId" class="connect-btn" @click="onConnect" :disabled="connecting">
        {{ connecting ? '连接中...' : '连接' }}
      </button>
      <button v-else class="disconnect-btn" @click="onDisconnect">断开</button>
    </div>

    <div class="ws-status" v-if="connId">
      <span class="dot"></span> 已连接（连接 ID: {{ connId.slice(0, 8) }}）
    </div>

    <div class="ws-log">
      <div v-for="(m, idx) in log" :key="idx" :class="['log-row', m.dir]">
        <span class="log-dir">{{ m.dir === 'in' ? '收到' : m.dir === 'out' ? '发送' : '系统' }}</span>
        <span class="log-text">{{ m.text }}</span>
      </div>
      <div v-if="log.length === 0" class="log-empty">连接后，收发的消息会显示在这里</div>
    </div>

    <div class="ws-send-bar">
      <input
        class="msg-input"
        type="text"
        v-model="messageText"
        placeholder="输入要发送的消息"
        :disabled="!connId"
        @keyup.enter="onSendMessage"
      />
      <button class="send-btn" :disabled="!connId" @click="onSendMessage">发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { WSService, Events } from '../api/backend'
import type { WSMessageEvent, WSStatusEvent } from '../types/models'

const url = ref('')
const connId = ref('')
const connecting = ref(false)
const messageText = ref('')
const log = ref<{ dir: 'in' | 'out' | 'sys'; text: string }[]>([])

let offMessage: (() => void) | undefined
let offStatus: (() => void) | undefined

onMounted(() => {
  // 监听 Go 侧 WSService 主动推送的消息 / 状态事件
  offMessage = Events.On('ws:message', (evt: { data: WSMessageEvent }) => {
    const data = evt.data
    if (data.connId === connId.value) {
      log.value.push({ dir: 'in', text: data.message })
    }
  })
  offStatus = Events.On('ws:status', (evt: { data: WSStatusEvent }) => {
    const data = evt.data
    if (data.connId === connId.value) {
      log.value.push({ dir: 'sys', text: `[${data.status}] ${data.detail ?? ''}` })
      if (data.status === 'closed') {
        connId.value = ''
      }
    }
  })
})

onUnmounted(() => {
  offMessage?.()
  offStatus?.()
})

async function onConnect() {
  if (!url.value) return
  connecting.value = true
  try {
    // 对应 Go 侧 WSService.Connect 方法
    const id: string = await WSService.Connect(url.value, [])
    connId.value = id
    log.value.push({ dir: 'sys', text: '连接已建立' })
  } catch (err) {
    log.value.push({ dir: 'sys', text: `连接失败: ${String(err)}` })
  } finally {
    connecting.value = false
  }
}

async function onDisconnect() {
  if (!connId.value) return
  await WSService.Close(connId.value)
  connId.value = ''
}

async function onSendMessage() {
  if (!connId.value || !messageText.value) return
  await WSService.Send(connId.value, messageText.value)
  log.value.push({ dir: 'out', text: messageText.value })
  messageText.value = ''
}
</script>

<style scoped>
.ws-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ws-bar {
  display: flex;
  gap: 8px;
}
.url-input,
.msg-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 14px;
}
.connect-btn,
.send-btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  background: #534ab7;
  color: white;
  font-weight: 500;
  cursor: pointer;
}
.disconnect-btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  background: #a32d2d;
  color: white;
  font-weight: 500;
  cursor: pointer;
}
.connect-btn:disabled,
.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ws-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #3b6d11;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #639922;
}
.ws-log {
  background: #f8f8f6;
  border-radius: 6px;
  padding: 12px;
  min-height: 220px;
  max-height: 360px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: 'SF Mono', Consolas, monospace;
  font-size: 13px;
}
.log-empty {
  color: #999;
  text-align: center;
  padding: 24px 0;
}
.log-row {
  display: flex;
  gap: 8px;
}
.log-row.in .log-dir {
  color: #185fa5;
}
.log-row.out .log-dir {
  color: #3b6d11;
}
.log-row.sys .log-dir {
  color: #888780;
}
.log-dir {
  min-width: 40px;
  font-weight: 500;
}
.log-text {
  word-break: break-all;
}
.ws-send-bar {
  display: flex;
  gap: 8px;
}
</style>
