/**
 * Ponytail whip plugin, node half. Registers the durable settings namespace
 * that backs the browser-side "鞭子设置" settings panel: user-editable,
 * grouped hurry-up prompts. The browser half ships via exports["./client"],
 * discovered through the package.json dsh.client declaration.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  DEFAULT_PONYTAIL_SETTINGS, PONYTAIL_GROUPS_FIELD, PONYTAIL_INTERRUPT_FIELD,
  PONYTAIL_SETTINGS_NAMESPACE,
  type PonytailGroup, type PonytailPrompt,
} from './ponytail-settings.ts'

/**
 * Durable schema for one prompt row. Blank text is allowed so an added row
 * can wait for its wording; the picker skips blank rows.
 */
const PonytailPromptSchema: z<PonytailPrompt> = z.object({
  id: z.string().min(1).max(128),
  text: z.string().max(4000),
})

/** Durable schema for one group. */
const PonytailGroupSchema: z<PonytailGroup> = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  prompts: z.array(PonytailPromptSchema).max(500),
})

/** Durable section: grouped prompts plus the interrupt-before-send switch. */
const PonytailSettingsSchema = z.object({
  [PONYTAIL_GROUPS_FIELD]: z.array(PonytailGroupSchema).max(50).default(DEFAULT_PONYTAIL_SETTINGS.groups),
  [PONYTAIL_INTERRUPT_FIELD]: z.boolean().default(DEFAULT_PONYTAIL_SETTINGS.interrupt),
})

/**
 * Host plugin body: register the settings namespace once a settings provider
 * is composed. Without one the plugin still activates — the whip falls back to
 * its built-in rotation and the settings page edits are session-local.
 * @param ctx - host context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(PONYTAIL_SETTINGS_NAMESPACE),
      PonytailSettingsSchema,
    )
  })
}
