/**
 * Whip-crack audio: plays a random MP3 from the plugin's own public/
 * directory (whip1..4.mp3). The client-modules node half serves a plugin's
 * public/ directory under /plugins/<id>/public/, so the sound files travel
 * with the plugin (shareable) instead of depending on the web app's public
 * directory. Files are referenced by their public/-relative names; the base
 * is derived from the plugin id so a rename updates every URL in one place.
 */

/** This plugin's module-table id (also its /plugins/<id>/public/ base). */
const PLUGIN_ID = 'dsh-client-ui-ponytail'

/** Sound files, relative to the plugin's public/ directory. */
const WHIP_FILES: readonly string[] = ['whip1.mp3', 'whip2.mp3', 'whip3.mp3', 'whip4.mp3']

/** Cached audio elements by URL (lazy, rewound on each crack). */
const cache = new Map<string, HTMLAudioElement>()

/** Play one random whip crack; silent when audio is unavailable or blocked. */
export function playCrack(): void {
  const file = WHIP_FILES[Math.floor(Math.random() * WHIP_FILES.length)]
  if (file === undefined) return
  const url = `/plugins/${PLUGIN_ID}/public/${file}`
  let audio = cache.get(url)
  if (audio === undefined) {
    audio = new Audio(url)
    audio.preload = 'auto'
    cache.set(url, audio)
  }
  audio.currentTime = 0
  audio.play().catch(() => {
    // Autoplay policy or a missing file: silence is acceptable for an easter egg.
  })
}
