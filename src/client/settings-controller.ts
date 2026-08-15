/**
 * Ponytail settings controller: the single browser-side owner of the grouped
 * hurry-prompt state. It mirrors the Host settings scope into a bare
 * observable snapshot, applies edits optimistically, and persists through
 * `SettingsScope.set`/`unset` when the transport is writable. Both the dock
 * entry (prompt picker) and the settings section (editor) receive this one
 * instance through slot inject faces.
 */

import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  clonePonytailSettings, DEFAULT_PONYTAIL_SETTINGS, newPonytailId,
  nextPromptFromSettings, PONYTAIL_GROUPS_FIELD, type PonytailGroup,
  type PonytailSettings,
} from '../ponytail-settings.ts'

/** Read-only controller snapshot consumed via `useSyncExternalStore`. */
export interface PonytailSettingsSnapshot {
  /** Host settings transport state (`loading` until the first answer). */
  status: 'loading' | 'ready' | 'unavailable'
  /** Current effective settings (defaults before the first Host value). */
  settings: PonytailSettings
  /** Whether edits can reach the Host document; false = session-local only. */
  writable: boolean
  /** Whether a write is in flight. */
  saving: boolean
  /** Last persistence error, if any. */
  error: string | undefined
  /** Monotonic local change counter (re-render trigger for uSES). */
  revision: number
}

/** Human-readable failure for the settings page notice. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Single owner of effective prompt settings and the Host write path.
 * Constructed once per plugin apply (never at module scope).
 */
export class PonytailSettingsController {
  private readonly listeners = new Set<() => void>()
  private snapshot: PonytailSettingsSnapshot = {
    status: 'loading',
    settings: clonePonytailSettings(DEFAULT_PONYTAIL_SETTINGS),
    writable: false,
    saving: false,
    error: undefined,
    revision: 0,
  }

  /**
   * @param host - settings-namespace scope bound by the owning plugin fiber.
   */
  constructor(private readonly host: SettingsScope<PonytailSettings>) {}

  /** Subscribe to snapshot replacements (stable bound callbacks for uSES). */
  subscribe = (listener: () => void): () => void => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Current immutable snapshot (stable reference until the next publish). */
  getSnapshot = (): PonytailSettingsSnapshot => this.snapshot

  /**
   * Attach to the Host scope: adopt its current value now and on every push.
   * @returns the disposer removing the subscription (called from ctx.effect).
   */
  attach(): () => void {
    const dispose = this.host.subscribe(() => { this.adopt() })
    this.adopt()
    return dispose
  }

  /** Pick the next hurry line for a whip crack, honoring user edits. */
  nextPrompt(previous: string | undefined): string {
    return nextPromptFromSettings(this.snapshot.settings, previous)
  }

  // ── group edits ──────────────────────────────────────────────────────────

  /** Add one group and return its new id. */
  addGroup(name: string): string {
    const cleanName = name.trim()
    const group: PonytailGroup = {
      id: newPonytailId('group'),
      name: cleanName === '' ? '未命名分组' : cleanName,
      enabled: true,
      prompts: [],
    }
    this.commit({
      groups: [...this.snapshot.settings.groups, group],
    })
    return group.id
  }

  /** Rename a group; blank names fall back to a placeholder. */
  renameGroup(groupId: string, name: string): void {
    this.commit({
      groups: this.snapshot.settings.groups.map(group => group.id === groupId
        ? { ...group, name: name.trim() === '' ? '未命名分组' : name.trim() }
        : group),
    })
  }

  /** Enable/disable one group in the whip-crack rotation. */
  setGroupEnabled(groupId: string, enabled: boolean): void {
    this.commit({
      groups: this.snapshot.settings.groups.map(group => group.id === groupId
        ? { ...group, enabled }
        : group),
    })
  }

  /** Delete a group and every prompt inside it. */
  deleteGroup(groupId: string): void {
    this.commit({
      groups: this.snapshot.settings.groups.filter(group => group.id !== groupId),
    })
  }

  // ── prompt edits ─────────────────────────────────────────────────────────

