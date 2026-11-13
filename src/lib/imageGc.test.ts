import { describe, expect, it } from 'vitest'
import { IMAGE_GRACE_MS, unusedImages } from './imageGc'

describe('unusedImages', () => {
  const now = 10 * IMAGE_GRACE_MS
  const old = now - 2 * IMAGE_GRACE_MS
  const files = new Map([
    ['used', { createdAt: old }],
    ['orphan', { createdAt: old }],
    ['fresh', { createdAt: now - 1000 }],
  ])

  it('picks old pictures nothing points at', () => {
    expect(unusedImages(files, new Set(['used']), now)).toEqual(['orphan'])
  })

  it('keeps a picture that was only just uploaded', () => {
    expect(unusedImages(files, new Set(), now)).toEqual(['used', 'orphan'])
  })

  it('keeps everything when all are in use', () => {
    expect(unusedImages(files, new Set(['used', 'orphan', 'fresh']), now)).toEqual([])
  })
})
