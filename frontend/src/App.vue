<script setup lang="ts">
// 六区外壳：TitleBar / ActivityBar / Sidebar / TabStrip / 编辑区(请求+响应) / StatusBar
import { onMounted, ref, watch, computed } from 'vue'
import TitleBar from './components/shell/TitleBar.vue'
import ActivityBar from './components/shell/ActivityBar.vue'
import Sidebar from './components/shell/Sidebar.vue'
import TabStrip from './components/shell/TabStrip.vue'
import StatusBar from './components/shell/StatusBar.vue'
import Splitter from './components/common/Splitter.vue'
import EmptyState from './components/common/EmptyState.vue'
import RequestPanel from './components/RequestPanel.vue'
import ResponsePanel from './components/ResponsePanel.vue'
import WSPanel from './components/WSPanel.vue'
import { bootstrap } from './lib/persist'
import { getBridge, flushBridge } from './lib/legacy-bridge'
import { tabs, activeRequest, activeTab, responses } from './stores/tabs'
import { uiState, setSplitRatio } from './stores/ui-state'
import type { HTTPResponseModel, LegacyHTTPRequest } from './types/models'

onMounted(() => {
  void bootstrap()
})

// ---- 编辑区（过渡：旧面板 + legacy 桥，阶段 5/6 替换为 RequestEditor/ResponseViewer） ----
const editorArea = ref<HTMLElement | null>(null)
const legacyReq = ref<LegacyHTTPRequest | null>(null)

watch(
  activeRequest,
  (r, old) => {
    if (old) flushBridge(old)
    legacyReq.value = r ? getBridge(r) : null
  },
  { immediate: true },
)

const activeResponse = computed<HTTPResponseModel | null>(
  () => (tabs.activeTabId ? (responses[tabs.activeTabId] ?? null) : null),
)

function onResp(resp: HTTPResponseModel) {
  const t = activeTab.value
  if (t) responses[t.tabId] = resp
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
          <template v-if="activeRequest && activeRequest.protocol === 'http' && legacyReq">
            <div class="pane req-pane" :style="{ height: uiState.splitRatio * 100 + '%' }">
              <RequestPanel :request="legacyReq" @response="onResp" />
            </div>
            <Splitter axis="y" @resize="onSplit" />
            <div class="pane resp-pane">
              <ResponsePanel :response="activeResponse" />
            </div>
          </template>
          <div v-else-if="activeRequest && activeRequest.protocol === 'ws'" class="pane ws-pane">
            <WSPanel />
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
  padding: 16px 20px;
  border-bottom: 0;
}
.resp-pane {
  flex: 1;
  padding: 16px 20px;
}
.ws-pane {
  flex: 1;
  padding: 16px 20px;
}
</style>
