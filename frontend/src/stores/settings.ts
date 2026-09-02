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
  // 字体大小：组件普遍用 px 写死，直接改 font-size 不生效；改为换算成缩放系数
  // （以默认 13px 为基准），乘进 #app 的 zoom（与 Cmd+= 页面缩放 --app-zoom 相乘），
  // 让字号与布局同比变化（见 tokens.css 的 #app { zoom: calc(...) }）
  document.documentElement.style.setProperty('--font-zoom', String(settings.fontSize / 13))
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
  if ('theme' in patch || 'fontSize' in patch) applyTheme()
  scheduleSave('settings')
}
