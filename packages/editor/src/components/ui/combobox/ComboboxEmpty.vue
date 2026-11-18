<script setup lang="ts">
import type { ComboboxEmptyProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { cn } from '@/lib/utilities'
import { ComboboxEmpty } from 'reka-ui'

const props = defineProps<ComboboxEmptyProps & { class?: HTMLAttributes['class'] }>()

const delegatedProperties = reactiveOmit(props, 'class')
</script>

<template>
  <ComboboxEmpty
    data-slot="combobox-empty"
    v-bind="delegatedProperties"
    :class="cn('py-6 text-center text-sm', props.class)"
  >
    <slot />
  </ComboboxEmpty>
</template>
