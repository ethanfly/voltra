<script setup lang="ts">
// 顶栏：Logo · 项目下拉 · 环境下拉 · 主题 · 设置 · 窗口控制（最小化/最大化/关闭）
// 无边框窗口：整条顶栏是可拖拽区（--wails-draggable），双键点击切换最大化；
// 内部所有按钮/输入框显式 no-drag，避免按下按钮时拖动窗口
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Zap, ChevronDown, Plus, Trash2, Settings, Sun, Moon, Monitor, Layers, Minus, Square, Copy, X } from 'lucide-vue-next'
import { Window, Events } from '@wailsio/runtime'
import Dropdown from '../common/Dropdown.vue'
import Modal from '../common/Modal.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import {
  workspace,
  currentProject,
  addProject,
  removeProject,
  setCurrentProject,
  findRequest,
} from '../../stores/workspace'
import { env, currentEnv, setCurrentEnv } from '../../stores/env'
import { tabs } from '../../stores/tabs'
import { settings, setSettings } from '../../stores/settings'
import { activePanel } from '../../stores/ui-state'
import { flushAll } from '../../lib/persist'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())

// 新建项目
const showNewProject = ref(false)
const newProjectName = ref('')
function confirmNewProject() {
  const name = newProjectName.value.trim()
  if (!name) return
  const p = addProject(name)
  setCurrentProject(p.id)
  showNewProject.value = false
  newProjectName.value = ''
}

// 删除当前项目
const confirmDeleteProject = ref(false)
function doDeleteProject() {
  const p = currentProject.value
  confirmDeleteProject.value = false
  if (!p) return
  // 关闭属于该项目、且已不在树中的标签（未保存的标签保留）
  for (const tab of [...tabs.tabs]) {
    const inTree = findRequest(tab.request.id)
    if (inTree && inTree.project.id === p.id) {
      const idx = tabs.tabs.indexOf(tab)
      tabs.tabs.splice(idx, 1)
      if (tabs.activeTabId === tab.tabId) {
        tabs.activeTabId = tabs.tabs[0]?.tabId ?? null
      }
    }
  }
  env.currentEnvId = null
  removeProject(p.id)
}

const themeOptions = [
  { value: 'light', label: L.value.titleBar.themeLight, icon: Sun },
  { value: 'dark', label: L.value.titleBar.themeDark, icon: Moon },
  { value: 'system', label: L.value.titleBar.themeSystem, icon: Monitor },
]
const themeIcon = computed(() => {
  const map: Record<string, typeof Sun> = { light: Sun, dark: Moon, system: Monitor }
  return map[currentTheme.value] ?? Monitor
})
const currentTheme = ref<'light' | 'dark' | 'system'>('system')
watch(() => settings.theme, (v) => (currentTheme.value = v), { immediate: true })

function onThemeChange(value: string) {
  setSettings({ theme: value as 'light' | 'dark' | 'system' })
}

const projectName = computed(() => currentProject.value?.name ?? L.value.titleBar.noProject)

// ---------- 窗口控制（frameless 自绘） ----------
const maximised = ref(false)
const unsubs: Array<() => void> = []
onMounted(() => {
  unsubs.push(
    Events.On('common:WindowMaximise', () => (maximised.value = true)),
    Events.On('common:WindowUnMaximise', () => (maximised.value = false)),
  )
  void Window.IsMaximised().then((v) => (maximised.value = !!v)).catch(() => {})
})
onBeforeUnmount(() => unsubs.forEach((off) => off()))

function onMinimise() {
  void Window.Minimise()
}
function onToggleMaximise() {
  void Window.ToggleMaximise()
}
async function onClose() {
  // 关闭前把防抖中的脏数据立即落盘，避免丢最近 500ms 的编辑
  try {
    await flushAll()
  } finally {
    void Window.Close()
  }
}
</script>