  /** Add a prompt to one group; blank text is kept for inline editing and never sent. */
  addPrompt(groupId: string, text: string): void {
    const settings = this.snapshot.settings
    if (!settings.groups.some(group => group.id === groupId)) return
    this.commit({
      groups: settings.groups.map(group => group.id === groupId
        ? { ...group, prompts: [...group.prompts, { id: newPonytailId('prompt'), text }] }
        : group),
    })
  }

  /** Replace one prompt's text. */
  updatePrompt(groupId: string, promptId: string, text: string): void {
    this.commit({
      groups: this.snapshot.settings.groups.map(group => group.id === groupId
        ? {
          ...group,
          prompts: group.prompts.map(prompt => prompt.id === promptId ? { ...prompt, text } : prompt),
        }
        : group),
    })
  }

  /** Delete one prompt. */
  deletePrompt(groupId: string, promptId: string): void {
    this.commit({
      groups: this.snapshot.settings.groups.map(group => group.id === groupId
        ? { ...group, prompts: group.prompts.filter(prompt => prompt.id !== promptId) }
        : group),
    })
  }

  /** Move one prompt into another group (also its "分组" reassignment). */
  movePrompt(fromGroupId: string, promptId: string, toGroupId: string): void {
    if (fromGroupId === toGroupId) return
    const groups = this.snapshot.settings.groups
    const from = groups.find(group => group.id === fromGroupId)
    const prompt = from?.prompts.find(candidate => candidate.id === promptId)
    if (from === undefined || prompt === undefined) return
    if (!groups.some(group => group.id === toGroupId)) return
    this.commit({
      groups: groups.map(group => {
        if (group.id === fromGroupId) {
          return { ...group, prompts: group.prompts.filter(candidate => candidate.id !== promptId) }
        }
        if (group.id === toGroupId) {
          return { ...group, prompts: [...group.prompts, { ...prompt }] }
        }
        return group
      }),
    })
  }

  // ── persistence ──────────────────────────────────────────────────────────

  /** Reset to the shipped default section (unset the user override). */
  resetToDefaults(): void {
    const defaults = clonePonytailSettings(DEFAULT_PONYTAIL_SETTINGS)
    this.publish({ settings: defaults, saving: true, error: undefined })
    if (!this.snapshot.writable) {
      this.publish({ saving: false })
      return
    }
    void this.host.unset(PONYTAIL_GROUPS_FIELD).then(() => {
      this.publish({ saving: false, error: undefined })
    }, (error: unknown) => {
      this.publish({ saving: false, error: describeError(error) })
    })
  }

  /**
   * Adopt a pushed Host value, keeping in-flight edit state. A malformed or
   * still-loading section keeps the current effective settings.
   */
  private adopt(): void {
    const host = this.host.getSnapshot()
    const settings = host.value === undefined
      ? this.snapshot.settings
      : clonePonytailSettings(host.value)
    this.publish({
      status: host.status,
      settings,
      writable: host.status === 'ready' && host.writable,
    })
  }

  /**
   * Publish one optimistic edit locally, then persist when the transport
   * allows it. Rapid edits queue on the Host scope in call order; only the
   * latest snapshot is authoritative for the picker.
   */
  private commit(next: PonytailSettings): void {
    const settings = clonePonytailSettings(next)
    this.publish({ settings, saving: true, error: undefined })
    if (!this.snapshot.writable) {
      this.publish({ saving: false })
      return
    }
    void this.host.set(PONYTAIL_GROUPS_FIELD, settings.groups).then(() => {
      this.publish({ saving: false, error: undefined })
    }, (error: unknown) => {
      this.publish({ saving: false, error: describeError(error) })
    })
  }

  /** Swap in a new immutable snapshot and notify subscribers. */
  private publish(patch: Partial<Omit<PonytailSettingsSnapshot, 'revision'>>): void {
    this.snapshot = { ...this.snapshot, ...patch, revision: this.snapshot.revision + 1 }
    for (const listener of [...this.listeners]) listener()
  }
}
