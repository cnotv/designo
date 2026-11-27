<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { Download, FileSearch, ScanSearch } from 'lucide-vue-next'
import type { AcceptableValue } from 'reka-ui'
import { computed, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useEditorStore } from '../stores/editor.ts'
import { useExportStore } from '../stores/export.ts'
import { clampExportScale, EXPORT_SCALES, getExportTargetIds } from '../editing/export.ts'
import { describeFindingPlace, sortFindingsBySeverity } from '../editing/atsReport.ts'
import { createMetadataOperations } from '../editing/pdfMetadata.ts'
import type { ExportFormat, ExportSettings } from '../editing/types.ts'
import type { DocumentMetadata } from '@designo/core'

const editor = useEditorStore()
const exporter = useExportStore()
const { settings, isExporting, error, atsReport, isCheckingAts } = storeToRefs(exporter)

const pdfFileInput = ref<HTMLInputElement>()

const checkChosenFile = (event: Event): void => {
  const input = event.target instanceof HTMLInputElement ? event.target : undefined
  const file = input?.files?.[0]
  if (file) void exporter.checkPdfFile(file)
  // The same file chosen again must still count as a change.
  if (input) input.value = ''
}

const STATUS_VARIANT = { fail: 'destructive', warn: 'secondary', pass: 'outline' } as const

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'svg', label: 'SVG' },
  { value: 'png', label: 'PNG' },
  { value: 'pdf', label: 'PDF' }
]

const COLOR_SPACES: { value: ExportSettings['colorSpace']; label: string }[] = [
  { value: 'rgb', label: 'RGB, for screens' },
  { value: 'cmyk', label: 'CMYK, for print' }
]

const targetCount = computed(() =>
  editor.document ? getExportTargetIds(editor.document, editor.selection).length : 0
)
const targetLabel = computed(() => {
  if (settings.value.format === 'pdf') return 'Exports every page as one PDF.'
  if (editor.selection.length === 0) return 'Exports the whole page.'
  return targetCount.value === 1
    ? 'Exports the selected layer.'
    : `Exports ${targetCount.value} layers, one file each.`
})

const METADATA_FIELDS: { field: keyof DocumentMetadata; label: string }[] = [
  { field: 'title', label: 'Title' },
  { field: 'author', label: 'Author' },
  { field: 'subject', label: 'Subject' },
  { field: 'language', label: 'Language' }
]

// Read in the template, so the title's hint follows the open file.
const getPlaceholder = (field: keyof DocumentMetadata): string =>
  ({ title: editor.document?.name ?? '', author: '', subject: '', language: 'en or de-DE' })[field]

const setMetadata = (field: keyof DocumentMetadata, event: Event): void => {
  if (editor.document)
    editor.commit(
      createMetadataOperations(editor.document, field, (event.target as HTMLInputElement).value)
    )
}

const setFormat = (value: AcceptableValue): void => {
  if (value === 'svg' || value === 'png' || value === 'pdf')
    settings.value = { ...settings.value, format: value }
}
const setColorSpace = (value: AcceptableValue): void => {
  if (value === 'rgb' || value === 'cmyk') settings.value = { ...settings.value, colorSpace: value }
}
const setScale = (value: AcceptableValue): void => {
  settings.value = { ...settings.value, scale: clampExportScale(Number(value)) }
}
</script>

