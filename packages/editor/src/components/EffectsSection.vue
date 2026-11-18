<script setup lang="ts">
import { hasLayerEffects, type DesignNode, type DesignNodePatch } from '@designo/core'
import { Minus, Plus } from 'lucide-vue-next'
import { computed } from 'vue'
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
import {
  BLEND_MODE_OPTIONS,
  createDefaultGradient,
  createDefaultShadow,
  keepAlpha,
  readBlendMode,
  withStopColor
} from '../editing/effectProperties.ts'

const props = defineProps<{ node: DesignNode }>()
const emit = defineEmits<{ update: [patch: DesignNodePatch] }>()

const HEX_COLOR = /^#[\da-f]{6}$/i
const GRADIENT_KINDS = ['linear', 'radial'] as const

const takesGradient = computed(() => props.node.type !== 'text' && props.node.type !== 'group')
const takesLayerEffects = computed(() => hasLayerEffects(props.node))

const inputValue = (event: Event): string => (event.target as HTMLInputElement).value

const readNumber = (event: Event, minimum: number): number | undefined => {
  const raw = inputValue(event)
  const value = Number(raw)
  return raw.trim() !== '' && Number.isFinite(value) ? Math.max(minimum, value) : undefined
}

const updateBlur = (event: Event): void => {
  const blur = readNumber(event, 0)
  if (blur !== undefined) emit('update', { blur })
}

const updateBlendMode = (raw: unknown): void => {
  const blendMode = readBlendMode(raw)
  if (blendMode) emit('update', { blendMode })
}

const updateGradientKind = (raw: unknown): void => {
  const kind = GRADIENT_KINDS.find((candidate) => candidate === raw)
  if (kind && props.node.gradient) emit('update', { gradient: { ...props.node.gradient, kind } })
}

const updateGradientAngle = (event: Event): void => {
  const angle = readNumber(event, Number.NEGATIVE_INFINITY)
  if (angle !== undefined && props.node.gradient)
    emit('update', { gradient: { ...props.node.gradient, angle } })
}

const updateStopColor = (index: number, event: Event): void => {
  const color = inputValue(event).trim()
  if (HEX_COLOR.test(color) && props.node.gradient)
    emit('update', { gradient: withStopColor(props.node.gradient, index, color.toLowerCase()) })
}

const updateShadowNumber = (key: 'x' | 'y' | 'blur', event: Event): void => {
  const value = readNumber(event, key === 'blur' ? 0 : Number.NEGATIVE_INFINITY)
  if (value !== undefined && props.node.shadow)
    emit('update', { shadow: { ...props.node.shadow, [key]: value } })
}

const updateShadowColor = (event: Event): void => {
  const color = inputValue(event).trim()
  if (HEX_COLOR.test(color) && props.node.shadow)
    emit('update', {
      shadow: {
        ...props.node.shadow,
        color: keepAlpha(props.node.shadow.color, color.toLowerCase())
      }
    })
}
</script>

<template>
  <div class="flex flex-col gap-3" aria-label="Effects">
    <div v-if="takesGradient" class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <Label>Gradient</Label>
        <Button
          v-if="node.gradient"
          variant="ghost"
          size="icon-xs"
          aria-label="Remove gradient"
          @click="emit('update', { gradient: null })"
          ><Minus
        /></Button>
        <Button
          v-else
          variant="ghost"
          size="icon-xs"
          aria-label="Add gradient"
          @click="emit('update', { gradient: createDefaultGradient(node) })"
          ><Plus
        /></Button>
      </div>
      <template v-if="node.gradient">
        <div class="flex gap-2">
          <Select :model-value="node.gradient.kind" @update:model-value="updateGradientKind">
            <SelectTrigger class="h-7 flex-1 text-xs" aria-label="Gradient type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="kind in GRADIENT_KINDS" :key="kind" :value="kind">
                {{ kind }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            v-if="node.gradient.kind === 'linear'"
            type="number"
            aria-label="Gradient angle"
            :model-value="node.gradient.angle"
            class="h-7 w-16 shrink-0 text-xs tabular-nums"
            @change="updateGradientAngle"
          />
        </div>
        <div class="flex gap-2">
          <Input
            v-for="(stop, index) in node.gradient.stops"
            :key="index"
            type="color"
            :aria-label="`Gradient stop ${index + 1} colour`"
            :model-value="stop.color.slice(0, 7)"
            class="h-7 min-w-0 flex-1 p-0.5"
            @change="updateStopColor(index, $event)"
          />
        </div>
      </template>
    </div>

    <template v-if="takesLayerEffects">
      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col gap-1.5">
          <Label for="property-blur">Blur</Label>
          <Input
            id="property-blur"
            type="number"
            min="0"
            :model-value="node.blur"
            class="h-7 text-xs tabular-nums"
            @change="updateBlur"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Blend</Label>
          <Select :model-value="node.blendMode" @update:model-value="updateBlendMode">
            <SelectTrigger class="h-7 text-xs" aria-label="Blend mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in BLEND_MODE_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <Label>Shadow</Label>
          <Button
            v-if="node.shadow"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove shadow"
            @click="emit('update', { shadow: null })"
            ><Minus
          /></Button>
          <Button
            v-else
            variant="ghost"
            size="icon-xs"
            aria-label="Add shadow"
            @click="emit('update', { shadow: createDefaultShadow() })"
            ><Plus
          /></Button>
        </div>
        <div v-if="node.shadow" class="flex gap-2">
          <Input
            type="color"
            aria-label="Shadow colour"
            :model-value="node.shadow.color.slice(0, 7)"
            class="h-7 w-9 shrink-0 p-0.5"
            @change="updateShadowColor"
          />
          <Input
            v-for="key in ['x', 'y', 'blur'] as const"
            :key="key"
            type="number"
            :aria-label="`Shadow ${key}`"
            :model-value="node.shadow[key]"
            class="h-7 min-w-0 flex-1 text-xs tabular-nums"
            @change="updateShadowNumber(key, $event)"
          />
        </div>
      </div>
    </template>
  </div>
</template>
