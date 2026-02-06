/**
 * Project Discovery Service
 *
 * Scans PROJECTS_ROOT directory to find folders containing prd.json files.
 * Returns basic project info for discovered projects.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

/**
 * Schema for prd.json validation
 */
const prdJsonSchema = z.object({
  projectName: z.string().optional(),
  projectDescription: z.string().optional(),
  branchName: z.string().optional(),
}).passthrough()

/**
 * Discovered project info
 */
export interface DiscoveredProject {
  path: string
  name: string
  description: string | null
  branchName: string | null
  hasPrdJson: boolean
}

/**
 * Discovery result
 */
export interface DiscoveryResult {
  projects: DiscoveredProject[]
  projectsRoot: string
  scannedAt: Date
}

/**
 * Get the PROJECTS_ROOT path from environment
 */
function getProjectsRoot(): string {
  return process.env.PROJECTS_ROOT || './projects'
}

/**
 * Check if a directory contains a prd.json file
 */
function hasPrdJson(dirPath: string): boolean {
  const prdPath = join(dirPath, 'stories', 'prd.json')
  return existsSync(prdPath)
}

/**
 * Read and parse prd.json from a project path
 * Returns null if file doesn't exist or can't be parsed
 */
async function readPrdJson(projectPath: string): Promise<z.infer<typeof prdJsonSchema> | null> {
  const prdPath = join(projectPath, 'stories', 'prd.json')

  if (!existsSync(prdPath)) {
    return null
  }

  try {
    const content = await readFile(prdPath, 'utf-8')
    const data = JSON.parse(content)
    return prdJsonSchema.parse(data)
  } catch {
    return null
  }
}

/**
 * Discover projects in PROJECTS_ROOT directory
 *
 * Scans the PROJECTS_ROOT directory for subdirectories that contain
 * a stories/prd.json file. Returns basic project info for each discovered project.
 */
export async function discoverProjects(): Promise<DiscoveryResult> {
  const projectsRoot = getProjectsRoot()

  // Check if PROJECTS_ROOT exists
  if (!existsSync(projectsRoot)) {
    return {
      projects: [],
      projectsRoot,
      scannedAt: new Date(),
    }
  }

  // Get all entries in PROJECTS_ROOT
  const entries = readdirSync(projectsRoot)

  // Filter to directories only
  const directories = entries.filter(entry => {
    const fullPath = join(projectsRoot, entry)
    try {
      return statSync(fullPath).isDirectory()
    } catch {
      return false
    }
  })

  // Check each directory for prd.json and gather info
  const discoveredProjects: DiscoveredProject[] = []

  for (const dir of directories) {
    const fullPath = join(projectsRoot, dir)
    const hasPrd = hasPrdJson(fullPath)

    if (!hasPrd) {
      continue
    }

    // Read prd.json for project info
    const prdData = await readPrdJson(fullPath)

    discoveredProjects.push({
      path: fullPath,
      name: prdData?.projectName || dir,
      description: prdData?.projectDescription || null,
      branchName: prdData?.branchName || null,
      hasPrdJson: true,
    })
  }

  return {
    projects: discoveredProjects,
    projectsRoot,
    scannedAt: new Date(),
  }
}

/**
 * Check if a specific path is a valid project (has prd.json)
 */
export function isValidProjectPath(projectPath: string): boolean {
  if (!existsSync(projectPath)) {
    return false
  }

  try {
    if (!statSync(projectPath).isDirectory()) {
      return false
    }
  } catch {
    return false
  }

  return hasPrdJson(projectPath)
}