<template>
  <section class="flex flex-col gap-2" aria-label="Export">
    <h2 class="text-muted-foreground font-semibold">Export</h2>
    <div class="grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1.5">
        <Label for="export-format">Format</Label>
        <Select :model-value="settings.format" @update:model-value="setFormat">
          <SelectTrigger id="export-format" size="sm" class="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="format in FORMATS" :key="format.value" :value="format.value">
              {{ format.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="export-scale">Scale</Label>
        <Select
          :model-value="String(settings.scale)"
          :disabled="settings.format !== 'png'"
          @update:model-value="setScale"
        >
          <SelectTrigger id="export-scale" size="sm" class="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="scale in EXPORT_SCALES" :key="scale" :value="String(scale)">
              {{ scale }}x
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    <div v-if="settings.format === 'pdf' && editor.document" class="flex flex-col gap-2">
      <div v-for="item in METADATA_FIELDS" :key="item.field" class="flex flex-col gap-1.5">
        <Label :for="`pdf-${item.field}`">{{ item.label }}</Label>
        <Input
          :id="`pdf-${item.field}`"
          :model-value="editor.document.metadata?.[item.field] ?? ''"
          :placeholder="getPlaceholder(item.field)"
          class="h-7 text-xs"
          @change="setMetadata(item.field, $event)"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="pdf-color-space">Colour</Label>
        <Select :model-value="settings.colorSpace" @update:model-value="setColorSpace">
          <SelectTrigger id="pdf-color-space" size="sm" class="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="space in COLOR_SPACES" :key="space.value" :value="space.value">
              {{ space.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="pdf-trim-marks"
          :model-value="settings.trimMarks"
          @update:model-value="settings.trimMarks = $event === true"
        />
        <Label for="pdf-trim-marks">Trim marks</Label>
      </div>
      <p class="text-muted-foreground">
        A page with bleed gets a bleed box and a trim box. Trim marks add room beyond the bleed.
        CMYK converts shapes, gradients and text without a colour profile; images stay as they are.
      </p>
      <p class="text-muted-foreground">
        Text set as a heading, paragraph or list item is tagged for screen readers, in the order of
        its frame's layers.
      </p>
    </div>
    <div v-if="settings.format === 'pdf'" class="flex flex-col gap-2">
      <Button
        size="sm"
        variant="outline"
        :disabled="isCheckingAts || !editor.document"
        @click="exporter.checkAts"
      >
        <ScanSearch /> {{ isCheckingAts ? 'Checking...' : 'Check for ATS' }}
      </Button>
      <Button size="sm" variant="outline" :disabled="isCheckingAts" @click="pdfFileInput?.click()">
        <FileSearch /> Check a PDF file
      </Button>
      <input
        ref="pdfFileInput"
        type="file"
        accept="application/pdf,.pdf"
        class="hidden"
        aria-label="PDF file to check"
        @change="checkChosenFile"
      />
      <section v-if="atsReport" class="flex flex-col gap-1.5" aria-label="ATS report">
        <p class="text-muted-foreground">
          {{ atsReport.summary.fail }} failed, {{ atsReport.summary.warn }} warnings,
          {{ atsReport.summary.pass }} passed. Read with pdf.js and Designo's own rules, not a real
          ATS.
        </p>
        <ul class="flex flex-col gap-1.5">
          <li
            v-for="(finding, index) in sortFindingsBySeverity(atsReport.findings)"
            :key="index"
            class="flex items-start gap-2"
          >
            <Badge :variant="STATUS_VARIANT[finding.status]">{{ finding.status }}</Badge>
            <span>
              <span class="font-medium">{{ finding.rule }}</span><template
                v-if="describeFindingPlace(editor.document, finding)"
              >
                ({{ describeFindingPlace(editor.document, finding) }})</template
              >: {{ finding.message }}
            </span>
          </li>
          <li
            v-for="entry in atsReport.notChecked"
            :key="entry.rule"
            class="flex items-start gap-2"
          >
            <Badge variant="outline">not checked</Badge>
            <span>
              <span class="font-medium">{{ entry.rule }}</span>: {{ entry.reason }}
            </span>
          </li>
        </ul>
      </section>
    </div>
    <Button size="sm" :disabled="isExporting || !editor.document" @click="exporter.run">
      <Download /> Export {{ settings.format.toUpperCase() }}
    </Button>
    <p class="text-muted-foreground">{{ targetLabel }}</p>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
  </section>
</template>
