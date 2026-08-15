import { describe, expect, it } from 'vitest'
import { HURRIES, nextHurry } from '../src/client/hurry.ts'
import { WhipSimulation } from '../src/client/whipPhysics.ts'
import {
  clonePonytailSettings, collectPromptTexts, DEFAULT_PONYTAIL_SETTINGS,
  nextPromptFromSettings, parsePonytailSettings,
} from '../src/ponytail-settings.ts'
import type { PonytailSettings } from '../src/ponytail-settings.ts'

describe('WhipSimulation', () => {
  it('seeds a straight rope hanging below the head', () => {
    const sim = new WhipSimulation({ points: 5, segmentLength: 10 })
    sim.seed(100, 100)
    const rope = sim.rope()
    expect(rope[0]?.x).toBe(100)
    expect(rope[0]?.y).toBe(100)
    expect(rope[4]?.y).toBe(140)
  })

  it('crack flick travels the rope and finishes', () => {
    const sim = new WhipSimulation({ points: 20, segmentLength: 8, flickAmplitude: 60, flickDuration: 0.15 })
    sim.seed(200, 200)
    sim.crackAt(200, 200)
    expect(sim.crack).toBeDefined()
    let peak = 0
    for (let i = 0; i < 60; i += 1) {
      sim.step(1 / 60)
      peak = Math.max(peak, sim.tipSpeed)
    }
    expect(peak).toBeGreaterThan(0)
    expect(sim.crack).toBeUndefined()
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
