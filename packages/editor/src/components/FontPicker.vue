<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { Check, ChevronsUpDown, Upload } from 'lucide-vue-next'
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
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxViewport
} from '@/components/ui/combobox'
import { useFontFamilyListStore } from '../stores/fontFamilyList.ts'
import { useUploadedFontsStore } from '../stores/uploadedFonts.ts'
import {
  findFontFamilies,
  findUploadedFamilies,
  quoteFamilyName,
  readPickedFamilyName,
  toFontFamilyValue
} from '../editing/fontPicker.ts'

const props = defineProps<{ id: string; fontFamily: string }>()
const emit = defineEmits<{ pick: [fontFamily: string] }>()

const familyList = useFontFamilyListStore()
const { families, status } = storeToRefs(familyList)
const uploaded = useUploadedFontsStore()
const open = ref(false)
const search = ref('')
const fontFileInput = ref<HTMLInputElement>()

const currentName = computed(() => readPickedFamilyName(props.fontFamily))
const matches = computed(() => findFontFamilies(families.value, search.value))
const uploadedMatches = computed(() => findUploadedFamilies(uploaded.fonts, search.value))

// An uploaded family is an item of its own, apart from the font API's ids.
const UPLOADED_PREFIX = 'uploaded:'

// The list is half a megabyte, so it loads when the picker first opens, and again after a failure.
watch(open, (isOpen) => {
  if (isOpen) {
    void familyList.load()
    void uploaded.load()
  } else search.value = ''
})

const pickFamily = (id: unknown): void => {
  if (typeof id === 'string' && id.startsWith(UPLOADED_PREFIX)) {
    emit('pick', quoteFamilyName(id.slice(UPLOADED_PREFIX.length)))
  } else {
    const family = families.value.find((entry) => entry.id === id)
    if (family) emit('pick', toFontFamilyValue(family))
  }
  open.value = false
}

const uploadChosenFont = async (event: Event): Promise<void> => {
  const input = event.target instanceof HTMLInputElement ? event.target : undefined
  const file = input?.files?.[0]
  // The same file chosen again must still count as a change.
  if (input) input.value = ''
  if (!file) return
  const family = await uploaded.upload(file)
  if (family !== undefined) {
    emit('pick', quoteFamilyName(family))
    open.value = false
  }
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
          <template v-if="uploadedMatches.length > 0">
            <ComboboxGroup heading="Your fonts">
              <ComboboxItem
                v-for="name in uploadedMatches"
                :key="name"
                :value="`${UPLOADED_PREFIX}${name}`"
                class="text-xs"
              >
                <span class="truncate">{{ name }}</span>
                <ComboboxItemIndicator class="ml-auto">
                  <Check class="size-3.5" />
                </ComboboxItemIndicator>
              </ComboboxItem>
            </ComboboxGroup>
            <ComboboxSeparator />
          </template>
          <ComboboxGroup :heading="uploadedMatches.length > 0 ? 'Fontsource' : undefined">
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
      <div class="border-t p-1">
        <Button
          variant="ghost"
          size="sm"
          class="h-7 w-full justify-start text-xs"
          :disabled="uploaded.isUploading"
          @click="fontFileInput?.click()"
        >
          <Upload class="size-3.5" />
          {{ uploaded.isUploading ? 'Uploading...' : 'Upload a font' }}
        </Button>
        <p v-if="uploaded.uploadError" class="text-destructive px-2 py-1 text-xs">
          {{ uploaded.uploadError }}
        </p>
        <input
          ref="fontFileInput"
          type="file"
          accept=".ttf,.otf,font/ttf,font/otf"
          class="hidden"
          aria-label="Font file to upload"
          @change="uploadChosenFont"
        />
      </div>
    </ComboboxList>
  </Combobox>
</template>
