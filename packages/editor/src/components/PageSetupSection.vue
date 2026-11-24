<script setup lang="ts">
import {
  getPageSetupPatch,
  getPaperSizeSetup,
  millimetresToPoints,
  PAGE_FACINGS,
  PAGE_UNITS,
  PAPER_SIZES,
  type DesignNode,
  type DesignNodePatch,
  type PageGuides,
  type PageMargins,
  type PageSetupInput,
  type PaperSize,
  type PaperSizeGroup
} from '@designo/core'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { formatLength, readLengthInput } from '../editing/pageSetup.ts'

const props = defineProps<{ node: DesignNode }>()
const emit = defineEmits<{ update: [patch: DesignNodePatch] }>()

const FACING_LABELS: Record<(typeof PAGE_FACINGS)[number], string> = {
  single: 'Single page',
  left: 'Left page',
  right: 'Right page',
  spread: 'Spread'
}
const MARGIN_SIDES: { key: keyof PageMargins; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'inner', label: 'Inner' },
  { key: 'outer', label: 'Outer' }
]
const MAX_COLUMNS = 24
// A preset matches when the stored points round to its millimetres; the fields round to two
// decimals, so an exact comparison would miss a size typed by hand.
const POINT_TOLERANCE = 0.5

const PAPER_SIZE_GROUPS: { group: PaperSizeGroup; label: string }[] = [
  { group: 'iso', label: 'ISO paper' },
  { group: 'us', label: 'US paper' },
  { group: 'envelope', label: 'Envelopes' },
  { group: 'card', label: 'Cards' }
]

const unit = computed(() => props.node.pageUnit)
const guides = computed<PageGuides | null>(() => props.node.guides)

// A size the frame is already, so the select shows it; undefined leaves the placeholder.
const selectedPaperSize = computed(() => {
  const { width, height } = props.node
  return PAPER_SIZES.find(
    (size) =>
      Math.abs(width - millimetresToPoints(size.width)) < POINT_TOLERANCE &&
      Math.abs(height - millimetresToPoints(size.height)) < POINT_TOLERANCE
  )?.id
})

const paperSizesIn = (group: PaperSizeGroup): readonly PaperSize[] =>
  PAPER_SIZES.filter((size) => size.group === group)

const apply = (setup: PageSetupInput): void => emit('update', getPageSetupPatch(props.node, setup))

const applyPaperSize = (raw: unknown): void => {
  const size = PAPER_SIZES.find((candidate) => candidate.id === raw)
  if (size) apply(getPaperSizeSetup(size))
}

const inputValue = (event: Event): string => (event.target as HTMLInputElement).value

const updateLength = (key: 'width' | 'height' | 'bleed' | 'gutter', event: Event): void => {
  const value = readLengthInput(inputValue(event), key === 'width' || key === 'height' ? 1 : 0)
  if (value !== undefined) apply({ [key]: value })
}

const updateMargin = (side: keyof PageMargins, event: Event): void => {
  const value = readLengthInput(inputValue(event), 0)
  if (value !== undefined) apply({ margins: { [side]: value } })
}

const updateColumns = (event: Event): void => {
  const value = readLengthInput(inputValue(event), 1)
  if (value !== undefined) apply({ columns: Math.min(MAX_COLUMNS, Math.round(value)) })
}

// Changing the unit changes how lengths are shown and typed, never the stored ones.
const updateUnit = (raw: unknown): void => {
  const next = PAGE_UNITS.find((candidate) => candidate === raw)
  if (next) emit('update', { pageUnit: next })
}

const updateFacing = (raw: unknown): void => {
  const facing = PAGE_FACINGS.find((candidate) => candidate === raw)
  if (facing) apply({ facing })
}
</script>

