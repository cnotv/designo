<script setup lang="ts">
import type { DesignNodePatch } from '@designo/core'
import { Minus, Plus, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useEditorContext } from '../composables/editorContext.ts'

const { editor } = useEditorContext()

const PERCENT = 100
const HEX_COLOR = /^#[\da-f]{6}$/i
const DEFAULT_STROKE = '#000000'
const DEFAULT_FILL = '#d9d9d9'

type NumberKey =
  'x' | 'y' | 'width' | 'height' | 'rotation' | 'cornerRadius' | 'strokeWidth' | 'fontSize'

const geometryFields: { key: NumberKey; label: string }[] = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: 'W' },
  { key: 'height', label: 'H' },
  { key: 'rotation', label: 'Rotation' }
]

const node = computed(() => {
  const [nodeId] = editor.selection.value
  return editor.selection.value.length === 1 && nodeId
    ? editor.document.value?.nodes[nodeId]
    : undefined
})

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
      </div>

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
    </template>

    <div v-else-if="editor.selection.value.length > 1" class="flex flex-col gap-2">
      <p>{{ editor.selection.value.length }} layers selected</p>
      <Button variant="outline" size="sm" @click="editor.deleteSelection"><Trash2 /> Delete</Button>
    </div>
    <p v-else class="text-muted-foreground">Select a layer to edit its properties.</p>
  </section>
</template>
