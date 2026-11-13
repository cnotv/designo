<script setup lang="ts">
import { getPaintOrder, type DesignDocument } from '@designo/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { drawDocument } from '../rendering/drawDocument'
import { fitViewportToContent, getContentBounds } from '../rendering/viewport'

const props = defineProps<{ document: DesignDocument }>()

const VIEWPORT_MARGIN = 48

const canvasElement = ref<HTMLCanvasElement>()

const redraw = (): void => {
  const canvas = canvasElement.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return
  const pixelRatio = window.devicePixelRatio
  const { clientWidth, clientHeight } = canvas
  canvas.width = clientWidth * pixelRatio
  canvas.height = clientHeight * pixelRatio
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, clientWidth, clientHeight)
  const viewport = fitViewportToContent(
    getContentBounds(getPaintOrder(props.document)),
    clientWidth,
    clientHeight,
    VIEWPORT_MARGIN
  )
  drawDocument(context, props.document, viewport)
}

const resizeObserver = new ResizeObserver(redraw)

onMounted(() => {
  if (canvasElement.value) resizeObserver.observe(canvasElement.value)
})
onBeforeUnmount(() => resizeObserver.disconnect())
watch(() => props.document, redraw)
</script>

<template>
  <canvas ref="canvasElement" class="design-canvas" />
</template>

<style scoped>
.design-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--designo-canvas-background);
}
</style>
