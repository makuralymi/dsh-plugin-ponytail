/**
 * Hurry-up instructions the whip sends to the model on each crack. These are
 * model-facing content (delivered as an ordinary user message), not UI copy,
 * so they stay literal data rather than a locale dictionary.
 */

/** The rotation pool of hurry-up lines. */
export const HURRIES: readonly string[] = [
  '⏩ 快马加鞭！请立即收敛思路，跳过无关展开，直接给出最终结果。',
  '🏇 驾！别再磨蹭了，聚焦最小可行实现，马上交付可运行版本。',
  '⚡ 提速！停止过度思考，先跑通主流程，其余细节留到后续再说。',
  '🔥 抓紧时间！放弃可选验证和锦上添花，直接输出结论。',
  '🪢 啪！快进到答案，不要复述思路，直接给出最终代码或结论。',
  '💨 加速加速！压缩解释，直接产出结果，别让用户再等。',
]

/**
 * Pick the next hurry line, never repeating the immediately previous one.
 * @param previous - the last line sent, if any.
 * @returns a line from {@link HURRIES}.
 */
export function nextHurry(previous: string | undefined): string {
  if (HURRIES.length <= 1) return HURRIES[0] ?? ''
  const candidates = HURRIES.filter(line => line !== previous)
  const index = Math.floor(Math.random() * candidates.length)
  return candidates[index] ?? HURRIES[0] ?? ''
}
