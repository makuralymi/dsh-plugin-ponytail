/**
 * Durable settings contract shared by the ponytail plugin's node and browser
 * halves: the settings namespace, the grouped hurry-prompt model, the shipped
 * defaults, and the pure selection/validation helpers.
 *
 * The node half turns this shape into the registered schemastery schema; the
 * browser half validates against the same plain-data rules when it narrows the
 * wire section. This file must stay free of Host-only or browser-only imports
 * so both compilation faces can include it.
 */

/** Settings namespace owned by this plugin (lowercase kebab-case). */
export const PONYTAIL_SETTINGS_NAMESPACE = 'dsh-client-ui-ponytail'

/** Scalar field inside the namespace section that carries the prompt groups. */
export const PONYTAIL_GROUPS_FIELD = 'groups'

/** Scalar field carrying the interrupt-before-send switch. */
export const PONYTAIL_INTERRUPT_FIELD = 'interrupt'

/** One editable hurry-up prompt. */
export interface PonytailPrompt {
  /** Stable id (React key and edit/delete/move address). */
  id: string
  /** Model-facing prompt text; leading/trailing whitespace is trimmed on read. */
  text: string
}

/** One prompt group. Disabled groups keep their prompts but leave the rotation. */
export interface PonytailGroup {
  /** Stable group id. */
  id: string
  /** User-facing group name. */
  name: string
  /** Whether this group participates in whip-crack rotation. */
  enabled: boolean
  /** Prompts stored in this group, in display order. */
  prompts: PonytailPrompt[]
}

/** Resolved section shape persisted under {@link PONYTAIL_SETTINGS_NAMESPACE}. */
export interface PonytailSettings {
  /** Prompt groups. Order is user-controlled (creation/display order). */
  groups: PonytailGroup[]
  /**
   * While the model is working: cancel the in-flight turn first, then send the
   * hurry message immediately. Defaults to false (the message queues and the
   * current turn finishes first).
   */
  interrupt: boolean
}

/** Shipped hurry-up lines (the pre-settings rotation pool). */
export const DEFAULT_HURRY_LINES: readonly string[] = [
  '⏩ 快马加鞭！请立即收敛思路，跳过无关展开，直接给出最终结果。',
  '🏇 驾！别再磨蹭了，聚焦最小可行实现，马上交付可运行版本。',
  '⚡ 提速！停止过度思考，先跑通主流程，其余细节留到后续再说。',
  '🔥 抓紧时间！放弃可选验证和锦上添花，直接输出结论。',
  '🪢 啪！快进到答案，不要复述思路，直接给出最终代码或结论。',
  '💨 加速加速！压缩解释，直接产出结果，别让用户再等。',
]

/** Stable ids for the built-in prompts so edits/deletes never depend on array indices. */
const DEFAULT_PROMPT_IDS: readonly string[] = [
  'default-fast', 'default-ride', 'default-speed', 'default-urgent', 'default-snap', 'default-boost',
]

/**
 * Shipped section: one enabled group carrying the original hurry-up lines.
 * The schema default resolves to this when the user layer has no `groups`.
 */
export const DEFAULT_PONYTAIL_SETTINGS: PonytailSettings = {
  groups: [{
    id: 'default',
    name: '默认催促',
    enabled: true,
    prompts: DEFAULT_HURRY_LINES.map((text, index) => ({
      id: DEFAULT_PROMPT_IDS[index] ?? `default-${index + 1}`,
      text,
    })),
  }],
  interrupt: false,
}

/**
 * Clone one settings value into mutable plain data. Defaults are frozen, so
 * every editor starts from a detached copy and can never mutate the shipped
 * fallback in place.
 */
export function clonePonytailSettings(settings: PonytailSettings): PonytailSettings {
  return {
    groups: settings.groups.map(group => ({
      id: group.id,
      name: group.name,
      enabled: group.enabled,
      prompts: group.prompts.map(prompt => ({ id: prompt.id, text: prompt.text })),
    })),
    interrupt: settings.interrupt,
  }
}

