<script setup lang="ts">
import type { ComboboxAnchorProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { cn } from '@/lib/utilities'
import { ComboboxAnchor, useForwardProps } from 'reka-ui'

const props = defineProps<ComboboxAnchorProps & { class?: HTMLAttributes['class'] }>()

const delegatedProperties = reactiveOmit(props, 'class')

const forwarded = useForwardProps(delegatedProperties)
</script>

<template>
  <ComboboxAnchor
    data-slot="combobox-anchor"
    v-bind="forwarded"
    :class="cn('w-[200px]', props.class)"
  >
    <slot />
  </ComboboxAnchor>
</template>