<template>
  <section class="flex flex-col gap-2" aria-label="Page setup">
    <h2 class="text-muted-foreground font-semibold">Page</h2>
    <div class="flex flex-col gap-1.5">
      <Label for="page-paper-size">Paper size</Label>
      <Select :model-value="selectedPaperSize" @update:model-value="applyPaperSize">
        <SelectTrigger id="page-paper-size" size="sm" class="w-full text-xs">
          <SelectValue placeholder="Custom size" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup v-for="section in PAPER_SIZE_GROUPS" :key="section.group">
            <SelectLabel>{{ section.label }}</SelectLabel>
            <SelectItem v-for="size in paperSizesIn(section.group)" :key="size.id" :value="size.id">
              {{ size.name }} ({{ size.width }} x {{ size.height }} mm)
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div class="flex flex-col gap-1.5">
        <Label for="page-unit">Unit</Label>
        <Select :model-value="unit" @update:model-value="updateUnit">
          <SelectTrigger id="page-unit" size="sm" class="w-full text-xs"
            ><SelectValue
          /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in PAGE_UNITS" :key="option" :value="option">
              {{ option }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="page-facing">Facing</Label>
        <Select :model-value="node.facing" @update:model-value="updateFacing">
          <SelectTrigger id="page-facing" size="sm" class="w-full text-xs"
            ><SelectValue
          /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in PAGE_FACINGS" :key="option" :value="option">
              {{ FACING_LABELS[option] }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="page-width">Width ({{ unit }})</Label>
        <Input
          id="page-width"
          type="number"
          min="1"
          :model-value="formatLength(node.width, unit)"
          class="h-7 text-xs tabular-nums"
          @change="updateLength('width', $event)"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="page-height">Height ({{ unit }})</Label>
        <Input
          id="page-height"
          type="number"
          min="1"
          :model-value="formatLength(node.height, unit)"
          class="h-7 text-xs tabular-nums"
          @change="updateLength('height', $event)"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="page-bleed">Bleed ({{ unit }})</Label>
        <Input
          id="page-bleed"
          type="number"
          min="0"
          :model-value="formatLength(node.bleed, unit)"
          class="h-7 text-xs tabular-nums"
          @change="updateLength('bleed', $event)"
        />
      </div>
    </div>
    <div class="flex items-center justify-between">
      <h3 class="text-muted-foreground font-semibold">Guides</h3>
      <Button
        v-if="guides"
        variant="ghost"
        size="xs"
        @click="emit('update', getPageSetupPatch(node, { guides: null }))"
        >Remove</Button
      >
      <Button v-else variant="ghost" size="xs" @click="apply({ columns: 1 })">Add</Button>
    </div>
    <div v-if="guides" class="grid grid-cols-2 gap-2">
      <div v-for="side in MARGIN_SIDES" :key="side.key" class="flex flex-col gap-1.5">
        <Label :for="`page-margin-${side.key}`">{{ side.label }} margin</Label>
        <Input
          :id="`page-margin-${side.key}`"
          type="number"
          min="0"
          :model-value="formatLength(guides.margins[side.key], unit)"
          class="h-7 text-xs tabular-nums"
          @change="updateMargin(side.key, $event)"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="page-columns">Columns</Label>
        <Input
          id="page-columns"
          type="number"
          min="1"
          :max="MAX_COLUMNS"
          :model-value="guides.columns"
          class="h-7 text-xs tabular-nums"
          @change="updateColumns"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="page-gutter">Gutter ({{ unit }})</Label>
        <Input
          id="page-gutter"
          type="number"
          min="0"
          :model-value="formatLength(guides.gutter, unit)"
          class="h-7 text-xs tabular-nums"
          @change="updateLength('gutter', $event)"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        class="col-span-2"
        :aria-pressed="guides.fold"
        @click="apply({ fold: !guides.fold })"
        >{{ guides.fold ? 'Hide fold' : 'Show fold' }}</Button
      >
    </div>
    <p class="text-muted-foreground">Guides lie under the content and are never exported.</p>
  </section>
</template>
