<script setup lang="ts">
import type { ComboboxSeparatorProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { cn } from '@/lib/utilities'
import { ComboboxSeparator } from 'reka-ui'

const props = defineProps<ComboboxSeparatorProps & { class?: HTMLAttributes['class'] }>()

const delegatedProperties = reactiveOmit(props, 'class')
</script>

<template>
  <ComboboxSeparator
    data-slot="combobox-separator"
    v-bind="delegatedProperties"
    :class="cn('bg-border -mx-1 h-px', props.class)"
  >
    <slot />
  </ComboboxSeparator>
</template>
