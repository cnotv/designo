<script setup lang="ts">
import type { DesignNodePatch } from '@designo/core'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Italic,
  Minus,
  Plus,
  Trash2
} from 'lucide-vue-next'
import { computed, useTemplateRef, watch, type Component } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import AlignmentControls from './AlignmentControls.vue'
import { useEditorContext } from '../composables/editorContext.ts'
import { useFontFamilyList } from '../composables/fontFamilyList.ts'
import { useImageInsertion } from '../composables/useImageInsertion.ts'
import { findPickedFamily } from '../editing/fontPicker.ts'
import {
  LAYOUT_ALIGN_OPTIONS,
  LAYOUT_CROSS_ALIGN_OPTIONS,
  LAYOUT_MODE_OPTIONS,
  readLayoutAlign,
  readLayoutCrossAlign,
  readLayoutMode,
  readLayoutSizing,
  sizingOptionsFor
} from '../editing/autoLayout.ts'
import { IMAGE_FIT_OPTIONS, readImageFit } from '../editing/images.ts'
import { readPdfPageInput } from '../editing/pdfPage.ts'
import {
  getFontWeightOptions,
  isItalicAvailable,
  readFontWeight,
  readLetterSpacingInput,
  readLineHeightInput,
  readTextAlign,
  readTextWidthMode,
  TEXT_ALIGN_OPTIONS,
  TEXT_WIDTH_MODE_OPTIONS,
  textWidthModeOf
} from '../editing/textProperties.ts'
import EffectsSection from './EffectsSection.vue'
import ExportSection from './ExportSection.vue'
import FontPicker from './FontPicker.vue'
import PageSetupSection from './PageSetupSection.vue'

const { editor, files } = useEditorContext()

const PERCENT = 100
const HEX_COLOR = /^#[\da-f]{6}$/i
const DEFAULT_STROKE = '#000000'
const DEFAULT_FILL = '#d9d9d9'

type NumberKey =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'cornerRadius'
  | 'strokeWidth'
  | 'fontSize'
  | 'layoutGap'
  | 'layoutPadding'

const geometryFields: { key: NumberKey; label: string }[] = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: 'W' },
  { key: 'height', label: 'H' },
  { key: 'rotation', label: 'Rotation' }
]

const ALIGN_ICONS: Record<string, Component> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify
}

const node = computed(() => {
  const [nodeId] = editor.selection.value
  return editor.selection.value.length === 1 && nodeId
    ? editor.document.value?.nodes[nodeId]
    : undefined
})

const { replaceImageFile } = useImageInsertion(editor, files)
const replaceInput = useTemplateRef<HTMLInputElement>('replaceInput')

const onReplacementChosen = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const [file] = input.files ?? []
  input.value = ''
  if (file && node.value) void replaceImageFile(node.value.id, file)
}

const fontFamilyList = useFontFamilyList()

// The list says which weights and styles a family has; it loads once, when a text is selected.
watch(
  () => node.value?.type === 'text',
  (isText) => {
    if (isText) void fontFamilyList.load()
  },
  { immediate: true }
)

const pickedFamily = computed(() =>
  node.value ? findPickedFamily(fontFamilyList.families.value, node.value.fontFamily) : undefined
)

const fontWeightOptions = computed(() =>
  node.value ? getFontWeightOptions(pickedFamily.value?.weights ?? [], node.value.fontWeight) : []
)

const italicAvailable = computed(() =>
  node.value ? isItalicAvailable(pickedFamily.value?.styles ?? [], node.value.fontStyle) : true
)

const parentNode = computed(() =>
  node.value?.parentId ? editor.document.value?.nodes[node.value.parentId] : undefined
)

const sizingFields = computed(() =>
  node.value
    ? (
        [
          { key: 'widthSizing', label: 'Width', current: node.value.widthSizing },
          { key: 'heightSizing', label: 'Height', current: node.value.heightSizing }
        ] as const
      ).map((field) => ({
        ...field,
        options: sizingOptionsFor(
          node.value as NonNullable<typeof node.value>,
          parentNode.value,
          field.current
        )
      }))
    : []
)

const updateSizing = (key: 'widthSizing' | 'heightSizing', raw: unknown): void => {
  const sizing = readLayoutSizing(raw)
  if (sizing) update({ [key]: sizing })
}

