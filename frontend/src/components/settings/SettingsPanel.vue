<script setup lang="ts">
// 设置面板：主题 / 语言 / 默认超时 / 字号 / URL 协议补全 + 数据目录
import { computed } from 'vue'
import { FolderOpen, Download } from 'lucide-vue-next'
import { settings, setSettings } from '../../stores/settings'
import { StorageService } from '../../api/backend'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())

function onTimeoutInput(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  if (!Number.isNaN(v) && v > 0) setSettings({ defaultTimeoutMs: v })
}
function onFontSizeInput(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  if (!Number.isNaN(v) && v >= 11 && v <= 20) setSettings({ fontSize: v })
}
</script>

<template>
  <div class="sp">
    <div class="sp-sec">
      <label class="sp-label">{{ L.settings.theme }}</label>
      <select
        class="input sp-select"
        :value="settings.theme"
        @change="setSettings({ theme: ($event.target as HTMLSelectElement).value as 'light' | 'dark' | 'system' })"
      >
        <option value="light">{{ L.titleBar.themeLight }}</option>
        <option value="dark">{{ L.titleBar.themeDark }}</option>
        <option value="system">{{ L.titleBar.themeSystem }}</option>
      </select>
    </div>

    <div class="sp-sec">
      <label class="sp-label">{{ L.settings.language }}</label>
      <select class="input sp-select" :value="settings.language" @change="setSettings({ language: ($event.target as HTMLSelectElement).value as 'zh' | 'en' })">
        <option value="zh">中文</option>
        <option value="en" disabled>English（v0.3）</option>
      </select>
    </div>

    <div class="sp-sec">
      <label class="sp-label">{{ L.settings.defaultTimeout }}</label>
      <input
        class="input sp-select"
        type="number"
        :value="settings.defaultTimeoutMs"
        min="1"
        step="1000"
        @change="onTimeoutInput"
      />
    </div>

    <div class="sp-sec">
      <label class="sp-label">{{ L.settings.fontSize }}</label>
      <input
        class="input sp-select"
        type="number"
        :value="settings.fontSize"
        min="11"
        max="20"
        @change="onFontSizeInput"
      />
    </div>

    <div class="sp-sec sp-check-sec">
      <label class="sp-label">{{ L.settings.autoCompleteScheme }}</label>
      <label class="sp-check">
        <input type="checkbox" :checked="settings.autoCompleteScheme" @change="setSettings({ autoCompleteScheme: ($event.target as HTMLInputElement).checked })" />
      </label>
      <select
        class="input sp-select"
        :value="settings.defaultScheme"
        :disabled="!settings.autoCompleteScheme"
        @change="setSettings({ defaultScheme: ($event.target as HTMLSelectElement).value as 'http' | 'https' })"
      >
        <option value="https">https</option>
        <option value="http">http</option>
      </select>
    </div>

    <div class="sp-sec">
      <label class="sp-label">{{ L.settings.dataDir }}</label>
      <button class="btn sp-dir-btn" :title="L.settings.openDataDir" @click="void StorageService.OpenDataDir()">
        <FolderOpen :size="13" /> {{ L.settings.openDataDir }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sp {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 10px;
}
.sp-sec {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sp-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.sp-select {
  width: 100%;
  height: 28px;
  font-size: 12px;
}
.sp-check-sec {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sp-check-sec .sp-label {
  flex: 1;
}
.sp-check {
  display: inline-flex;
  align-items: center;
}
.sp-dir-btn {
  justify-content: flex-start;
  width: 100%;
}
</style>
