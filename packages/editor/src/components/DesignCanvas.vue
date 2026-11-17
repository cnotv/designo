<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watchEffect } from 'vue'
import { useEditorContext } from '../composables/editorContext.ts'
import { indexDocument } from '../editing/spatialIndex.ts'
import { createCanvas2dRenderer } from '../rendering/canvas2dRenderer.ts'
import { drawOverlay } from '../rendering/drawOverlay.ts'
import { prepareCanvas } from '../rendering/prepareCanvas.ts'
import { buildScene, createSceneSource } from '../rendering/scene.ts'
import type { SceneRenderer } from '../rendering/types.ts'
import { createWebglRenderer } from '../rendering/webgl/webglRenderer.ts'
import EditorContextMenu from './EditorContextMenu.vue'

const { editor, interaction } = useEditorContext()

const sceneCanvas = ref<HTMLCanvasElement>()
const overlayCanvas = ref<HTMLCanvasElement>()
const renderer = shallowRef<SceneRenderer>()

// `?renderer=canvas2d` forces the fallback, to compare the two or work around a driver bug.
const prefersCanvas2d = new URLSearchParams(window.location.search).get('renderer') === 'canvas2d'

const createRenderer = (canvas: HTMLCanvasElement): SceneRenderer | undefined =>
  (prefersCanvas2d ? undefined : createWebglRenderer(canvas)) ?? createCanvas2dRenderer(canvas)

// The index and paint order are rebuilt only when the document changes, not on pan or zoom.
const sceneSource = computed(() => {
  const document = interaction.shownDocument.value
  return document ? createSceneSource(document, indexDocument(document)) : undefined
})

const readCssColor = (canvas: HTMLCanvasElement, name: string, fallback: string): string =>
  getComputedStyle(canvas).getPropertyValue(name).trim() || fallback

const drawScene = (): void => {
  const source = sceneSource.value
  const size = editor.canvasSize.value
  if (!renderer.value || !source || size.width === 0) return
  const viewport = editor.viewport.value
  renderer.value.render({
    items: buildScene(source, viewport, size, editor.editingText.value?.nodeId),
    viewport,
    size,
    pixelRatio: window.devicePixelRatio
  })
}

const drawMarks = (): void => {
  const canvas = overlayCanvas.value
  const context = canvas?.getContext('2d')
  const document = interaction.shownDocument.value
  const size = editor.canvasSize.value
  if (!canvas || !context || size.width === 0) return
  const pixelRatio = window.devicePixelRatio
  prepareCanvas(canvas, size, pixelRatio)
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, size.width, size.height)
  if (!document) return
  // While text is edited in place, the editor box is the selection: the node keeps its old height
  // until the edit commits, so its outline and size label would sit over the growing text.
  drawOverlay(context, document, editor.viewport.value, {
    selection: editor.editingText.value ? [] : editor.selection.value,
    hoveredId: interaction.hoveredId.value,
    marquee: interaction.marquee.value,
    showHandles: editor.selection.value.length === 1 && !interaction.isBusy.value,
    color: readCssColor(canvas, '--selection', '#0d99ff'),
    guides: interaction.guides.value,
    guideColor: readCssColor(canvas, '--guide', '#f24822')
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

// A lost context comes back empty: drop the old renderer and build a new one when it returns.
const onContextLost = (event: Event): void => {
  event.preventDefault()
  renderer.value = undefined
}
const onContextRestored = (): void => {
  if (sceneCanvas.value) renderer.value = createRenderer(sceneCanvas.value)
}

onMounted(() => {
  if (!sceneCanvas.value || !overlayCanvas.value) return
  renderer.value = createRenderer(sceneCanvas.value)
  sceneCanvas.value.addEventListener('webglcontextlost', onContextLost)
  sceneCanvas.value.addEventListener('webglcontextrestored', onContextRestored)
  resizeObserver.observe(overlayCanvas.value)
  overlayCanvas.value.addEventListener('wheel', onWheel, { passive: false })
})
onBeforeUnmount(() => {
  resizeObserver.disconnect()
  overlayCanvas.value?.removeEventListener('wheel', onWheel)
  sceneCanvas.value?.removeEventListener('webglcontextlost', onContextLost)
  sceneCanvas.value?.removeEventListener('webglcontextrestored', onContextRestored)
  renderer.value?.dispose()
})
watchEffect(drawScene)
watchEffect(drawMarks)
</script>

<template>
  <EditorContextMenu>
    <div class="bg-canvas relative size-full">
      <canvas
        ref="sceneCanvas"
        class="pointer-events-none absolute inset-0 block size-full"
        :data-renderer="renderer?.kind"
        data-testid="design-scene"
      />
      <canvas
        ref="overlayCanvas"
        class="absolute inset-0 block size-full touch-none select-none"
        :style="{ cursor: interaction.cursor.value }"
        data-testid="design-canvas"
        @pointerdown="interaction.onPointerDown"
        @pointermove="interaction.onPointerMove"
        @pointerup="interaction.onPointerUp"
        @pointerleave="interaction.onPointerLeave"
        @dblclick="interaction.onDoubleClick"
      />
    </div>
  </EditorContextMenu>
</template>
