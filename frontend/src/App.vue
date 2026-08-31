<script setup lang="ts">
// 六区外壳：TitleBar / ActivityBar / Sidebar / TabStrip / 编辑区(请求+响应) / StatusBar
import { onMounted, ref, computed } from 'vue'
import TitleBar from './components/shell/TitleBar.vue'
import ActivityBar from './components/shell/ActivityBar.vue'
import Sidebar from './components/shell/Sidebar.vue'
import TabStrip from './components/shell/TabStrip.vue'
import StatusBar from './components/shell/StatusBar.vue'
import Splitter from './components/common/Splitter.vue'
import EmptyState from './components/common/EmptyState.vue'
import RequestEditor from './components/request/RequestEditor.vue'
import ResponseViewer from './components/response/ResponseViewer.vue'
import WsEditor from './components/ws/WsEditor.vue'
import WsTimeline from './components/ws/WsTimeline.vue'
import WsComposer from './components/ws/WsComposer.vue'
import CodeGenDrawer from './components/codegen/CodeGenDrawer.vue'
import { startWsBridge } from './lib/ws-bridge'
import { bootstrap } from './lib/persist'
import { sendRequest } from './lib/send'
import { tabs, activeTab, responses } from './stores/tabs'
import { uiState, setSplitRatio } from './stores/ui-state'
import type { HTTPResponseModel } from './types/models'

onMounted(() => {
  startWsBridge()
  void bootstrap()
})

// ---- 编辑区 ----
const editorArea = ref<HTMLElement | null>(null)

const activeResponse = computed<HTTPResponseModel | null>(
  () => (tabs.activeTabId ? (responses[tabs.activeTabId] ?? null) : null),
)

/** 错误卡"重试"：重发当前标签 */
async function onRetry() {
  const id = tabs.activeTabId
  if (!id) return
  try {
    const resp = await sendRequest(id)
    responses[id] = resp
  } catch (e) {
    console.error('retry failed', e)
  }
}

function onSplit(delta: number) {
  const h = editorArea.value?.clientHeight
  if (!h) return
  setSplitRatio(uiState.splitRatio + delta / h)
}
</script>

<template>
  <div class="app">
    <TitleBar />
    <div class="app-body">
      <ActivityBar />
      <Sidebar />
      <div class="main-col">
        <TabStrip />
        <div ref="editorArea" class="editor-area">
          <template v-if="activeTab && activeTab.request.protocol === 'http'">
            <div class="pane req-pane" :style="{ height: uiState.splitRatio * 100 + '%' }">
              <RequestEditor :tab="activeTab" />
            </div>
            <Splitter axis="y" @resize="onSplit" />
            <div class="pane resp-pane">
              <ResponseViewer :response="activeResponse" @retry="onRetry" />
            </div>
          </template>
          <div v-else-if="activeTab && activeTab.request.protocol === 'ws'" class="pane ws-pane">
            <WsEditor :tab="activeTab" />
            <WsTimeline :tab="activeTab" />
            <WsComposer :tab="activeTab" />
          </div>
          <EmptyState
            v-else
            title="还没有打开的标签"
            hint="点击上方标签栏的 + 新建一个 HTTP 请求或 WebSocket 接口"
          />
        </div>
      </div>
    </div>
    <StatusBar />
    <CodeGenDrawer />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.main-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.pane {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.req-pane {
  overflow: hidden;
}
.resp-pane {
  flex: 1;
}
.resp-pane :deep(.rv) {
  padding: 0 12px 10px;
}
.ws-pane {
  flex: 1;
  overflow: hidden;
}
</style>