/**
 * Trim one prompt for the rotation. Empty/whitespace-only prompts never get
 * sent, but they remain editable in the page until removed.
 */
export function promptText(prompt: Pick<PonytailPrompt, 'text'>): string {
  return prompt.text.trim()
}

/**
 * All sendable prompt texts in group-then-row order, from enabled groups only.
 */
export function collectPromptTexts(settings: PonytailSettings): string[] {
  const texts: string[] = []
  for (const group of settings.groups) {
    if (!group.enabled) continue
    for (const prompt of group.prompts) {
      const text = promptText(prompt)
      if (text !== '') texts.push(text)
    }
  }
  return texts
}

/**
 * Pick the next hurry-up line from one settings value, never repeating the
 * immediately previous line. Returns the empty string when the user disabled
 * or deleted every sendable prompt (the whip then stays silent).
 * @param settings - current settings value.
 * @param previous - the last line sent, if any.
 * @returns the next line, or '' when no prompt is sendable.
 */
export function nextPromptFromSettings(settings: PonytailSettings, previous: string | undefined): string {
  const pool = collectPromptTexts(settings)
  if (pool.length === 0) return ''
  const candidates = pool.filter(line => line !== previous)
  if (candidates.length === 0) return pool[0] ?? ''
  return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0] ?? ''
}

/**
 * Pick the next line from a literal pool (used by the legacy `nextHurry`
 * export and by tests that exercise the rotation itself).
 */
export function nextPromptFromTexts(texts: readonly string[], previous: string | undefined): string {
  const pool = texts.filter(text => text.trim() !== '')
  if (pool.length === 0) return ''
  const candidates = pool.filter(line => line !== previous)
  if (candidates.length === 0) return pool[0] ?? ''
  return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0] ?? ''
}

/** Generate a collision-resistant-enough id for user-created groups/prompts. */
export function newPonytailId(prefix: string): string {
  const stamp = Date.now().toString(36)
  const noise = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${stamp}-${noise}`
}

/**
 * Narrow an unknown wire value to {@link PonytailSettings} with the same
 * runtime rules the schema enforces (minus cross-field uniqueness, which the
 * editor never produces). Returns undefined so the client keeps its last good
 * value when an externally edited document is malformed.
 */
export function parsePonytailSettings(value: unknown): PonytailSettings | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  if (raw[PONYTAIL_INTERRUPT_FIELD] !== undefined && typeof raw[PONYTAIL_INTERRUPT_FIELD] !== 'boolean') return undefined
  const rawGroups = raw[PONYTAIL_GROUPS_FIELD]
  if (!Array.isArray(rawGroups)) return undefined
  const groups: PonytailGroup[] = []
  for (const rawGroup of rawGroups) {
    if (typeof rawGroup !== 'object' || rawGroup === null || Array.isArray(rawGroup)) return undefined
    const candidate = rawGroup as Record<string, unknown>
    if (typeof candidate['id'] !== 'string' || candidate['id'] === '') return undefined
    if (typeof candidate['name'] !== 'string') return undefined
    if (candidate['enabled'] !== undefined && typeof candidate['enabled'] !== 'boolean') return undefined
    if (!Array.isArray(candidate['prompts'])) return undefined
    const prompts: PonytailPrompt[] = []
    for (const rawPrompt of candidate['prompts']) {
      if (typeof rawPrompt !== 'object' || rawPrompt === null || Array.isArray(rawPrompt)) return undefined
      const prompt = rawPrompt as Record<string, unknown>
      if (typeof prompt['id'] !== 'string' || prompt['id'] === '') return undefined
      if (typeof prompt['text'] !== 'string') return undefined
      prompts.push({ id: prompt['id'], text: prompt['text'] })
    }
    groups.push({
      id: candidate['id'],
      name: candidate['name'],
      enabled: candidate['enabled'] !== false,
      prompts,
    })
  }
  return { groups, interrupt: raw[PONYTAIL_INTERRUPT_FIELD] === true }
}
