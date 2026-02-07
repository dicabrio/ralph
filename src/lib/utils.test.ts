import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cn } from './utils'
import { homedir } from 'node:os'

// Get real homedir for use in tests
const realHomeDir = homedir()

describe('cn utility', () => {
  it('should merge class names', () => {
    const result = cn('foo', 'bar')
    expect(result).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    const result = cn('base', true && 'active', false && 'disabled')
    expect(result).toBe('base active')
  })

  it('should merge tailwind classes correctly', () => {
    const result = cn('px-2 py-1', 'px-4')
    expect(result).toBe('py-1 px-4')
  })

  it('should handle arrays', () => {
    const result = cn(['foo', 'bar'])
    expect(result).toBe('foo bar')
  })

  it('should handle objects', () => {
    const result = cn({ active: true, disabled: false })
    expect(result).toBe('active')
  })

  it('should return empty string for no classes', () => {
    const result = cn()
    expect(result).toBe('')
  })
})

describe('expandPath utility', () => {
  // Dynamically import expandPath so we can test with real homedir
  let expandPath: (inputPath: string) => string

  beforeEach(async () => {
    const utils = await import('./utils.server')
    expandPath = utils.expandPath
  })

  it('should expand ~ to home directory', () => {
    const result = expandPath('~')
    expect(result).toBe(realHomeDir)
  })

  it('should expand ~/path to home directory path', () => {
    const result = expandPath('~/Projects/app')
    expect(result).toBe(`${realHomeDir}/Projects/app`)
  })

  it('should expand ~/nested/path correctly', () => {
    const result = expandPath('~/Projects/subfolder/app')
    expect(result).toBe(`${realHomeDir}/Projects/subfolder/app`)
  })

  it('should leave absolute paths unchanged', () => {
    const result = expandPath('/absolute/path')
    expect(result).toBe('/absolute/path')
  })

  it('should leave absolute paths with multiple levels unchanged', () => {
    const result = expandPath('/Users/someone/Projects/app')
    expect(result).toBe('/Users/someone/Projects/app')
  })

  it('should leave relative paths unchanged', () => {
    const result = expandPath('relative/path')
    expect(result).toBe('relative/path')
  })

  it('should leave current directory relative paths unchanged', () => {
    const result = expandPath('./relative/path')
    expect(result).toBe('./relative/path')
  })

  it('should leave parent directory relative paths unchanged', () => {
    const result = expandPath('../parent/path')
    expect(result).toBe('../parent/path')
  })

  it('should return empty string for empty input', () => {
    const result = expandPath('')
    expect(result).toBe('')
  })

  it('should not expand ~ in the middle of a path', () => {
    const result = expandPath('/some/path/~user')
    expect(result).toBe('/some/path/~user')
  })

  it('should handle paths with ~ but not at start', () => {
    const result = expandPath('path/with/~/tilde')
    expect(result).toBe('path/with/~/tilde')
  })

  it('should handle ~/. correctly', () => {
    const result = expandPath('~/.')
    expect(result).toBe(`${realHomeDir}/.`)
  })

  it('should handle ~/ with trailing slash', () => {
    const result = expandPath('~/')
    expect(result).toBe(`${realHomeDir}/`)
  })
})
