/**
 * Ponytail whip plugin, browser half: a composer-dock toggle that arms a
 * cursor-following rope whip. Clicking the conversation transcript while
 * armed cracks the whip (verlet physics + a synthesized crack) and sends a
 * hurry-up message through the session input machine. Pure easter egg — no
 * service, no store, no cordis events; the dock entry owns nothing but the
 * standard session kit (`inputActions`).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap + SessionStandardProps merge
// (the 'conversation.composer.dock' seat and the inputActions standard kit).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { WhipDock } from './WhipDock.tsx'

export { WhipDock } from './WhipDock.tsx'
export type { WhipDockProps } from './WhipDock.tsx'
export { HURRIES, nextHurry } from './hurry.ts'
export { WhipSimulation } from './whipPhysics.ts'
export type { WhipCrack, WhipOptions, WhipPoint } from './whipPhysics.ts'

/** Services required before the dock entry can register. */
export const inject = ['slots']

/**
 * Client plugin body: register the whip toggle into the composer dock.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'ponytail',
    order: 20,
  }, WhipDock))
}
