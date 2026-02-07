/**
 * Project Context Loader
 *
 * Loads relevant project files to provide context for AI brainstorming.
 * Files are loaded inline into the prompt since OpenAI API has no filesystem access.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

// Maximum characters for project context (roughly ~4000 tokens)
const MAX_CONTEXT_CHARS = 16000

// Files to prioritize loading
const PRIORITY_FILES = [
  'package.json',
  'README.md',
  'CLAUDE.md',
  'tsconfig.json',
  'stories/prd.json',
]

// Directories to include in tree (relative to project root)
const TREE_DIRS = ['src', 'app', 'lib', 'components', 'pages', 'api']

// Files/directories to exclude from tree
const TREE_EXCLUDES = ['node_modules', '.git', 'dist', 'build', '.next', '.output', 'coverage']

/**
 * Project context result
 */
export interface ProjectContext {
  files: { path: string; content: string }[]
  tree: string
  totalChars: number
}

/**
 * Load project context for AI brainstorming
 *
 * @param projectPath - Absolute path to the project
 * @returns Project context with key files and folder structure
 */
export async function loadProjectContext(projectPath: string): Promise<ProjectContext> {
  const files: { path: string; content: string }[] = []
  let totalChars = 0

  // Load priority files first
  for (const filename of PRIORITY_FILES) {
    const filePath = join(projectPath, filename)
    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, 'utf-8')
        // Truncate very large files
        const truncatedContent = content.length > 4000
          ? content.slice(0, 4000) + '\n... (truncated)'
          : content

        if (totalChars + truncatedContent.length <= MAX_CONTEXT_CHARS) {
          files.push({ path: filename, content: truncatedContent })
          totalChars += truncatedContent.length
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  // Generate folder tree
  const tree = await generateFolderTree(projectPath)
  totalChars += tree.length

  return { files, tree, totalChars }
}

/**
 * Generate a folder tree string for the project
 */
async function generateFolderTree(projectPath: string, maxDepth: number = 3): Promise<string> {
  const lines: string[] = ['Project structure:']

  async function walkDir(dir: string, prefix: string = '', depth: number = 0): Promise<void> {
    if (depth > maxDepth) return

    try {
      const entries = await readdir(dir, { withFileTypes: true })

      // Sort: directories first, then files
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

      // Filter excluded entries
      const filtered = sorted.filter(entry => !TREE_EXCLUDES.includes(entry.name))

      for (let i = 0; i < filtered.length; i++) {
        const entry = filtered[i]
        const isLast = i === filtered.length - 1
        const connector = isLast ? '└── ' : '├── '
        const childPrefix = isLast ? '    ' : '│   '

        if (entry.isDirectory()) {
          lines.push(`${prefix}${connector}${entry.name}/`)

          // Only recurse into relevant directories
          const shouldRecurse = depth < maxDepth && (
            depth === 0 || // Always recurse at root level
            TREE_DIRS.some(d => entry.name === d || d.startsWith(entry.name + '/'))
          )

          if (shouldRecurse) {
            await walkDir(join(dir, entry.name), prefix + childPrefix, depth + 1)
          }
        } else {
          // Only show certain file types
          if (shouldIncludeFile(entry.name)) {
            lines.push(`${prefix}${connector}${entry.name}`)
          }
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  await walkDir(projectPath)

  return lines.join('\n')
}

/**
 * Check if a file should be included in the tree
 */
function shouldIncludeFile(filename: string): boolean {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.yaml', '.yml']
  const exactMatches = ['package.json', 'tsconfig.json', 'README.md', 'CLAUDE.md', '.env.example']

  if (exactMatches.includes(filename)) return true
  return extensions.some(ext => filename.endsWith(ext))
}

/**
 * Format project context as a string for the prompt
 */
export function formatProjectContext(context: ProjectContext): string {
  const parts: string[] = []

  // Add folder tree
  if (context.tree) {
    parts.push('## Project Structure\n')
    parts.push('```')
    parts.push(context.tree)
    parts.push('```\n')
  }

  // Add key files
  if (context.files.length > 0) {
    parts.push('## Key Files\n')
    for (const file of context.files) {
      parts.push(`### ${file.path}\n`)
      parts.push('```')
      parts.push(file.content)
      parts.push('```\n')
    }
  }

  return parts.join('\n')
}
