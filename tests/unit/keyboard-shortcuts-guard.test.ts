// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { shouldHandleKey } from '@/components/source/KeyboardShortcuts'

describe('shouldHandleKey', () => {
  it('returns true for null target', () => {
    expect(shouldHandleKey(null)).toBe(true)
  })
  it('returns true for non-form elements (e.g., body, div)', () => {
    expect(shouldHandleKey(document.body)).toBe(true)
    const div = document.createElement('div')
    expect(shouldHandleKey(div)).toBe(true)
  })
  it('returns false when focus is on an <input> (e.g., volume slider)', () => {
    const input = document.createElement('input')
    input.type = 'range'
    expect(shouldHandleKey(input)).toBe(false)
  })
  it('returns false when focus is on a <textarea>', () => {
    expect(shouldHandleKey(document.createElement('textarea'))).toBe(false)
  })
  it('returns false when focus is on a <select>', () => {
    expect(shouldHandleKey(document.createElement('select'))).toBe(false)
  })
  it('returns false when focus is on a contentEditable element', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    expect(shouldHandleKey(div)).toBe(false)
  })
})
