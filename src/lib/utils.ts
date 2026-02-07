import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { homedir } from 'node:os'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Expands ~ in paths to the user's home directory
 *
 * @example
 * expandPath('~/Projects/app') // => '/Users/username/Projects/app'
 * expandPath('/absolute/path') // => '/absolute/path'
 * expandPath('relative/path') // => 'relative/path'
 * expandPath('~') // => '/Users/username'
 *
 * @param inputPath - The path that may contain ~ prefix
 * @returns The expanded path with ~ replaced by the home directory
 */
export function expandPath(inputPath: string): string {
  if (!inputPath) {
    return inputPath
  }

  // Check if path starts with ~
  if (inputPath === '~') {
    return homedir()
  }

  if (inputPath.startsWith('~/')) {
    return homedir() + inputPath.slice(1)
  }

  // Return unchanged for absolute or relative paths
  return inputPath
}
