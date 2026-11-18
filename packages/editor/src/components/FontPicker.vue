<script setup lang="ts">
import { Check, ChevronsUpDown } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxViewport
} from '@/components/ui/combobox'
import { useFontFamilyList } from '../composables/fontFamilyList.ts'
import { findFontFamilies, readPickedFamilyName, toFontFamilyValue } from '../editing/fontPicker.ts'

const props = defineProps<{ id: string; fontFamily: string }>()
const emit = defineEmits<{ pick: [fontFamily: string] }>()

const { families, status, load } = useFontFamilyList()
const open = ref(false)
const search = ref('')

const currentName = computed(() => readPickedFamilyName(props.fontFamily))
const matches = computed(() => findFontFamilies(families.value, search.value))

// The list is half a megabyte, so it loads when the picker first opens, and again after a failure.
watch(open, (isOpen) => {
  if (isOpen) void load()
  else search.value = ''
})

const pickFamily = (id: unknown): void => {
  const family = families.value.find((entry) => entry.id === id)
  if (family) emit('pick', toFontFamilyValue(family))
  open.value = false
}
</script>

<template>
  <Combobox
    v-model:open="open"
    :model-value="currentName"
    :ignore-filter="true"
    @update:model-value="pickFamily"
  >
    <ComboboxAnchor as-child>
      <ComboboxTrigger as-child>
        <Button
          :id="id"
          variant="outline"
          role="combobox"
          class="h-7 w-full justify-between px-2 text-xs font-normal"
        >
          <span class="truncate">{{ currentName || 'Choose a font' }}</span>
          <ChevronsUpDown class="size-3.5 shrink-0 opacity-50" />
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList class="w-(--reka-combobox-trigger-width) min-w-56">
      <ComboboxInput v-model="search" :display-value="() => ''" placeholder="Search fonts" />
      <ComboboxViewport class="max-h-64 overflow-y-auto p-1">
        <p v-if="status === 'loading'" class="text-muted-foreground px-2 py-3 text-xs">
          Loading fonts
        </p>
        <p v-else-if="status === 'failed'" class="text-muted-foreground px-2 py-3 text-xs">
          The font list could not be loaded. Close and open this again to retry.
        </p>
        <template v-else>
          <ComboboxEmpty class="text-muted-foreground px-2 py-3 text-xs">
            No font matches
          </ComboboxEmpty>
          <ComboboxGroup>
            <ComboboxItem
              v-for="entry in matches"
              :key="entry.id"
              :value="entry.id"
              class="text-xs"
            >
              <span class="truncate">{{ entry.family }}</span>
              <ComboboxItemIndicator class="ml-auto">
                <Check class="size-3.5" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxGroup>
        </template>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
