<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useEditorContext } from '../composables/editorContext.ts'
import EditorContextMenu from './EditorContextMenu.vue'
import { drawDocument } from '../rendering/drawDocument.ts'
import { drawOverlay } from '../rendering/drawOverlay.ts'

const { editor, interaction } = useEditorContext()

const canvasElement = ref<HTMLCanvasElement>()

const readSelectionColor = (canvas: HTMLCanvasElement): string =>
  getComputedStyle(canvas).getPropertyValue('--selection').trim() || '#0d99ff'

const redraw = (): void => {
  const canvas = canvasElement.value
  const context = canvas?.getContext('2d')
  const document = interaction.shownDocument.value
  const { width, height } = editor.canvasSize.value
  if (!canvas || !context || width === 0) return
  const pixelRatio = window.devicePixelRatio
  canvas.width = width * pixelRatio
  canvas.height = height * pixelRatio
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, width, height)
  if (!document) return
  drawDocument(context, document, editor.viewport.value)
  drawOverlay(context, document, editor.viewport.value, {
    selection: editor.selection.value,
    hoveredId: interaction.hoveredId.value,
    marquee: interaction.marquee.value,
    showHandles: editor.selection.value.length === 1 && !interaction.isBusy.value,
    color: readSelectionColor(canvas)
  })
}

const resizeObserver = new ResizeObserver(([entry]) => {
  if (!entry) return
  editor.setCanvasSize({
    width: entry.contentRect.width,
    height: entry.contentRect.height
  })
})

// The wheel listener must not be passive, or preventDefault cannot stop the page from zooming.
const onWheel = (event: WheelEvent): void => interaction.onWheel(event)

onMounted(() => {
  if (!canvasElement.value) return
  resizeObserver.observe(canvasElement.value)
  canvasElement.value.addEventListener('wheel', onWheel, { passive: false })
})
onBeforeUnmount(() => {
  resizeObserver.disconnect()
  canvasElement.value?.removeEventListener('wheel', onWheel)
})
watchEffect(redraw)
</script>

<template>
  <EditorContextMenu>
    <canvas
      ref="canvasElement"
      class="bg-canvas block size-full touch-none select-none"
      :style="{ cursor: interaction.cursor.value }"
      data-testid="design-canvas"
      @pointerdown="interaction.onPointerDown"
      @pointermove="interaction.onPointerMove"
      @pointerup="interaction.onPointerUp"
      @pointerleave="interaction.onPointerLeave"
    />
  </EditorContextMenu>
</template>
