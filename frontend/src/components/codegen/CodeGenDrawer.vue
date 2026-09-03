<script setup lang="ts">
// 生成代码抽屉：左侧语言列表（图标 + 客户端数量）/ 右侧代码（行号 + 客户端选择）
// 「变量原样 / 当前环境真实值」顶部切换；对标 Postman Code 面板
import { computed, ref, watch } from 'vue'
import CodeEditor from '../common/CodeEditor.vue'
import Dropdown from '../common/Dropdown.vue'
import { Copy, Check, X, ChevronDown } from 'lucide-vue-next'
import { LANGS, generate } from '../../lib/codegen'
import { buildCodegenCtx } from '../../lib/codegen/context'
import { codegenOpen, codegenTargetId, closeCodegen } from '../../stores/ui-state'
import { findRequest } from '../../stores/workspace'
import { activeTab } from '../../stores/tabs'
import { t } from '../../locales/zh-CN'
import type { Request } from '../../types/models'

const L = computed(() => t())

const langId = ref('shell')
const clientId = ref('curl')
const resolved = ref(false) // false = 变量原样 {{token}}；true = 当前环境真实值

const request = computed<Request | null>(() => {
  if (codegenTargetId.value) {
    const loc = findRequest(codegenTargetId.value)
    if (loc) return loc.node
  }
  // 未保存的请求不在树里 → 回退到当前标签（同一对象）
  const tab = activeTab.value
  return tab && tab.request.protocol === 'http' ? tab.request : null
})

const code = computed(() => {
  if (!request.value) return ''
  return generate(langId.value, clientId.value, buildCodegenCtx(request.value, resolved.value))
})

const currentLang = computed(() => LANGS.find((l) => l.id === langId.value))
const currentClient = computed(() => currentLang.value?.clients.find((c) => c.id === clientId.value))

const cmLang = computed(() => (langId.value === 'js' || langId.value === 'node' ? 'javascript' : 'text'))

// 语言图标短标（品牌徽章）
const MONO: Record<string, string> = {
  shell: 'SH', python: 'PY', js: 'JS', node: 'NJ', java: 'JV',
  php: 'PHP', golang: 'GO', csharp: 'C#', ruby: 'RB', swift: 'SW', kotlin: 'KT',
}
function mono(id: string): string {
  return MONO[id] ?? id.slice(0, 2).toUpperCase()
}

function selectLang(id: string) {
  langId.value = id
  const lang = LANGS.find((l) => l.id === id)
  if (lang) clientId.value = lang.clients[0].id
}

// 打开新目标时保持上次的语言/模式选择，但确保 clientId 合法
watch(codegenOpen, (open) => {
  if (open) {
    const lang = LANGS.find((l) => l.id === langId.value)
    if (!lang?.clients.some((c) => c.id === clientId.value) && lang) clientId.value = lang.clients[0].id
  }
})

const copied = ref(false)
async function onCopy() {
  try {
    await navigator.clipboard.writeText(code.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* 剪贴板不可用时静默 */
  }
}
</script>

<template>
  <div v-if="codegenOpen" class="cg-mask" @click.self="closeCodegen()">
    <div class="cg">
      <!-- 头：标题 + 变量模式切换 + 复制/关闭 -->
      <div class="cg-head">
        <span class="cg-title">{{ L.codegen.title }}</span>
        <div class="cg-head-right">
          <div class="cg-mode-seg" role="tablist">
            <button
              class="cg-mode-btn"
              :class="{ active: !resolved }"
              :title="L.codegen.rawVars"
              @click="resolved = false"
            >{{ L.codegen.modeRaw }}</button>
            <button
              class="cg-mode-btn"
              :class="{ active: resolved }"
              :title="L.codegen.replaceEnv"
              @click="resolved = true"
            >{{ L.codegen.modeReal }}</button>
          </div>
          <button class="cg-icon" :title="L.common.copy" @click="onCopy">
            <Check v-if="copied" :size="15" />
            <Copy v-else :size="15" />
          </button>
          <button class="cg-icon" :title="L.common.close" @click="closeCodegen()">
            <X :size="16" />
          </button>
        </div>
      </div>

      <!-- 主体：左语言列表 / 右代码 -->
      <div class="cg-main">
        <div class="cg-langs">
          <button
            v-for="l in LANGS"
            :key="l.id"
            class="cg-lang"
            :class="{ active: l.id === langId }"
            @click="selectLang(l.id)"
          >
            <span class="cg-lang-badge">{{ mono(l.id) }}</span>
            <span class="cg-lang-label">{{ l.label }}</span>
            <span class="cg-lang-count" :title="L.codegen.client">{{ l.clients.length }}</span>
          </button>
        </div>

        <div class="cg-code">
          <div class="cg-code-bar">
            <span class="cg-code-clang">{{ currentLang?.label }}</span>
            <Dropdown align="end">
              <template #trigger>
                <button class="cg-client-btn">
                  {{ currentClient?.label }}
                  <ChevronDown :size="13" />
                </button>
              </template>
              <template #default="{ close }">
                <button
                  v-for="c in currentLang?.clients ?? []"
                  :key="c.id"
                  class="cg-menu-item"
                  :class="{ active: c.id === clientId }"
                  @click="clientId = c.id; close()"
                >
                  {{ c.label }}
                </button>
              </template>
            </Dropdown>
          </div>
          <div class="cg-code-view">
            <CodeEditor
              v-if="request"
              :model-value="code"
              :language="cmLang"
              read-only
              :var-highlight="!resolved"
              :line-numbers="true"
              :height="'100%'"
            />
            <div v-else class="cg-empty">{{ L.codegen.noRequest }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cg-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 200;
}
.cg {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 640px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-left: 1px solid var(--border);
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.2);
}
.cg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 48px;
  flex-shrink: 0;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elev);
}
.cg-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}
.cg-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* 变量模式分段切换 */
.cg-mode-seg {
  display: inline-flex;
  padding: 2px;
  background: var(--bg-well);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.cg-mode-btn {
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: calc(var(--radius) - 2px);
  cursor: pointer;
  transition: all var(--ease);
}
.cg-mode-btn.active {
  background: var(--bg-elev);
  color: var(--brand);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.cg-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
}
.cg-icon:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.cg-main {
  flex: 1;
  min-height: 0;
  display: flex;
}
/* 左：语言列表 */
.cg-langs {
  width: 168px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 8px;
  border-right: 1px solid var(--border);
  background: var(--bg-elev);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cg-lang {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  text-align: left;
}
.cg-lang:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.cg-lang.active {
  background: var(--bg-active);
  color: var(--text);
}
.cg-lang-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 24px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--brand-weak);
  color: var(--brand);
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
}
.cg-lang-label {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cg-lang-count {
  font-size: 10px;
  color: var(--text-faint);
  background: var(--bg-well);
  border-radius: 999px;
  padding: 1px 6px;
  flex-shrink: 0;
}
.cg-lang.active .cg-lang-count {
  background: var(--bg-elev);
  color: var(--text-dim);
}
/* 右：客户端选择 + 代码 */
.cg-code {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.cg-code-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  flex-shrink: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elev);
}
.cg-code-clang {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}
.cg-client-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}
.cg-client-btn:hover {
  border-color: var(--brand);
}
.cg-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.cg-menu-item:hover {
  background: var(--bg-well);
}
.cg-menu-item.active {
  color: var(--brand);
  font-weight: 600;
}
.cg-code-view {
  flex: 1;
  min-height: 0;
  display: flex;
}
.cg-empty {
  margin: auto;
  color: var(--text-faint);
  font-size: 12px;
}
</style>
