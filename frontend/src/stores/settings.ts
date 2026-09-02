// 应用设置 store（settings.json）
import { reactive } from 'vue'
import type { AppSettings } from '../types/models'
import { defaultSettings } from '../types/models'
import { scheduleSave } from '../lib/persist'

export const settings = reactive<AppSettings>({ ...defaultSettings() })

/** 应用版本（与 build/config.yml 保持一致） */
export const APP_VERSION = '0.2.0'

let themeWatcherStarted = false

/** 根据设置应用 data-theme 到 <html>（system 跟随系统偏好） */
export function applyTheme() {
  let t = settings.theme
  if (t === 'system') {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.setAttribute('data-theme', t)
}

/** 监听系统主题变化（theme=system 时生效） */
export function initThemeWatcher() {
  if (themeWatcherStarted) return
  themeWatcherStarted = true
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'system') applyTheme()
  })
}

export function setSettings(patch: Partial<AppSettings>) {
  Object.assign(settings, patch)
  if ('theme' in patch) applyTheme()
  scheduleSave('settings')
}
