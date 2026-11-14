import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import type { LayerOrderMode, Tool } from '../editing/types.ts'
import type { Editor } from './types.ts'

const NUDGE_DISTANCE = 1
const LARGE_NUDGE_DISTANCE = 10

const TOOL_BY_KEY: Record<string, Tool> = {
  v: 'select',
  f: 'frame',
  r: 'rectangle',
  o: 'ellipse',
  t: 'text'
}

const ARROW_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
}

// Typing in a panel field must not move or delete layers.
const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

const LAYER_ORDER_BY_CODE: Record<string, [LayerOrderMode, LayerOrderMode]> = {
  BracketRight: ['forward', 'front'],
  BracketLeft: ['backward', 'back']
}

const handleArrangeKey = (editor: Editor, event: KeyboardEvent): boolean => {
  const modes = LAYER_ORDER_BY_CODE[event.code]
  if (modes) {
    editor.reorderSelection(modes[event.shiftKey ? 1 : 0])
    return true
  }
  if (event.key.toLowerCase() !== 'g') return false
  if (event.shiftKey) editor.ungroupSelection()
  else editor.groupSelection()
  return true
}

const COMMAND_ACTIONS: Record<string, (editor: Editor) => void> = {
  d: (editor) => editor.duplicateSelection(),
  c: (editor) => editor.copySelection(),
  x: (editor) => editor.cutSelection(),
  v: (editor) => editor.paste()
}

const handleCommandKey = (
  editor: Editor,
  event: KeyboardEvent,
  exportSelection: () => void
): boolean => {
  const key = event.key.toLowerCase()
  if (key === 'e' && event.shiftKey) {
    exportSelection()
    return true
  }
  const action = COMMAND_ACTIONS[key]
  if (action && !event.shiftKey) {
    action(editor)
    return true
  }
  if (handleArrangeKey(editor, event)) return true
  if (key === 'z') {
    if (event.shiftKey) editor.redo()
    else editor.undo()
    return true
  }
  if (key === 'y') {
    editor.redo()
    return true
  }
  if (key === 'a') {
    editor.selectAll()
    return true
  }
  return false
}

const handleArrowKey = (editor: Editor, event: KeyboardEvent): boolean => {
  const direction = ARROW_DIRECTIONS[event.key]
  if (!direction) return false
  const distance = event.shiftKey ? LARGE_NUDGE_DISTANCE : NUDGE_DISTANCE
  editor.nudgeSelection(direction[0] * distance, direction[1] * distance)
  return true
}

const handleEditKey = (editor: Editor, event: KeyboardEvent): boolean => {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    editor.deleteSelection()
    return true
  }
  if (event.key !== 'Escape') return false
  editor.select([])
  editor.setTool('select')
  return true
}

const handleZoomKey = (editor: Editor, event: KeyboardEvent): boolean => {
  if (!event.shiftKey) return false
  if (event.code === 'Digit1') editor.zoomToFit()
  else if (event.code === 'Digit0') editor.zoomTo(1)
  else return false
  return true
}

const handleToolKey = (editor: Editor, event: KeyboardEvent): boolean => {
  const tool = TOOL_BY_KEY[event.key.toLowerCase()]
  if (!tool || event.shiftKey) return false
  editor.setTool(tool)
  return true
}

const PLAIN_KEY_HANDLERS = [handleArrowKey, handleEditKey, handleZoomKey, handleToolKey]

const handlePlainKey = (editor: Editor, event: KeyboardEvent): boolean =>
  PLAIN_KEY_HANDLERS.some((handler) => handler(editor, event))

/**
 * Wires the editor's keyboard shortcuts to the window: tools, undo and redo, delete, nudge,
 * select all, zoom, export, and space to pan.
 * @param editor - The editor state.
 * @param spaceHeld - Set while the space bar is down, which turns a drag into a pan.
 * @param exportSelection - Exports with the last-used settings.
 */
export const useEditorShortcuts = (
  editor: Editor,
  spaceHeld: Ref<boolean>,
  exportSelection: () => void
): void => {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) {
      // Escape leaves a panel field, as in Figma, so the next shortcut reaches the canvas.
      if (event.key === 'Escape' && event.target instanceof HTMLElement) event.target.blur()
      return
    }
    if (event.code === 'Space') {
      spaceHeld.value = true
      event.preventDefault()
      return
    }
    const commandHeld = event.metaKey || event.ctrlKey
    const handled = commandHeld
      ? handleCommandKey(editor, event, exportSelection)
      : handlePlainKey(editor, event)
    if (handled) event.preventDefault()
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') spaceHeld.value = false
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  })
}
