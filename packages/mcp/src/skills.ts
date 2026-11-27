import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SkillContent, SkillSummary } from './types.ts'

/** The skills that ship with the server, one folder each with a SKILL.md. */
export const BUNDLED_SKILLS_FOLDER = fileURLToPath(new URL('../skills', import.meta.url))

const SKILL_FILE = 'SKILL.md'

// A folder that does not exist is a server with no skills, not a failure.
const readDirectoryOrNothing = (folder: string) =>
  readdir(folder, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) =>
    error.code === 'ENOENT' ? [] : Promise.reject(error)
  )

const readDescription = (skillText: string): string => {
  const frontmatter = skillText.split('---')[1] ?? ''
  const folded = frontmatter.match(/^description:\s*>-?\n((?:[\t ]+.*\n?)+)/m)?.[1]
  const inline = frontmatter.match(/^description:[\t ]*([^\n>].*)$/m)?.[1]
  return (folded ?? inline ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
}

const listSkillFiles = async (skillFolder: string): Promise<string[]> => {
  const entries = await readdir(skillFolder, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(skillFolder, path.join(entry.parentPath, entry.name)))
    .sort()
}

/**
 * Lists the skills a folder holds, with what each is for and the files it carries.
 * @param folder - The folder of skill folders; the bundled skills by default.
 * @returns One summary per skill, by name.
 */
export const listSkillsTool = async (
  folder: string = BUNDLED_SKILLS_FOLDER
): Promise<SkillSummary[]> => {
  const entries = await readDirectoryOrNothing(folder)
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async ({ name }) => {
        const skillFolder = path.join(folder, name)
        const [skillText, files] = await Promise.all([
          readFile(path.join(skillFolder, SKILL_FILE), 'utf8'),
          listSkillFiles(skillFolder)
        ])
        return { name, description: readDescription(skillText), files }
      })
  )
  return skills.toSorted((first, second) => first.name.localeCompare(second.name))
}

/**
 * Reads one file of a skill. The file must be one the skill lists, so no path can reach outside it.
 * @param folder - The folder of skill folders.
 * @param input - The skill name, and a file of it (SKILL.md when left out).
 * @returns The file's text and the files the skill carries.
 */
export const getSkillTool = async (
  folder: string,
  input: { name: string; file?: string }
): Promise<SkillContent> => {
  const skills = await listSkillsTool(folder)
  const skill = skills.find((candidate) => candidate.name === input.name)
  if (!skill) {
    const names = skills.map((candidate) => candidate.name).join(', ')
    throw new Error(`No skill named ${input.name}. Skills: ${names}`)
  }
  const file = input.file ?? SKILL_FILE
  if (!skill.files.includes(file)) {
    throw new Error(`Skill ${skill.name} has no file ${file}. Files: ${skill.files.join(', ')}`)
  }
  return {
    name: skill.name,
    file,
    content: await readFile(path.join(folder, skill.name, file), 'utf8'),
    files: skill.files
  }
}
