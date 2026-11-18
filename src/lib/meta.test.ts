import { describe, expect, it } from 'vitest'
import { spikeLogIds } from './meta'

const log = (id: string, from: number, value: number) => ({ id, from, value })

describe('spikeLogIds', () => {
  it('flags a day far above the usual pace', () => {
    const ids = spikeLogIds([log('a', 0, 10), log('b', 10, 20), log('c', 20, 31), log('d', 31, 60)])
    expect([...ids]).toEqual(['d'])
  })
  it('does nothing with too little data', () => {
    expect(spikeLogIds([log('a', 0, 10), log('b', 10, 50)]).size).toBe(0)
  })
  it('does not flag an even pace', () => {
    expect(spikeLogIds([log('a', 0, 10), log('b', 10, 20), log('c', 20, 31), log('d', 31, 40)]).size).toBe(0)
  })
})
