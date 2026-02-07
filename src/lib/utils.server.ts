import { homedir } from 'node:os'
import { resolve, isAbsolute } from 'node:path'

/**
 * Expands ~ in paths to the user's home directory
 * and resolves relative paths to absolute paths
 *
 * @example
 * expandPath('~/Projects/app') // => '/Users/username/Projects/app'
 * expandPath('/absolute/path') // => '/absolute/path'
 * expandPath('relative/path') // => '/current/working/dir/relative/path'
 * expandPath('~') // => '/Users/username'
 *
 * @param inputPath - The path that may contain ~ prefix or be relative
 * @returns The expanded and resolved absolute path
 */
export function expandPath(inputPath: string): string {
  if (!inputPath) {
    return inputPath
  }

  let result = inputPath

  // Check if path starts with ~
  if (result === '~') {
    result = homedir()
  } else if (result.startsWith('~/')) {
    result = homedir() + result.slice(1)
  }

  // Resolve relative paths to absolute
  if (!isAbsolute(result)) {
    result = resolve(result)
  }

  return result
}
