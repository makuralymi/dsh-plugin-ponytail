/**
 * Whip-triggered DeepSeek Pet handoff.
 *
 * A whip crack dispatches one bare `deepseek-pet:whip` CustomEvent. The
 * deepseek-pet plugin owns the whole response: it listens for the event,
 * picks one of its own reaction poses (`public/defense.png`,
 * `public/frightened.png`, `public/giggle.png`), shows it as the pet sprite,
 * and speaks the matching line in its `.dsh-live2d-bubble`.
 */

/** CustomEvent name consumed by the deepseek-pet plugin. */
export const PET_WHIP_EVENT = 'deepseek-pet:whip'

/** Notify the deepseek-pet plugin that a whip crack just happened. */
export function triggerPetWhip(): void {
  window.dispatchEvent(new CustomEvent(PET_WHIP_EVENT))
}
