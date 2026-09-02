<script setup lang="ts">
// 变量/环境编辑整页：环境级 + 项目级 + 全局 三级变量表，宽度充裕
// （侧栏 240–480px 塞不下 键/初始值/当前值/启用 四列表格，用户实测反馈 → 拆成整页）
// 页面始终显示"当前环境"（env.currentEnvId，标题栏切换）的变量 + 项目级 + 全局；
// 变量行在 VarTable 中原地编辑，onCommit 落盘
import { computed, ref } from 'vue'
import { X, Pencil, Plus, Layers } from 'lucide-vue-next'
import EmptyState from '../common/EmptyState.vue'
import VarTable from './VarTable.vue'
import PromptDialog from '../common/PromptDialog.vue'
import { env, currentEnv, renameEnv, addEnvToProject } from '../../stores/env'
import { currentProject } from '../../stores/workspace'
import { closeVarPage, activePanel } from '../../stores/ui-state'
import { scheduleSave } from '../../lib/persist'
import { t } from '../../locales/zh-CN'

const L = computed(() => t())
const p = computed(() => currentProject.value)
const activeEnv = computed(() => currentEnv.value)

// 点环境名 pill 直接改名（与标题栏下拉同一入口的超集）
const showRenameEnv = ref(false)
function confirmRenameEnv(name: string) {
  showRenameEnv.value = false
  if (activeEnv.value) renameEnv(activeEnv.value.id, name)
}

// 无环境态 CTA：本页直接创建第一个环境
const showNewEnv = ref(false)
function confirmNewEnv(name: string) {
  showNewEnv.value = false
  const e = addEnvToProject(name)
  if (e) {
    env.currentEnvId = e.id
    commit()
  }
}

function commit() {
  if (p.value) p.value.updatedAt = Date.now()
  scheduleSave('projects')
}
function commitGlobal() {
  scheduleSave('env')
}
</script>

<template>
  <div class="vp">
    <header class="vp-head">
      <span class="vp-title">{{ L.env.vars }}</span>
      <button
        v-if="activeEnv"
        class="vp-env-tag"
        :title="L.common.rename"
        @click="showRenameEnv = true"
      >
        <Pencil :size="11" /> {{ activeEnv.name }}
      </button>
      <span v-else class="vp-env-tag muted">{{ L.env.noEnv }}</span>
      <button class="icon-btn vp-close" :title="L.common.close" @click="closeVarPage()">
        <X :size="15" />
      </button>
    </header>

    <div class="vp-body">
      <EmptyState v-if="!p" :title="L.env.empty" :hint="L.tree.noProjectHint" />
      <template v-else>
        <!-- 环境级变量（当前环境；无环境时提示去标题栏选一个） -->
        <section class="vp-sec">
          <div class="vp-sec-head">
            <h3>
              {{ L.env.vars }}
              <span v-if="activeEnv" class="vp-sec-sub">· {{ activeEnv.name }}</span>
            </h3>
            <span class="vp-sec-hint">{{ activeEnv ? activeEnv.variables.length : 0 }}</span>
          </div>
          <VarTable v-if="activeEnv" :vars="activeEnv.variables" :on-commit="commit" />
          <div v-else class="vp-cta">
            <p class="vp-cta-hint">{{ L.env.createEnvHint }}</p>
            <div class="vp-cta-actions">
              <button class="btn btn-primary" @click="showNewEnv = true">
                <Plus :size="13" /> {{ L.env.createEnv }}
              </button>
              <button class="btn" @click="activePanel = 'environments'">
                <Layers :size="13" /> {{ L.env.manageInSidebar }}
              </button>
            </div>
          </div>
        </section>

        <!-- 项目级变量（跨环境，Project.variables） -->
        <section class="vp-sec">
          <div class="vp-sec-head">
            <h3>{{ L.env.projectVars }}</h3>
            <span class="vp-sec-hint">{{ p.variables.length }}</span>
          </div>
          <VarTable :vars="p.variables" :on-commit="commit" />
        </section>

        <!-- 全局变量（environments.json，跨项目） -->
        <section class="vp-sec">
          <div class="vp-sec-head">
            <h3>{{ L.env.globalVars }}</h3>
            <span class="vp-sec-hint">{{ env.globalVars.length }}</span>
          </div>
          <VarTable :vars="env.globalVars" :on-commit="commitGlobal" />
        </section>
      </template>
    </div>

    <PromptDialog
      v-if="showRenameEnv && activeEnv"
      :title="L.dialog.envRename"
      :placeholder="L.dialog.envNewPlaceholder"
      :initial-value="activeEnv.name"
      @confirm="confirmRenameEnv"
      @cancel="showRenameEnv = false"
    />
    <PromptDialog
      v-if="showNewEnv"
      :title="L.dialog.envNew"
      :placeholder="L.dialog.envNewPlaceholder"
      @confirm="confirmNewEnv"
      @cancel="showNewEnv = false"
    />
  </div>
</template>

<style scoped>
.vp {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}
.vp-head {
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elev);
}
.vp-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.vp-env-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  color: var(--brand);
  background: var(--brand-weak);
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 2px 10px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--ease);
}
.vp-env-tag:not(.muted):hover {
  border-color: var(--brand);
}
.vp-env-tag.muted {
  color: var(--text-dim);
  background: var(--bg-hover);
  cursor: default;
}
.vp-close {
  margin-left: auto;
}
.vp-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 22px 28px;
}
.vp-sec {
  margin-bottom: 26px;
}
.vp-sec:last-child {
  margin-bottom: 0;
}
.vp-sec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.vp-sec-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.vp-sec-sub {
  color: var(--text-faint);
  font-weight: 500;
}
.vp-sec-hint {
  font-size: 11px;
  color: var(--text-faint);
}
.vp-cta {
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.vp-cta-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}
.vp-cta-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
