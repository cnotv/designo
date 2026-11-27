import { defineStore } from 'pinia'
import { useDesignoFiles } from '../composables/useDesignoFiles.ts'

/** The file list, the open file and how edits reach the server. */
export const useFilesStore = defineStore('files', useDesignoFiles)