<template>
  <header class="titlebar">
    <div class="logo">
      <Zap :size="15" />
      <span>{{ L.app.name }}</span>
    </div>

    <!-- 项目下拉 -->
    <Dropdown>
      <template #trigger="{ open }">
        <button :class="['tb-select', { open }]">
          <span class="tb-select-label" :title="projectName">{{ projectName }}</span>
          <ChevronDown :size="13" />
        </button>
      </template>
      <template #default="{ close }">
        <div class="menu-item" v-if="workspace.projects.length === 0">{{ L.titleBar.noProject }}</div>
        <button
          v-for="p in workspace.projects"
          :key="p.id"
          :class="['menu-item', 'menu-btn', { active: p.id === workspace.currentProjectId }]"
          @click="setCurrentProject(p.id); close()"
        >
          {{ p.name }}
        </button>
        <div class="menu-sep"></div>
        <button class="menu-item menu-btn" @click="showNewProject = true; close()">
          <Plus :size="13" /> {{ L.dialog.projectNew }}
        </button>
        <button
          v-if="currentProject"
          class="menu-item menu-btn danger"
          @click="confirmDeleteProject = true; close()"
        >
          <Trash2 :size="13" /> {{ L.common.delete }}
        </button>
      </template>
    </Dropdown>

    <!-- 环境下拉 -->
    <Dropdown>
      <template #trigger="{ open }">
        <button :class="['tb-select', 'tb-select-env', { open }]">
          <Layers :size="13" />
          <span class="tb-select-label">{{ currentEnv?.name ?? L.titleBar.envNone }}</span>
          <ChevronDown :size="13" />
        </button>
      </template>
      <template #default="{ close }">
        <button
          :class="['menu-item', 'menu-btn', { active: env.currentEnvId === null }]"
          @click="setCurrentEnv(null); close()"
        >
          {{ L.titleBar.envNone }}
        </button>
        <template v-if="currentProject">
          <button
            v-for="e in currentProject.environments"
            :key="e.id"
            :class="['menu-item', 'menu-btn', { active: e.id === env.currentEnvId }]"
            @click="setCurrentEnv(e.id); close()"
          >
            {{ e.name }}
          </button>
          <div class="menu-sep"></div>
          <button
            class="menu-item menu-btn"
            @click="activePanel = 'environments'; close()"
          >
            {{ L.env.empty }} → {{ L.common.open }}
          </button>
        </template>
      </template>
    </Dropdown>

    <div class="spacer"></div>

    <!-- 主题 -->
    <Dropdown>
      <template #trigger="{ open }">
        <button :class="['tb-select', 'tb-select-theme', { open }]">
          <component :is="themeIcon" :size="14" />
          <ChevronDown :size="13" />
        </button>
      </template>
      <template #default="{ close }">
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          :class="['menu-item', 'menu-btn', { active: currentTheme === opt.value }]"
          @click="onThemeChange(opt.value); close()"
        >
          <component :is="opt.icon" :size="13" /> {{ opt.label }}
        </button>
      </template>
    </Dropdown>

    <button class="icon-btn" :title="L.titleBar.settings" @click="activePanel = 'settings'">
      <Settings :size="15" />
    </button>

    <!-- 窗口控制：frameless 窗口自绘的最小化 / 最大化(还原) / 关闭 -->
    <div class="win-ctrls">
      <button
        class="win-btn"
        style="--wails-non-client-region: minimize"
        :title="L.window.minimise"
        @click="onMinimise"
      >
        <Minus :size="13" />
      </button>
      <button
        class="win-btn"
        style="--wails-non-client-region: maximize"
        :title="maximised ? L.window.restore : L.window.maximise"
        @click="onToggleMaximise"
      >
        <Copy v-if="maximised" :size="12" />
        <Square v-else :size="12" />
      </button>
      <button
        class="win-btn win-close"
        style="--wails-non-client-region: close"
        :title="L.window.close"
        @click="onClose"
      >
        <X :size="13" />
      </button>
    </div>

    <!-- 新建项目对话框 -->
    <Modal v-if="showNewProject" :title="L.dialog.projectNew" @close="showNewProject = false">
      <input
        class="input"
        v-model="newProjectName"
        :placeholder="L.dialog.projectNewPlaceholder"
        autofocus
        @keyup.enter="confirmNewProject"
        style="width: 100%"
      />
      <template #footer>
        <button class="btn" @click="showNewProject = false">{{ L.common.cancel }}</button>
        <button class="btn btn-primary" :disabled="!newProjectName.trim()" @click="confirmNewProject">
          {{ L.common.confirm }}
        </button>
      </template>
    </Modal>

    <ConfirmDialog
      v-if="confirmDeleteProject"
      :title="L.common.confirmDelete"
      :message="L.dialog.projectDeleteConfirm"
      :danger="true"
      @confirm="doDeleteProject"
      @cancel="confirmDeleteProject = false"
    />
  </header>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
  /* frameless 窗口：顶栏空白处可拖动窗口（Wails 原生 drag 通道） */
  --wails-draggable: drag;
}
/* 拖拽属性会继承——顶栏内所有可交互元素必须显式排除，否则点按钮会拖窗口 */
.titlebar button,
.titlebar input {
  --wails-draggable: no-drag;
}
.logo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
  color: var(--brand);
  margin-right: 8px;
  user-select: none;
}
.tb-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-sunken);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--ease);
  max-width: 220px;
}
.tb-select:hover,
.tb-select.open {
  border-color: var(--border-strong);
  background: var(--bg-hover);
}
.tb-select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}
.spacer {
  flex: 1;
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
  white-space: nowrap;
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
.menu-btn.active {
  color: var(--brand);
  background: var(--brand-weak);
}
.menu-btn.danger:hover {
  color: var(--error);
  background: var(--error-weak);
}
.menu-sep {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
.win-ctrls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
}
.win-btn {
  width: 30px;
  height: 24px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: all var(--ease);
}
.win-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.win-close:hover {
  background: var(--error);
  color: #fff;
}
</style>
