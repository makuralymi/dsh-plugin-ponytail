/**
 * Ponytail whip plugin, browser half: a composer-dock toggle that arms a
 * cursor-following rope whip. Clicking the conversation transcript while
 * armed cracks the whip (verlet physics + a synthesized crack) and sends a
 * hurry-up message through the session input machine. The message pool is
 * user-editable through a Ponytail page registered into the dsh settings
 * panel (`settings.section`): groups of prompts can be added, renamed,
 * enabled/disabled, moved, edited, and deleted, persisted through the Host
 * settings scope under the plugin's own namespace.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-conversation SlotMap + SessionStandardProps merge
// (the 'conversation.composer.dock' seat and the inputActions standard kit).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the settings SlotMap merge ('settings.section') and the
// ctx.settingsScope Context merge. Runtime collaboration goes through the
// service provided by this package, never a value import.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { WhipDock } from './WhipDock.tsx'
import type { WhipDockInjected } from './WhipDock.tsx'
import { PonytailSettingsSection } from './PonytailSettingsSection.tsx'
import type { PonytailSettingsSectionInjected } from './PonytailSettingsSection.tsx'
import { PonytailSettingsController } from './settings-controller.ts'
import { parsePonytailSettings, PONYTAIL_SETTINGS_NAMESPACE } from '../ponytail-settings.ts'
import type { PonytailSettings } from '../ponytail-settings.ts'

export { WhipDock } from './WhipDock.tsx'
export type { WhipDockInjected, WhipDockProps } from './WhipDock.tsx'
export { HURRIES, nextHurry } from './hurry.ts'
export { PET_WHIP_EVENT, triggerPetWhip } from './pet.ts'
export { WhipSimulation } from './whipPhysics.ts'
export type { WhipCrack, WhipOptions, WhipPoint } from './whipPhysics.ts'
export { PonytailSettingsSection } from './PonytailSettingsSection.tsx'
export type { PonytailSettingsSectionInjected, PonytailSettingsSectionProps } from './PonytailSettingsSection.tsx'
export { PonytailSettingsController } from './settings-controller.ts'
export type { PonytailSettingsSnapshot } from './settings-controller.ts'

/** Narrow structural face of the scoped conversation service's cancel verb. */
interface SessionCancelFace {
  cancel: () => Promise<void>
}

/**
 * Resolve the addressed session's turn cancellation from the sessions scope.
 * Missing scope/service and cancel failures are swallowed: the caller then
 * falls back to the ordinary busy-Enter policy.
 */
function cancelTurnOf(ctx: ClientContext, sessionId: SessionId): () => Promise<void> {
  return async () => {
    const scoped = ctx.sessions.scope(sessionId)
    const face = scoped?.get('conversation') as SessionCancelFace | undefined
    if (face === undefined) return
    try {
      await face.cancel()
    } catch {
      // Idle turn, transport race, or unavailable service: submit still runs.
    }
  }
}

/**
 * Services required before either registration can run. The target slots are
 * declared by ui-conversation / ui-settings-general; `connection`, `remote`,
 * and `settingsScope` arrive through the packages listed in dsh.client.inject.
 */
export const inject = ['slots', 'connection', 'remote', 'settingsScope', 'sessions']

/**
 * Client plugin body: register the whip toggle into the composer dock and the
 * prompt editor into the settings panel sidebar, both sharing one settings
 * controller.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const host = ctx.settingsScope.bind<PonytailSettings>({
    namespace: PONYTAIL_SETTINGS_NAMESPACE,
    decode: parsePonytailSettings,
  })
  const controller = new PonytailSettingsController(host)
  ctx.effect(() => controller.attach(), 'dsh-client-ui-ponytail: settings scope adoption')

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'ponytail',
    order: 20,
    inject: (sessionId: SessionId): WhipDockInjected => ({
      pickPrompt: previous => controller.nextPrompt(previous),
      shouldInterrupt: () => controller.getSnapshot().settings.interrupt,
      cancelTurn: cancelTurnOf(ctx, sessionId),
    }),
  }, WhipDock))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'ponytail',
    order: 30,
    label: 'Ponytail（鞭子）',
    inject: (): PonytailSettingsSectionInjected => ({ controller }),
  }, PonytailSettingsSection))
}
