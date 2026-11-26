<script setup lang="ts">
import { Hash, Palette, Trash2, Type } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEditorContext } from '../composables/editorContext.ts'
import {
  createNewTextStyleOperations,
  createNewVariableOperations,
  createRenameStyleOperations,
  createSetVariableValueOperations,
  listTextStyles,
  listVariables
} from '../editing/styleLibrary.ts'
import { createNodeId } from '../lib/nodeIds.ts'

const { editor } = useEditorContext()

const variables = computed(() =>
  editor.document.value ? listVariables(editor.document.value) : []
)
const textStyles = computed(() =>
  editor.document.value ? listTextStyles(editor.document.value) : []
)

const selectedTextId = computed(() => {
  const [nodeId] = editor.selection.value
  return editor.selection.value.length === 1 &&
    nodeId &&
    editor.document.value?.nodes[nodeId]?.type === 'text'
    ? nodeId
    : undefined
})

const inputValue = (event: Event): string => (event.target as HTMLInputElement).value

const addVariable = (kind: 'color' | 'number'): void => {
  const document = editor.document.value
  if (document) editor.commit(createNewVariableOperations(document, kind, createNodeId('var')))
}

const addTextStyle = (): void => {
  const document = editor.document.value
  if (document && selectedTextId.value) {
    editor.commit(
      createNewTextStyleOperations(document, selectedTextId.value, createNodeId('style'))
    )
  }
}

const rename = (target: 'variable' | 'textStyle', id: string, event: Event): void => {
  const document = editor.document.value
  if (document) editor.commit(createRenameStyleOperations(document, target, id, inputValue(event)))
}

const setValue = (id: string, event: Event): void => {
  const document = editor.document.value
  if (document) editor.commit(createSetVariableValueOperations(document, id, inputValue(event)))
}

const describeTextStyle = (style: (typeof textStyles.value)[number]): string =>
  `${style.fontFamily} ${style.fontSize}`
</script>

<template>
  <section class="flex flex-col" aria-label="Styles">
    <div class="flex items-center justify-between px-3 pt-3 pb-1">
      <h2 class="text-muted-foreground font-semibold">Styles</h2>
      <div class="flex items-center">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add colour variable"
          title="Add colour variable"
          @click="addVariable('color')"
        >
          <Palette />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add number variable"
          title="Add number variable"
          @click="addVariable('number')"
        >
          <Hash />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add text style from the selected text"
          title="Add text style from the selected text"
          :disabled="!selectedTextId"
          @click="addTextStyle"
        >
          <Type />
        </Button>
      </div>
    </div>
    <p
      v-if="variables.length === 0 && textStyles.length === 0"
      class="text-muted-foreground px-3 pb-2"
    >
      No variables or text styles yet.
    </p>
    <ul class="flex max-h-56 flex-col gap-1 overflow-y-auto px-2 pb-2">
      <li v-for="variable in variables" :key="variable.id" class="flex items-center gap-1">
        <Input
          v-if="variable.kind === 'color'"
          type="color"
          class="h-7 w-8 shrink-0 p-0.5"
          :aria-label="`Colour of ${variable.name}`"
          :model-value="String(variable.value).slice(0, 7)"
          @change="setValue(variable.id, $event)"
        />
        <Hash v-else class="text-muted-foreground mx-2 size-4 shrink-0" />
        <Input
          class="h-7 min-w-0 flex-1 text-xs"
          :aria-label="`Name of variable ${variable.name}`"
          :model-value="variable.name"
          @change="rename('variable', variable.id, $event)"
        />
        <Input
          class="h-7 w-20 shrink-0 font-mono text-xs"
          :aria-label="`Value of ${variable.name}`"
          :model-value="String(variable.value)"
          @change="setValue(variable.id, $event)"
        />
        <Button
          variant="ghost"
          size="icon-xs"
          :aria-label="`Delete variable ${variable.name}`"
          @click="editor.commit([{ kind: 'deleteVariable', id: variable.id }])"
        >
          <Trash2 />
        </Button>
      </li>
      <li v-for="style in textStyles" :key="style.id" class="flex items-center gap-1">
        <Type class="text-muted-foreground mx-2 size-4 shrink-0" />
        <Input
          class="h-7 min-w-0 flex-1 text-xs"
          :aria-label="`Name of text style ${style.name}`"
          :model-value="style.name"
          @change="rename('textStyle', style.id, $event)"
        />
        <span class="text-muted-foreground w-24 shrink-0 truncate text-xs">{{
          describeTextStyle(style)
        }}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          :aria-label="`Delete text style ${style.name}`"
          @click="editor.commit([{ kind: 'deleteTextStyle', id: style.id }])"
        >
          <Trash2 />
        </Button>
      </li>
    </ul>
  </section>
</template>
