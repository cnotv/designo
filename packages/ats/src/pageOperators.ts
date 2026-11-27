import type { PdfBox } from './types.ts'

type Matrix = readonly [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const INVISIBLE_TEXT_MODE = 3
const MATRIX_LENGTH = 6

/** The numbers of the drawing operators the page reader follows, taken from pdf.js's OPS. */
export interface OperatorCodes {
  save: number
  restore: number
  transform: number
  paintFormXObjectBegin: number
  paintFormXObjectEnd: number
  setTextRenderingMode: number
  imageOperators: readonly number[]
}

interface ReaderState {
  matrix: Matrix
  saved: readonly Matrix[]
  images: readonly PdfBox[]
  hasInvisibleText: boolean
}

// PDF's cm: the new matrix is applied first, then the one already in force.
const concatenate = (next: Matrix, current: Matrix): Matrix => [
  next[0] * current[0] + next[1] * current[2],
  next[0] * current[1] + next[1] * current[3],
  next[2] * current[0] + next[3] * current[2],
  next[2] * current[1] + next[3] * current[3],
  next[4] * current[0] + next[5] * current[2] + current[4],
  next[4] * current[1] + next[5] * current[3] + current[5]
]

const isMatrix = (value: unknown): value is Matrix =>
  Array.isArray(value) &&
  value.length === MATRIX_LENGTH &&
  value.every((entry) => typeof entry === 'number')

// A picture is drawn into the unit square, so the box of its corners is where it lands.
const boxOfUnitSquare = (matrix: Matrix, pageHeight: number): PdfBox => {
  const corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
  ].map(([x = 0, y = 0]) => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: pageHeight - (matrix[1] * x + matrix[3] * y + matrix[5])
  }))
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  }
}

const enter = (state: ReaderState, matrixArgument: unknown): ReaderState => ({
  ...state,
  saved: [...state.saved, state.matrix],
  matrix: isMatrix(matrixArgument) ? concatenate(matrixArgument, state.matrix) : state.matrix
})

const leave = (state: ReaderState): ReaderState => ({
  ...state,
  matrix: state.saved.at(-1) ?? IDENTITY,
  saved: state.saved.slice(0, -1)
})

const stepOutsideStack = (
  state: ReaderState,
  code: number,
  args: unknown,
  codes: OperatorCodes,
  pageHeight: number
): ReaderState => {
  if (code === codes.transform && isMatrix(args))
    return { ...state, matrix: concatenate(args, state.matrix) }
  if (codes.imageOperators.includes(code))
    return { ...state, images: [...state.images, boxOfUnitSquare(state.matrix, pageHeight)] }
  return code === codes.setTextRenderingMode &&
    Array.isArray(args) &&
    args[0] === INVISIBLE_TEXT_MODE
    ? { ...state, hasInvisibleText: true }
    : state
}

const step = (
  state: ReaderState,
  code: number,
  args: unknown,
  codes: OperatorCodes,
  pageHeight: number
): ReaderState => {
  if (code === codes.save) return enter(state, undefined)
  if (code === codes.paintFormXObjectBegin)
    return enter(state, Array.isArray(args) ? args[0] : undefined)
  if (code === codes.restore || code === codes.paintFormXObjectEnd) return leave(state)
  return stepOutsideStack(state, code, args, codes, pageHeight)
}

/**
 * Follows a page's drawing operators to find where pictures land and whether any text is drawn
 * invisible, which is how a scanned page carries its OCR text.
 * @param operators - The operator numbers and their arguments, in drawing order.
 * @param operators.fnArray - One operator number for each step.
 * @param operators.argsArray - The arguments of each step.
 * @param codes - The numbers of the operators that matter.
 * @param pageHeight - The page height, so boxes are measured from the top.
 * @returns Each picture's box, and whether the page draws invisible text.
 */
export const readPageOperators = (
  operators: { fnArray: readonly number[]; argsArray: readonly unknown[] },
  codes: OperatorCodes,
  pageHeight: number
): { images: PdfBox[]; hasInvisibleText: boolean } => {
  const start: ReaderState = { matrix: IDENTITY, saved: [], images: [], hasInvisibleText: false }
  const end = operators.fnArray.reduce<ReaderState>(
    (state, code, index) => step(state, code, operators.argsArray[index], codes, pageHeight),
    start
  )
  return { images: [...end.images], hasInvisibleText: end.hasInvisibleText }
}
