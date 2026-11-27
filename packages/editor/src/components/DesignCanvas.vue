<script setup lang="ts">
import { resolveMasters } from '@designo/core'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watchEffect } from 'vue'
import { useEditorStore } from '../stores/editor.ts'
import { useCanvasInteractionStore } from '../stores/canvasInteraction.ts'
import { useFilesStore } from '../stores/files.ts'
import { useImageInsertion } from '../composables/useImageInsertion.ts'
import { isPictureType } from '../editing/images.ts'
import { getPathEditHandles } from '../editing/pathEditing.ts'
import { indexDocument } from '../editing/spatialIndex.ts'
import { createCanvas2dRenderer } from '../rendering/canvas2dRenderer.ts'
import { drawOverlay } from '../rendering/drawOverlay.ts'
import { onImageLoaded } from '../rendering/imageCache.ts'
import { prepareCanvas } from '../rendering/prepareCanvas.ts'
import { buildScene, createSceneSource } from '../rendering/scene.ts'
import { getSharedTextRuntime } from '../rendering/text/sharedTextEngine.ts'
import type { SceneRenderer } from '../rendering/types.ts'
import { createWebglRenderer } from '../rendering/webgl/webglRenderer.ts'
import EditorContextMenu from './EditorContextMenu.vue'

const editor = useEditorStore()
const interaction = useCanvasInteractionStore()
const files = useFilesStore()
const { insertImageFile } = useImageInsertion(editor, files)

// Dropping a picture on the canvas places it under the pointer; the demo has no picture store.
const onDragOver = (event: DragEvent): void => {
  if (!files.isDemo) event.preventDefault()
}
const onDrop = (event: DragEvent): void => {
  if (files.isDemo) return
  event.preventDefault()
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const point = { x: event.clientX - box.left, y: event.clientY - box.top }
  const dropped = [...(event.dataTransfer?.files ?? [])]
  dropped
    .filter((file) => isPictureType(file.type))
    .forEach((file) => void insertImageFile(file, point))
}

const sceneCanvas = ref<HTMLCanvasElement>()
const overlayCanvas = ref<HTMLCanvasElement>()
const renderer = shallowRef<SceneRenderer>()

// `?renderer=canvas2d` forces the fallback, to compare the two or work around a driver bug.
const prefersCanvas2d = new URLSearchParams(window.location.search).get('renderer') === 'canvas2d'

const textRuntime = getSharedTextRuntime()

const createRenderer = (canvas: HTMLCanvasElement): SceneRenderer | undefined =>
  (prefersCanvas2d ? undefined : createWebglRenderer(canvas, textRuntime)) ??
  createCanvas2dRenderer(canvas)

// Fonts load after the first frame that needs them, which draws the text the Canvas 2D way; this
// counts their arrivals so the scene is drawn again with the glyph path.
const fontsLoaded = ref(0)
// Pictures load after the first frame that has them, which draws their fill; this counts the
// arrivals so the scene is drawn again with the pictures.
const imageLoads = ref(0)
const stopListeningForImages = onImageLoaded(() => {
  imageLoads.value += 1
})
const atlasStats = ref<{ pages: number; glyphs: number }>()

// The index and paint order are rebuilt only when the document changes, not on pan or zoom.
const sceneSource = computed(() => {
  const shown = interaction.shownDocument
  // Masters are drawn from a resolved copy; picking and selection still use the stored nodes.
  const document = shown ? resolveMasters(shown) : undefined
  return document ? createSceneSource(document, indexDocument(document)) : undefined
})

const readCssColor = (canvas: HTMLCanvasElement, name: string, fallback: string): string =>
  getComputedStyle(canvas).getPropertyValue(name).trim() || fallback

const drawScene = (): void => {
  void fontsLoaded.value
  void imageLoads.value
  const source = sceneSource.value
  const size = editor.canvasSize
  if (!renderer.value || !source || size.width === 0) return
  const viewport = editor.viewport
  renderer.value.render({
    items: buildScene(source, viewport, size, editor.editingText?.nodeId),
    viewport,
    size,
    pixelRatio: window.devicePixelRatio
  })
  atlasStats.value = renderer.value.getTextStats?.()
}

const pathEditHandles = computed(() => {
  const session = editor.pathEdit
  const node = session && interaction.shownDocument?.nodes[session.nodeId]
  return node ? getPathEditHandles(node, session.selected) : []
})

const drawMarks = (): void => {
  const canvas = overlayCanvas.value
  const context = canvas?.getContext('2d')
  const document = interaction.shownDocument
  const size = editor.canvasSize
  if (!canvas || !context || size.width === 0) return
  const pixelRatio = window.devicePixelRatio
  prepareCanvas(canvas, size, pixelRatio)
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, size.width, size.height)
  if (!document) return
  // While text is edited in place, the editor box is the selection: the node keeps its old height
  // until the edit commits, so its outline and size label would sit over the growing text.
  drawOverlay(context, document, editor.viewport, {
    selection: editor.editingText ? [] : editor.selection,
    hoveredId: interaction.hoveredId,
    marquee: interaction.marquee,
    showHandles: editor.selection.length === 1 && !interaction.isBusy && !editor.pathEdit,
    pathHandles: pathEditHandles.value,
    pathSelected: editor.pathEdit?.selected,
    color: readCssColor(canvas, '--selection', '#0d99ff'),
    guides: interaction.guides,
    guideColor: readCssColor(canvas, '--guide', '#f24822')
  })
}

// The browser's own tooltip shows where a linked node leads when the pointer rests on it.
const hoveredLink = computed(() => {
  const { hoveredId } = interaction
  return hoveredId ? interaction.shownDocument?.nodes[hoveredId]?.link : undefined
})

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

const stopListeningForFonts = textRuntime.engine.subscribe(() => {
  fontsLoaded.value += 1
})

// The browser's copies of the fonts, which the Canvas 2D path draws with, finish loading after
// the shaper's; drawing again on arrival swaps the stand-in for them.
const onBrowserFontsLoaded = (): void => {
  fontsLoaded.value += 1
}

onMounted(() => {
  if (!sceneCanvas.value || !overlayCanvas.value) return
  document.fonts.addEventListener('loadingdone', onBrowserFontsLoaded)
  renderer.value = createRenderer(sceneCanvas.value)
  sceneCanvas.value.addEventListener('webglcontextlost', onContextLost)
  sceneCanvas.value.addEventListener('webglcontextrestored', onContextRestored)
  resizeObserver.observe(overlayCanvas.value)
  overlayCanvas.value.addEventListener('wheel', onWheel, { passive: false })
})
onBeforeUnmount(() => {
  stopListeningForFonts()
  stopListeningForImages()
  document.fonts.removeEventListener('loadingdone', onBrowserFontsLoaded)
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
    <div class="bg-canvas relative size-full" @dragover="onDragOver" @drop="onDrop">
      <canvas
        ref="sceneCanvas"
        class="pointer-events-none absolute inset-0 block size-full"
        :data-renderer="renderer?.kind"
        :data-atlas-pages="atlasStats?.pages"
        :data-atlas-glyphs="atlasStats?.glyphs"
        data-testid="design-scene"
      />
      <canvas
        ref="overlayCanvas"
        class="absolute inset-0 block size-full touch-none select-none"
        :style="{ cursor: interaction.cursor }"
        :title="hoveredLink ?? undefined"
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
