<script setup lang="ts">
// 标签栏：方法色标 / WS 标、dirty 圆点、中键关闭、DnD 排序、+ 新建
import { ref, computed } from 'vue'
import { Plus, X, Globe, Wifi } from 'lucide-vue-next'
import Dropdown from '../common/Dropdown.vue'
import ContextMenu, { type MenuItem } from '../common/ContextMenu.vue'
import {
  tabs,
  newEmptyRequest,
  setActiveTab,
  closeTab,
  moveTab,
  saveTab,
  closeTabsToLeft,
  closeTabsToRight,
  closeOtherTabs,
} from '../../stores/tabs'
import type { LiveTab } from '../../stores/tabs'
import type { ID } from '../../types/models'
import { buildCodegenCtx } from '../../lib/codegen/context'
import { generate } from '../../lib/codegen'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())

const METHOD_LABEL: Record<string, string> = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DEL',
  HEAD: 'HEAD',
  OPTIONS: 'OPT',
}

function methodClass(t: LiveTab): string {
  if (t.request.protocol === 'ws') return 'm-WS'
  const m = (t.request.method || 'GET').toUpperCase()
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m) ? 'm-' + m : 'm-UNKNOWN'
}

function tabLabel(t: LiveTab): string {
  return t.request.name || (t.request.protocol === 'ws' ? 'WebSocket' : '未命名请求')
}

// 拖拽排序
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)
function onDragStart(i: number) {
  dragIndex.value = i
}
function onDrop(i: number) {
  const from = dragIndex.value
  dragIndex.value = null
  dropIndex.value = null
  if (from === null || from === i) return
  moveTab(from, i)
}

function openNew(kind: 'http' | 'ws') {
  const tab = newEmptyRequest(kind)
  setActiveTab(tab.tabId)
}

// ---------- 右键菜单（关闭当前/左/右/其他 · 保存 · 复制请求） ----------
const ctxMenu = ref<{ x: number; y: number; tabId: ID } | null>(null)

function onTabContext(t: LiveTab, e: MouseEvent) {
  setActiveTab(t.tabId) // 让"关闭当前/左/右/其他"以右键的这个标签为基准
  ctxMenu.value = { x: e.clientX, y: e.clientY, tabId: t.tabId }
}

const ctxItems = computed<MenuItem[]>(() => [
  { label: L.value.tabs.closeCurrent },
  { label: L.value.tabs.closeLeft },
  { label: L.value.tabs.closeRight },
  { label: L.value.tabs.closeOthers },
  { label: '', sep: true },
  { label: L.value.common.save },
  { label: L.value.tabs.copyRequest },
])

// 条目顺序固定：0 当前 / 1 左 / 2 右 / 3 其他 / 4 分隔 / 5 保存 / 6 复制
function onCtxSelect(_item: unknown, index: number) {
  const m = ctxMenu.value
  ctxMenu.value = null
  if (!m) return
  switch (index) {
    case 0: closeTab(m.tabId); break
    case 1: closeTabsToLeft(m.tabId); break
    case 2: closeTabsToRight(m.tabId); break
    case 3: closeOtherTabs(m.tabId); break
    case 5: saveTab(m.tabId); break
    case 6: void copyRequest(m.tabId); break
  }
}

/** 复制请求：HTTP → cURL（保留 {{变量}}）；WS → 连接 URL */
async function copyRequest(tabId: ID) {
  const t = tabs.tabs.find((x) => x.tabId === tabId)
  if (!t) return
  const text =
    t.request.protocol === 'ws' ? t.request.url : generate('shell', 'curl', buildCodegenCtx(t.request, false))
  try {
    await navigator.clipboard.writeText(text)
  } catch (e) {
    console.error('copy request failed', e)
  }
}
</script>

<template>
  <div class="tabstrip">
    <div class="tabs">
      <div
        v-for="(t, i) in tabs.tabs"
        :key="t.tabId"
        :class="[
          'tab',
          { active: t.tabId === tabs.activeTabId },
          { 'drop-target': dropIndex === i && dragIndex !== null && dragIndex !== i },
        ]"
        draggable="true"
        @dragstart="onDragStart(i)"
        @dragover.prevent="dropIndex = i"
        @dragleave="dropIndex === i && (dropIndex = null)"
        @drop.prevent="onDrop(i)"
        @dragend="dragIndex = null; dropIndex = null"
        @click="setActiveTab(t.tabId)"
        @auxclick.middle.prevent="closeTab(t.tabId)"
        @contextmenu.prevent="onTabContext(t, $event)"
      >
        <component :is="t.request.protocol === 'ws' ? Wifi : Globe" :size="12" class="tab-ico" />
        <span :class="['tab-method', methodClass(t)]">
          {{ t.request.protocol === 'ws' ? 'WS' : METHOD_LABEL[t.request.method || 'GET'] ?? t.request.method }}
        </span>
        <span class="tab-title" :title="tabLabel(t)">{{ tabLabel(t) }}</span>
        <span v-if="t.dirty" class="tab-dirty"></span>
        <button class="tab-close" @click.stop="closeTab(t.tabId)">
          <X :size="11" />
        </button>
      </div>
    </div>
    <Dropdown>
      <template #trigger="{ open }">
        <button :class="['new-btn', { open }]">
          <Plus :size="13" />
        </button>
      </template>
      <template #default="{ close }">
        <button class="menu-item menu-btn" @click="openNew('http'); close()">
          <Globe :size="13" /> {{ L.dialog.newHttp }}
        </button>
        <button class="menu-item menu-btn" @click="openNew('ws'); close()">
          <Wifi :size="13" /> {{ L.dialog.newWs }}
        </button>
      </template>
    </Dropdown>

    <ContextMenu
      v-if="ctxMenu"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :items="ctxItems"
      @select="onCtxSelect"
      @close="ctxMenu = null"
    />
  </div>
</template>

<style scoped>
.tabstrip {
  height: var(--tabstrip-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
}
.tabs {
  flex: 1;
  display: flex;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px 0 12px;
  margin-right: 2px;
  border-radius: var(--radius);
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  font-size: 12px;
  color: var(--text-dim);
  transition: all var(--ease);
}
.tab:hover {
  background: var(--bg-hover);
}
.tab.active {
  background: var(--bg-active);
  color: var(--text);
  border-color: var(--border-strong);
}
.tab.drop-target {
  box-shadow: -2px 0 0 0 var(--brand);
}
.tab-ico {
  color: var(--text-faint);
  flex-shrink: 0;
}
.tab-method {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
.tab-title {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-dirty {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warn);
  flex-shrink: 0;
}
.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--ease);
}
.tab:hover .tab-close,
.tab.active .tab-close {
  opacity: 1;
}
.tab-close:hover {
  background: var(--border-strong);
  color: var(--text);
}
.new-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  margin-right: 6px;
}
.new-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-dim);
}
.menu-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.menu-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
</style>
