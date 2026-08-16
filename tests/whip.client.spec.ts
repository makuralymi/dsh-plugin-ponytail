import { describe, expect, it } from 'vitest'
import { HURRIES, nextHurry } from '../src/client/hurry.ts'
import { WhipSimulation } from '../src/client/whipPhysics.ts'
import {
  clonePonytailSettings, collectPromptTexts, DEFAULT_PONYTAIL_SETTINGS,
  nextPromptFromSettings, parsePonytailSettings,
} from '../src/ponytail-settings.ts'
import type { PonytailSettings } from '../src/ponytail-settings.ts'

describe('WhipSimulation', () => {
  it('seeds the handle tip and a straight rope hanging from it', () => {
    const sim = new WhipSimulation({ points: 5, segmentLength: 10 })
    sim.seed(100, 100)
    const rope = sim.rope()
    // Handle tip sits at the grip plus the idle handle offset; the rope
    // hangs straight down from it by one segment per point.
    expect(rope[3]!.y - rope[0]!.y).toBeCloseTo(30, 5)
    expect(rope[4]!.y - rope[3]!.y).toBeCloseTo(10, 5)
  })

  it('charge → release walks the strike machine and latches struck', () => {
    const sim = new WhipSimulation({ points: 20, segmentLength: 8 })
    sim.seed(200, 200)
    expect(sim.phase).toBe('idle')

    sim.charge()
    expect(sim.phase).toBe('charge')
    for (let i = 0; i < 30; i += 1) sim.step(1 / 60)
    expect(sim.chargeLevel).toBeGreaterThan(0)

    sim.release()
    expect(sim.phase).toBe('strike_forward')

    let struck = false
    for (let i = 0; i < 120; i += 1) {
      sim.step(1 / 60)
      if (sim.struck) struck = true
    }
    expect(struck).toBe(true)
    expect(sim.phase).toBe('idle')
  })

  it('releasing without a charge is a no-op', () => {
    const sim = new WhipSimulation()
    sim.seed(0, 0)
    sim.release()
    expect(sim.phase).toBe('idle')
    expect(sim.struck).toBe(false)
  })
})

describe('nextHurry', () => {
  it('rotates through HURRIES without an immediate repeat', () => {
    let previous: string | undefined
    for (let i = 0; i < 60; i += 1) {
      const line = nextHurry(previous)
      expect(HURRIES).toContain(line)
      expect(line).not.toBe(previous)
      previous = line
    }
  })
})

describe('ponytail settings prompt pool', () => {
  it('ships the original hurry lines in one enabled default group', () => {
    expect(collectPromptTexts(DEFAULT_PONYTAIL_SETTINGS)).toEqual([...HURRIES])
  })

  it('collects only non-empty prompts from enabled groups', () => {
    const settings: PonytailSettings = {
      groups: [
        { id: 'a', name: 'A', enabled: true, prompts: [
          { id: 'a1', text: '  hello  ' },
          { id: 'a2', text: '   ' },
        ] },
        { id: 'b', name: 'B', enabled: false, prompts: [{ id: 'b1', text: 'hidden' }] },
      ],
      interrupt: false,
    }
    expect(collectPromptTexts(settings)).toEqual(['hello'])
  })

  it('never repeats the previous line and returns "" for an empty pool', () => {
    const settings = clonePonytailSettings(DEFAULT_PONYTAIL_SETTINGS)
    let previous: string | undefined
    for (let i = 0; i < 40; i += 1) {
      const line = nextPromptFromSettings(settings, previous)
      expect(collectPromptTexts(settings)).toContain(line)
      expect(line).not.toBe(previous)
      previous = line
    }
    expect(nextPromptFromSettings({ groups: [], interrupt: false }, previous)).toBe('')
  })

  it('rejects malformed wire sections', () => {
    expect(parsePonytailSettings(null)).toBeUndefined()
    expect(parsePonytailSettings({ groups: 'nope' })).toBeUndefined()
    expect(parsePonytailSettings({ groups: [{ id: '', name: 'x', enabled: true, prompts: [] }] })).toBeUndefined()
    expect(parsePonytailSettings({ groups: [{ id: 'x', name: 'x', enabled: true, prompts: [{ id: 'p', text: 'hi' }] }] })).toEqual({
      groups: [{ id: 'x', name: 'x', enabled: true, prompts: [{ id: 'p', text: 'hi' }] }],
      interrupt: false,
    })
  })

  it('treats a missing enabled flag as enabled and a missing interrupt switch as off', () => {
    const parsed = parsePonytailSettings({ groups: [{ id: 'x', name: 'x', prompts: [] }] })
    expect(parsed?.groups[0]?.enabled).toBe(true)
    expect(parsed?.interrupt).toBe(false)
    expect(parsePonytailSettings({ groups: [], interrupt: true })?.interrupt).toBe(true)
  })
})
