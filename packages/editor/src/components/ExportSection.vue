<script setup lang="ts">
import { Download } from 'lucide-vue-next'
import type { AcceptableValue } from 'reka-ui'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useEditorContext } from '../composables/editorContext.ts'
import { clampExportScale, EXPORT_SCALES, getExportTargetIds } from '../editing/export.ts'
import type { ExportFormat } from '../editing/types.ts'

const { editor, exporter } = useEditorContext()
const { settings, isExporting, error } = exporter

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'svg', label: 'SVG' },
  { value: 'png', label: 'PNG' }
]

const targetCount = computed(() =>
  editor.document.value
    ? getExportTargetIds(editor.document.value, editor.selection.value).length
    : 0
)
const targetLabel = computed(() => {
  if (editor.selection.value.length === 0) return 'Exports the whole page.'
  return targetCount.value === 1
    ? 'Exports the selected layer.'
    : `Exports ${targetCount.value} layers, one file each.`
})

const setFormat = (value: AcceptableValue): void => {
  if (value === 'svg' || value === 'png') settings.value = { ...settings.value, format: value }
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
          :disabled="settings.format === 'svg'"
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
    <Button size="sm" :disabled="isExporting || !editor.document.value" @click="exporter.run">
      <Download /> Export {{ settings.format.toUpperCase() }}
    </Button>
    <p class="text-muted-foreground">{{ targetLabel }}</p>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
  </section>
</template>
