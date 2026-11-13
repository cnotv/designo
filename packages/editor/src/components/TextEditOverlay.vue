<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { Textarea } from '@/components/ui/textarea'
import { useEditorContext } from '../composables/editorContext.ts'
import { getTextOverlayLayout } from '../editing/textEditing.ts'

const { editor } = useEditorContext()

const draft = ref('')
const textareaWrapper = useTemplateRef<InstanceType<typeof Textarea>>('textarea')

const node = computed(() => {
  const session = editor.editingText.value
  return session ? editor.document.value?.nodes[session.nodeId] : undefined
})

const layout = computed(() =>
  node.value ? getTextOverlayLayout(node.value, editor.viewport.value, draft.value) : undefined
)

// A new node starts empty, as it holds only a placeholder; an existing one starts with its text.
watch(
  () => editor.editingText.value,
  async (session) => {
    if (!session) return
    draft.value = session.isNew ? '' : (node.value?.text ?? '')
    await nextTick()
    const field = textareaWrapper.value?.$el as HTMLTextAreaElement | undefined
    field?.focus()
    field?.select()
  }
)

const commit = (): void => editor.commitTextEdit(draft.value)

const onKeyDown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
    event.preventDefault()
    commit()
  }
}
</script>

<template>
  <Textarea
    v-if="node && layout"
    ref="textarea"
    v-model="draft"
    data-testid="text-edit-overlay"
    spellcheck="false"
    wrap="off"
    class="absolute m-0 min-h-0 resize-none overflow-hidden rounded-none border-0 p-0 whitespace-pre shadow-none ring-0 focus-visible:ring-0 md:text-base dark:bg-transparent"
    :style="{
      left: `${layout.left}px`,
      top: `${layout.top}px`,
      width: `${layout.width}px`,
      height: `${layout.height}px`,
      fontSize: `${layout.fontSize}px`,
      lineHeight: `${layout.lineHeight}px`,
      fontFamily: node.fontFamily,
      color: node.fill ?? '#000000',
      opacity: node.opacity,
      transform: `rotate(${layout.rotation}deg)`,
      transformOrigin: `${layout.rotationOriginX}px ${layout.rotationOriginY}px`,
      fieldSizing: 'fixed'
    }"
    @keydown="onKeyDown"
    @blur="commit"
  />
</template>
