<script setup lang="ts">
import type { ComboboxItemIndicatorProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { cn } from '@/lib/utilities'
import { ComboboxItemIndicator, useForwardProps } from 'reka-ui'

const props = defineProps<ComboboxItemIndicatorProps & { class?: HTMLAttributes['class'] }>()

const delegatedProperties = reactiveOmit(props, 'class')

const forwarded = useForwardProps(delegatedProperties)
</script>

<template>
  <ComboboxItemIndicator
    data-slot="combobox-item-indicator"
    v-bind="forwarded"
    :class="cn('ml-auto', props.class)"
  >
    <slot />
  </ComboboxItemIndicator>
</template>
