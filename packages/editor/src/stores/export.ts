import { defineStore } from 'pinia'
import { useExport } from '../composables/useExport.ts'
import { useEditorStore } from './editor.ts'

/** The export settings, the running export and the last ATS report. */
export const useExportStore = defineStore('export', () => useExport(useEditorStore()))