const updateImageFit = (raw: unknown): void => {
  const imageFit = readImageFit(raw)
  if (imageFit) update({ imageFit })
}

const updateLayoutMode = (raw: unknown): void => {
  const layoutMode = readLayoutMode(raw)
  if (layoutMode) update({ layoutMode })
}

const updateLayoutAlign = (raw: unknown): void => {
  const layoutAlign = readLayoutAlign(raw)
  if (layoutAlign) update({ layoutAlign })
}

const updateLayoutCrossAlign = (raw: unknown): void => {
  const layoutCrossAlign = readLayoutCrossAlign(raw)
  if (layoutCrossAlign) update({ layoutCrossAlign })
}

const update = (patch: DesignNodePatch): void => {
  if (node.value) editor.updateNode(node.value.id, patch)
}

const inputValue = (event: Event): string => (event.target as HTMLInputElement).value

// An empty or half-typed number leaves the property as it was.
const updateNumber = (key: NumberKey, event: Event, minimum = Number.NEGATIVE_INFINITY): void => {
  const value = Number(inputValue(event))
  if (inputValue(event).trim() !== '' && Number.isFinite(value))
    update({ [key]: Math.max(minimum, value) })
}

const updateTextAlign = (raw: unknown): void => {
  const textAlign = readTextAlign(raw)
  if (textAlign) update({ textAlign })
}

const updateTextWidthMode = (raw: unknown): void => {
  const mode = readTextWidthMode(raw)
  if (mode) update({ textWrap: mode === 'fixed' })
}

const updateFontWeight = (raw: unknown): void => {
  const fontWeight = readFontWeight(raw)
  if (fontWeight !== undefined) update({ fontWeight })
}

const updateLetterSpacing = (event: Event): void => {
  const letterSpacing = readLetterSpacingInput(inputValue(event))
  if (letterSpacing !== undefined) update({ letterSpacing })
}

const updateLineHeight = (event: Event): void => {
  const lineHeight = readLineHeightInput(inputValue(event))
  if (lineHeight !== undefined) update({ lineHeight })
}

const updatePdfPage = (event: Event): void => {
  const pdfPage = readPdfPageInput(inputValue(event))
  if (pdfPage !== undefined) update({ pdfPage })
}

const updateOpacity = (event: Event): void => {
  const percent = Number(inputValue(event))
  if (Number.isFinite(percent)) update({ opacity: Math.min(1, Math.max(0, percent / PERCENT)) })
}

const updateColor = (key: 'fill' | 'stroke', event: Event): void => {
  const value = inputValue(event).trim()
  const color = value.startsWith('#') ? value : `#${value}`
  if (HEX_COLOR.test(color)) update({ [key]: color.toLowerCase() })
}

const showsCornerRadius = computed(
  () => node.value?.type === 'rectangle' || node.value?.type === 'frame'
)
const opacityPercent = computed(() => Math.round((node.value?.opacity ?? 1) * PERCENT))
</script>

