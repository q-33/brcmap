import { describe, expect, it } from 'vitest'
import { renderBroadcastHtml } from './email'

// 440 people click these links. A swallowed parenthesis is a broken PDF for
// every one of them — which is exactly what happened in draft review.
describe('broadcast autolinker', () => {
  it('links a bare URL', () => {
    expect(renderBroadcastHtml('see https://brcmap.net/x')).toContain('href="https://brcmap.net/x"')
  })
  it('leaves trailing punctuation as prose', () => {
    const h = renderBroadcastHtml('report: https://brcmap.net/aar-2026.pdf)')
    expect(h).toContain('href="https://brcmap.net/aar-2026.pdf"')
    expect(h).not.toContain('href="https://brcmap.net/aar-2026.pdf)"')
  })
  it('handles sentence-final URLs and commas', () => {
    const h = renderBroadcastHtml('go to https://brcmap.net/resto, then https://brcmap.net/rides.')
    expect(h).toContain('href="https://brcmap.net/resto"')
    expect(h).toContain('href="https://brcmap.net/rides"')
  })
  it('keeps query strings intact', () => {
    expect(renderBroadcastHtml('https://brcmap.net/?lat=1&lng=2')).toContain('href="https://brcmap.net/?lat=1&amp;lng=2"')
  })
})
