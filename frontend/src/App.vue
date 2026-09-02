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
import SaveToDialog from './components/tree/SaveToDialog.vue'
import Toast from './components/common/Toast.vue'
import { startWsBridge } from './lib/ws-bridge'
import { bootstrap } from './lib/persist'
import { initZoomKeys } from './lib/zoom'
import { sendRequest, isSending } from './lib/send'
import EnvPage from './components/env/EnvPage.vue'
import { tabs, activeTab, responses, saveToTabId, doSaveTo } from './stores/tabs'
import { uiState, setSplitRatio, varPage } from './stores/ui-state'
import type { HTTPResponseModel, ID } from './types/models'

onMounted(() => {
  startWsBridge()
  initZoomKeys()
  void bootstrap()
})

// ---- 编辑区 ----
const editorArea = ref<HTMLElement | null>(null)

const activeResponse = computed<HTTPResponseModel | null>(
  () => (tabs.activeTabId ? (responses[tabs.activeTabId] ?? null) : null),
)

// 当前标签是否正在请求（响应区显示"请求中"loading，避免用户以为卡死）
const activeSending = computed(() => (tabs.activeTabId ? isSending(tabs.activeTabId) : false))

// "保存到集合"对话框（未保存标签：Cmd+S / 保存按钮 / 标签右键"保存" 共用，见 tabs.saveTab）
const saveToTabName = computed(() => tabs.tabs.find((t) => t.tabId === saveToTabId.value)?.request.name ?? '')
function onSaveToConfirm(name: string, targetId: ID) {
  if (saveToTabId.value) doSaveTo(saveToTabId.value, name, targetId)
}

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
          <!-- 变量/环境编辑整页（侧栏按钮打开）；点任意请求标签即 closeVarPage 回到请求视图 -->
          <EnvPage v-if="varPage.open" />
          <template v-else-if="activeTab && activeTab.request.protocol === 'http'">
            <div class="pane req-pane" :style="{ height: uiState.splitRatio * 100 + '%' }">
              <RequestEditor :tab="activeTab" />
            </div>
            <Splitter axis="y" @resize="onSplit" />
            <div class="pane resp-pane">
              <ResponseViewer :response="activeResponse" :sending="activeSending" @retry="onRetry" />
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
    <SaveToDialog v-if="saveToTabId" :name="saveToTabName" @save="onSaveToConfirm" @close="saveToTabId = null" />
    <Toast />
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