<template>
  <section class="flex flex-col gap-3 p-3" aria-label="Properties">
    <template v-if="node">
      <AlignmentControls />
      <Separator />
      <div class="flex flex-col gap-1.5">
        <Label for="property-name">Name</Label>
        <Input
          id="property-name"
          :model-value="node.name"
          class="h-7 text-xs"
          @change="update({ name: inputValue($event) })"
        />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div v-for="field in geometryFields" :key="field.key" class="flex flex-col gap-1.5">
          <Label :for="`property-${field.key}`">{{ field.label }}</Label>
          <Input
            :id="`property-${field.key}`"
            type="number"
            :model-value="Math.round(node[field.key] * 100) / 100"
            class="h-7 text-xs tabular-nums"
            @change="
              updateNumber(
                field.key,
                $event,
                field.key === 'width' || field.key === 'height' ? 1 : undefined
              )
            "
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="property-opacity">Opacity %</Label>
          <Input
            id="property-opacity"
            type="number"
            min="0"
            max="100"
            :model-value="opacityPercent"
            class="h-7 text-xs tabular-nums"
            @change="updateOpacity"
          />
        </div>
        <div v-if="showsCornerRadius" class="flex flex-col gap-1.5">
          <Label for="property-corner-radius">Radius</Label>
          <Input
            id="property-corner-radius"
            type="number"
            min="0"
            :model-value="node.cornerRadius"
            class="h-7 text-xs tabular-nums"
            @change="updateNumber('cornerRadius', $event, 0)"
          />
        </div>
        <div v-if="node.type === 'frame'" class="flex flex-col gap-1.5">
          <Label for="property-pdf-page">PDF page</Label>
          <Input
            id="property-pdf-page"
            type="number"
            min="1"
            placeholder="None"
            :model-value="node.pdfPage ?? ''"
            class="h-7 text-xs tabular-nums"
            @change="updatePdfPage"
          />
        </div>
      </div>

      <template v-if="node.type === 'frame'">
        <Separator />
        <div class="flex flex-col gap-1.5">
          <Label>Auto layout</Label>
          <ToggleGroup
            type="single"
            size="sm"
            aria-label="Layout direction"
            :model-value="node.layoutMode"
            @update:model-value="updateLayoutMode"
          >
            <ToggleGroupItem
              v-for="option in LAYOUT_MODE_OPTIONS"
              :key="option.value"
              :value="option.value"
              :aria-label="option.label"
              class="px-2 text-xs"
            >
              {{ option.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div v-if="node.layoutMode !== 'none'" class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1.5">
            <Label for="property-layout-gap">Gap</Label>
            <Input
              id="property-layout-gap"
              type="number"
              min="0"
              :model-value="node.layoutGap"
              class="h-7 text-xs tabular-nums"
              @change="updateNumber('layoutGap', $event, 0)"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="property-layout-padding">Padding</Label>
            <Input
              id="property-layout-padding"
              type="number"
              min="0"
              :model-value="node.layoutPadding"
              class="h-7 text-xs tabular-nums"
              @change="updateNumber('layoutPadding', $event, 0)"
            />
          </div>
          <Select :model-value="node.layoutAlign" @update:model-value="updateLayoutAlign">
            <SelectTrigger class="h-7 text-xs" aria-label="Align along the layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in LAYOUT_ALIGN_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select :model-value="node.layoutCrossAlign" @update:model-value="updateLayoutCrossAlign">
            <SelectTrigger class="h-7 text-xs" aria-label="Align across the layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in LAYOUT_CROSS_ALIGN_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </template>

      <template v-if="node.type === 'frame' || (parentNode && parentNode.layoutMode !== 'none')">
        <div class="grid grid-cols-2 gap-2">
          <Select
            v-for="field in sizingFields"
            :key="field.key"
            :model-value="field.current"
            @update:model-value="updateSizing(field.key, $event)"
          >
            <SelectTrigger class="h-7 text-xs" :aria-label="`${field.label} sizing`">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in field.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </template>

      <template v-if="node.type === 'image'">
        <Separator />
        <div class="flex flex-col gap-1.5">
          <Label for="property-image">Image</Label>
          <Button
            id="property-image"
            variant="outline"
            size="sm"
            :disabled="files.isDemo.value"
            @click="replaceInput?.click()"
          >
            Replace image
          </Button>
          <input
            ref="replaceInput"
            type="file"
            class="hidden"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Replacement image file"
            @change="onReplacementChosen"
          />
          <Label for="property-image-fit">Fit</Label>
          <Select :model-value="node.imageFit" @update:model-value="updateImageFit">
            <SelectTrigger id="property-image-fit" class="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in IMAGE_FIT_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </template>

      <template v-if="node.type === 'text'">
        <Separator />
        <div class="flex flex-col gap-1.5">
          <Label for="property-text">Text</Label>
          <Textarea
            id="property-text"
            :model-value="node.text"
            class="min-h-14 text-xs"
            @change="update({ text: inputValue($event) })"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="property-font-family">Font</Label>
          <FontPicker
            id="property-font-family"
            :font-family="node.fontFamily"
            @pick="update({ fontFamily: $event })"
          />
        </div>
        <div class="flex gap-2">
          <Select :model-value="String(node.fontWeight)" @update:model-value="updateFontWeight">
            <SelectTrigger class="h-7 flex-1 text-xs" aria-label="Font weight">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in fontWeightOptions"
                :key="option.value"
                :value="String(option.value)"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Toggle
            size="sm"
            aria-label="Italic"
            title="Italic"
            :disabled="!italicAvailable"
            :model-value="node.fontStyle === 'italic'"
            @update:model-value="update({ fontStyle: $event ? 'italic' : 'normal' })"
          >
            <Italic />
          </Toggle>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="property-font-size">Font size</Label>
          <Input
            id="property-font-size"
            type="number"
            min="1"
            :model-value="node.fontSize"
            class="h-7 text-xs tabular-nums"
            @change="updateNumber('fontSize', $event, 1)"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="property-line-height">Line height</Label>
          <Input
            id="property-line-height"
            type="number"
            min="0.5"
            max="10"
            step="0.1"
            :model-value="node.lineHeight"
            class="h-7 text-xs tabular-nums"
            @change="updateLineHeight"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="property-letter-spacing">Letter spacing (%)</Label>
          <Input
            id="property-letter-spacing"
            type="number"
            min="-50"
            max="200"
            step="1"
            :model-value="Math.round(node.letterSpacing * 100)"
            class="h-7 text-xs tabular-nums"
            @change="updateLetterSpacing"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            aria-label="Text alignment"
            :model-value="node.textAlign"
            @update:model-value="updateTextAlign"
          >
            <!-- No Tooltip around an item: its trigger would overwrite the item's pressed state. -->
            <ToggleGroupItem
              v-for="option in TEXT_ALIGN_OPTIONS"
              :key="option.value"
              :value="option.value"
              :aria-label="option.label"
              :title="option.label"
            >
              <component :is="ALIGN_ICONS[option.value]" />
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            size="sm"
            aria-label="Text width"
            :model-value="textWidthModeOf(node)"
            @update:model-value="updateTextWidthMode"
          >
            <ToggleGroupItem
              v-for="option in TEXT_WIDTH_MODE_OPTIONS"
              :key="option.value"
              :value="option.value"
              :aria-label="option.label"
              class="px-2 text-xs"
            >
              {{ option.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </template>

      <Separator />
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <Label :for="node.fill ? 'property-fill' : undefined">Fill</Label>
          <Button
            v-if="node.fill"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove fill"
            @click="update({ fill: null })"
            ><Minus
          /></Button>
          <Button
            v-else
            variant="ghost"
            size="icon-xs"
            aria-label="Add fill"
            @click="update({ fill: DEFAULT_FILL })"
            ><Plus
          /></Button>
        </div>
        <div v-if="node.fill" class="flex gap-2">
          <Input
            type="color"
            aria-label="Fill colour"
            :model-value="node.fill.slice(0, 7)"
            class="h-7 w-9 shrink-0 p-0.5"
            @change="updateColor('fill', $event)"
          />
          <Input
            id="property-fill"
            :model-value="node.fill"
            class="h-7 font-mono text-xs"
            @change="updateColor('fill', $event)"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <Label :for="node.stroke ? 'property-stroke' : undefined">Stroke</Label>
          <Button
            v-if="node.stroke"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove stroke"
            @click="update({ stroke: null })"
            ><Minus
          /></Button>
          <Button
            v-else
            variant="ghost"
            size="icon-xs"
            aria-label="Add stroke"
            @click="update({ stroke: DEFAULT_STROKE })"
            ><Plus
          /></Button>
        </div>
        <div v-if="node.stroke" class="flex gap-2">
          <Input
            type="color"
            aria-label="Stroke colour"
            :model-value="node.stroke.slice(0, 7)"
            class="h-7 w-9 shrink-0 p-0.5"
            @change="updateColor('stroke', $event)"
          />
          <Input
            id="property-stroke"
            :model-value="node.stroke"
            class="h-7 font-mono text-xs"
            @change="updateColor('stroke', $event)"
          />
          <Input
            type="number"
            min="0"
            aria-label="Stroke width"
            :model-value="node.strokeWidth"
            class="h-7 w-14 shrink-0 text-xs tabular-nums"
            @change="updateNumber('strokeWidth', $event, 0)"
          />
        </div>
      </div>
      <Separator />
      <EffectsSection :node="node" @update="update" />
      <template v-if="node.type === 'frame'">
        <Separator />
        <PageSetupSection :node="node" @update="update" />
      </template>
    </template>

    <div v-else-if="editor.selection.value.length > 1" class="flex flex-col gap-2">
      <p>{{ editor.selection.value.length }} layers selected</p>
      <AlignmentControls />
      <Button variant="outline" size="sm" @click="editor.deleteSelection"><Trash2 /> Delete</Button>
    </div>
    <p v-else class="text-muted-foreground">Select a layer to edit its properties.</p>

    <Separator />
    <ExportSection />
  </section>
</template>
