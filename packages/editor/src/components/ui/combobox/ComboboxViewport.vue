<script setup lang="ts">
import type { ComboboxViewportProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { cn } from '@/lib/utilities'
import { ComboboxViewport, useForwardProps } from 'reka-ui'

const props = defineProps<ComboboxViewportProps & { class?: HTMLAttributes['class'] }>()

const delegatedProperties = reactiveOmit(props, 'class')

const forwarded = useForwardProps(delegatedProperties)
</script>

<template>
  <ComboboxViewport
    data-slot="combobox-viewport"
    v-bind="forwarded"
    :class="cn('max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto', props.class)"
  >
    <slot />
  </ComboboxViewport>
</template>
