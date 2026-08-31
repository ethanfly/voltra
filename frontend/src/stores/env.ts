// 环境与变量 store
// 作用域优先级（PRD ENV-3）：环境级（当前项目 + 当前环境）> 项目级 > 全局（environments.json）
// 请求级预留（PRD Request 模型暂无 variables 字段，v0.2 不实现请求级覆盖）
import { reactive, computed } from 'vue'
import type { ID, Variable, Environment, Request } from '../types/models'
import { uid } from '../types/models'
import { resolveVars, type ResolveResult } from '../lib/vars'
import { currentProject } from './workspace'
import { scheduleSave } from '../lib/persist'

/** secret 变量在界面/悬浮提示中的打码显示 */
export const SECRET_MASK = '••••••'

export const env = reactive({
  /** 全局变量（environments.json 兼容保留） */
  globalVars: [] as Variable[],
  /** 当前项目选中的环境；null = 无环境 */
  currentEnvId: null as ID | null,
})

export const currentEnv = computed(() => {
  const p = currentProject.value
  if (!p || !env.currentEnvId) return null
  return p.environments.find((e) => e.id === env.currentEnvId) ?? null
})

/** 合并各作用域为扁平 map（低优先级在前，高优先级覆盖） */
export function mergedVars(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of env.globalVars) {
    if (v.enabled && v.key) out[v.key] = v.currentValue
  }
  const p = currentProject.value
  if (p) {
    for (const v of p.variables) {
      if (v.enabled && v.key) out[v.key] = v.currentValue
    }
    const e = currentEnv.value
    if (e) {
      for (const v of e.variables) {
        if (v.enabled && v.key) out[v.key] = v.currentValue
      }
    }
  }
  return out
}

/** 按当前作用域替换文本中的 {{var}}；request 参数预留（请求级作用域） */
export function resolveAll(_request: Request | null, text: string): ResolveResult {
  void _request
  return resolveVars(text, mergedVars())
}

// ---------- 变量元信息（ENV-4/5：高亮、悬浮值、secret 打码） ----------

export interface VarMeta {
  defined: boolean
  value: string
  secret: boolean
  /** 悬浮提示用显示值（secret 打码） */
  display: string
}

/** 按合并顺序（全局 < 项目 < 环境）找到最高优先级的定义作用域，取其 secret 标记 */
function isSecretVar(name: string): boolean {
  for (const v of env.globalVars) if (v.key === name && v.enabled) return !!v.secret
  const p = currentProject.value
  for (const v of p?.variables ?? []) if (v.key === name && v.enabled) return !!v.secret
  for (const v of currentEnv.value?.variables ?? []) if (v.key === name && v.enabled) return !!v.secret
  return false
}

export function varMeta(name: string): VarMeta {
  const m = mergedVars()
  if (!Object.prototype.hasOwnProperty.call(m, name)) {
    return { defined: false, value: '', secret: false, display: '' }
  }
  const value = m[name]
  const secret = isSecretVar(name)
  return { defined: true, value, secret, display: secret ? SECRET_MASK : value }
}


// ---------- 环境 CRUD（当前项目内） ----------

export function addEnvToProject(name: string): Environment | null {
  const p = currentProject.value
  if (!p) return null
  const e: Environment = { id: uid(), name, variables: [] }
  p.environments.push(e)
  p.updatedAt = Date.now()
  scheduleSave('projects')
  return e
}

export function renameEnv(envId: ID, name: string) {
  const e = currentEnv.value
  if (e && e.id === envId) e.name = name
  scheduleSave('projects')
}

export function removeEnvFromProject(envId: ID) {
  const p = currentProject.value
  if (!p) return
  const i = p.environments.findIndex((x) => x.id === envId)
  if (i < 0) return
  p.environments.splice(i, 1)
  if (env.currentEnvId === envId) env.currentEnvId = null
  p.updatedAt = Date.now()
  scheduleSave('projects')
}

export function setEnvVariables(envId: ID, vars: Variable[]) {
  const p = currentProject.value
  if (!p) return
  const e = p.environments.find((x) => x.id === envId)
  if (!e) return
  e.variables = vars
  p.updatedAt = Date.now()
  scheduleSave('projects')
}

export function setProjectVariables(vars: Variable[]) {
  const p = currentProject.value
  if (!p) return
  p.variables = vars
  p.updatedAt = Date.now()
  scheduleSave('projects')
}

export function setGlobalVars(vars: Variable[]) {
  env.globalVars = vars
  scheduleSave('env')
}

export function setCurrentEnv(id: ID | null) {
  env.currentEnvId = id
  scheduleSave('ui')
}
