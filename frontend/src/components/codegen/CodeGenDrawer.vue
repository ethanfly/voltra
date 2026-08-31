<script setup lang="ts">
// 生成代码抽屉：语言/客户端库选择 + 实时输出 + 复制；「变量原样 / 当前环境真实值替换」双模式
import { computed, ref, watch } from 'vue'
import CodeEditor from '../common/CodeEditor.vue'
import Dropdown from '../common/Dropdown.vue'
import { Copy, X } from 'lucide-vue-next'
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

const cmLang = computed(() => (langId.value === 'js' || langId.value === 'node' ? 'javascript' : 'text'))

// 换语言时客户端库重置为该语言第一个
watch(langId, (id) => {
  const lang = LANGS.find((l) => l.id === id)
  if (lang) clientId.value = lang.clients[0].id
})

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
      <div class="cg-head">
        <span class="cg-title">{{ L.codegen.title }}</span>
        <button class="cg-x" :title="L.common.close" @click="closeCodegen()">
          <X :size="14" />
        </button>
      </div>
      <div class="cg-sel">
        <Dropdown>
          <template #trigger>
            <button class="cg-btn">{{ L.codegen.language }}：{{ LANGS.find((l) => l.id === langId)?.label }}</button>
          </template>
          <template #default="{ close }">
            <button
              v-for="l in LANGS"
              :key="l.id"
              class="cg-menu-item"
              :class="{ active: l.id === langId }"
              @click="langId = l.id; close()"
            >
              {{ l.label }}
            </button>
          </template>
        </Dropdown>
        <Dropdown>
          <template #trigger>
            <button class="cg-btn">{{ L.codegen.client }}：{{ LANGS.find((l) => l.id === langId)?.clients.find((c) => c.id === clientId)?.label }}</button>
          </template>
          <template #default="{ close }">
            <button
              v-for="c in LANGS.find((l) => l.id === langId)?.clients ?? []"
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
      <div class="cg-body">
        <CodeEditor v-if="request" :model-value="code" :language="cmLang" read-only :height="'100%'" />
        <div v-else class="cg-empty">{{ L.codegen.noRequest }}</div>
      </div>
      <div class="cg-foot">
        <label class="cg-mode">
          <input type="checkbox" v-model="resolved" />
          {{ L.codegen.replaceEnv }}
        </label>
        <button class="btn btn-primary" @click="onCopy">
          <Copy :size="13" />
          {{ copied ? L.common.copied : L.common.copy }}
        </button>
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
  width: 480px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.18);
}
.cg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.cg-title {
  font-weight: 600;
  font-size: 13px;
}
.cg-x {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 2px;
}
.cg-sel {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.cg-btn {
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--radius);
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}
.cg-btn:hover {
  border-color: var(--brand);
}
.cg-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text);
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.cg-menu-item:hover {
  background: var(--bg-sunken);
}
.cg-menu-item.active {
  color: var(--brand);
  font-weight: 600;
}
.cg-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.cg-empty {
  margin: auto;
  color: var(--text-faint);
  font-size: 12px;
}
.cg-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}
.cg-mode {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
}
</style>
