/**
 * Hurry-up instructions the whip sends to the model on each crack. These are
 * model-facing content (delivered as an ordinary user message), not UI copy,
 * so they stay literal data rather than a locale dictionary.
 *
 * `HURRIES` / `nextHurry` are the legacy literal-pool face; the live whip path
 * consumes the user-editable settings through
 * {@link PonytailSettingsController.nextPrompt}.
 */

import { DEFAULT_HURRY_LINES, nextPromptFromTexts } from '../ponytail-settings.ts'

/** The shipped rotation pool of hurry-up lines. */
export const HURRIES: readonly string[] = DEFAULT_HURRY_LINES

/**
 * Pick the next hurry line from the shipped pool, never repeating the
 * immediately previous one.
 * @param previous - the last line sent, if any.
 * @returns a line from {@link HURRIES}.
 */
export function nextHurry(previous: string | undefined): string {
  return nextPromptFromTexts(HURRIES, previous)
}
