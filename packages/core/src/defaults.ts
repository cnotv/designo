import type { DesignNodeProperties } from './types.ts'

/** The file format version this code writes. Bumping it needs one migration step in the storage package. */
export const CURRENT_FORMAT_VERSION = 1

export const DEFAULT_NODE_PROPERTIES: DesignNodeProperties = {
  name: '',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  visible: true,
  fill: '#d9d9d9',
  stroke: null,
  strokeWidth: 1,
  cornerRadius: 0,
  text: '',
  fontSize: 16,
  fontFamily: 'Inter, system-ui, sans-serif'
}

export const CONTAINER_NODE_TYPES = ['page', 'frame', 'group'] as const

export const DATA_DIRECTORY_ENVIRONMENT_VARIABLE = 'DESIGNO_DATA_DIR'

export const DEFAULT_DATA_DIRECTORY_NAME = '.designo-data'
