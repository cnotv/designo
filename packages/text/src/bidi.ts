import type { BidiLevels, TextDirection } from './types.ts'

type BidiClass = 'L' | 'R' | 'AL' | 'EN' | 'AN' | 'CS' | 'NSM' | 'N'

const ARABIC_LETTER_PATTERN =
  /^[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Mandaic}]$/u
const RIGHT_TO_LEFT_LETTER_PATTERN = /^[\p{Script=Hebrew}\p{Script=Nko}\p{Script=Samaritan}]$/u
const LEFT_TO_RIGHT_PATTERN = /^[\p{L}\p{Mc}\p{Nd}]$/u
const NONSPACING_MARK_PATTERN = /^\p{Mn}$/u
const NUMBER_SEPARATORS = new Set([',', '.', ':', '/', '+', '-'])
const ARABIC_INDIC_DIGITS = /^[\u0660-\u0669\u066b\u066c]$/
const EUROPEAN_DIGIT_PATTERN = /^[\d\u06f0-\u06f9]$/

const classifyCharacter = (character: string): BidiClass => {
  if (EUROPEAN_DIGIT_PATTERN.test(character)) return 'EN'
  if (ARABIC_INDIC_DIGITS.test(character)) return 'AN'
  if (NUMBER_SEPARATORS.has(character)) return 'CS'
  if (NONSPACING_MARK_PATTERN.test(character)) return 'NSM'
  if (ARABIC_LETTER_PATTERN.test(character)) return 'AL'
  if (RIGHT_TO_LEFT_LETTER_PATTERN.test(character)) return 'R'
  return LEFT_TO_RIGHT_PATTERN.test(character) ? 'L' : 'N'
}

const isStrong = (bidiClass: BidiClass): boolean =>
  bidiClass === 'L' || bidiClass === 'R' || bidiClass === 'AL'

const toDirectionClass = (direction: TextDirection): 'L' | 'R' => (direction === 'rtl' ? 'R' : 'L')

/**
 * Runs a rule from the first character to the last, handing each step what the rule has decided
 * so far. The rules of the algorithm are all this shape.
 * @param items - The values to walk.
 * @param initial - The state before the first value.
 * @param step - Gives the output for a value and the state after it.
 * @returns The output for each value.
 */
const scan = <Item, State, Output>(
  items: readonly Item[],
  initial: State,
  step: (item: Item, state: State, index: number) => readonly [Output, State]
): Output[] => {
  const outputs: Output[] = []
  items.reduce((state, item, index) => {
    const [output, nextState] = step(item, state, index)
    outputs.push(output)
    return nextState
  }, initial)
  return outputs
}

/**
 * Finds which way a paragraph reads from its first strong letter (rules P2 and P3).
 * @param text - The paragraph.
 * @returns `rtl` when the first letter with a direction is Hebrew, Arabic and the like, else `ltr`.
 */
export const detectBaseDirection = (text: string): TextDirection => {
  const firstStrong = [...text].map(classifyCharacter).find(isStrong)
  return firstStrong === 'R' || firstStrong === 'AL' ? 'rtl' : 'ltr'
}

// W1: a combining mark takes the class of the letter it sits on.
const resolveMarks = (classes: readonly BidiClass[], start: BidiClass): BidiClass[] =>
  scan(classes, start, (bidiClass, previous): [BidiClass, BidiClass] => {
    const resolved = bidiClass === 'NSM' ? previous : bidiClass
    return [resolved, resolved]
  })

// W2 and W3: digits after an Arabic letter are Arabic digits, and Arabic letters count as R.
const resolveArabic = (classes: readonly BidiClass[], start: BidiClass): BidiClass[] =>
  scan(classes, start, (bidiClass, lastStrong): [BidiClass, BidiClass] => {
    const resolved: BidiClass = bidiClass === 'EN' && lastStrong === 'AL' ? 'AN' : bidiClass
    const nextStrong = isStrong(bidiClass) ? bidiClass : lastStrong
    return [resolved === 'AL' ? 'R' : resolved, nextStrong]
  })

// W4: a separator between two numbers of one kind joins them, as in 1,000; any other is neutral.
const resolveSeparators = (classes: readonly BidiClass[]): BidiClass[] =>
  classes.map((bidiClass, index) => {
    if (bidiClass !== 'CS') return bidiClass
    const before = classes[index - 1]
    const after = classes[index + 1]
    return before === after && (before === 'EN' || before === 'AN') ? before : 'N'
  })

// W7: European digits after a left to right letter are left to right.
const resolveEuropeanDigits = (classes: readonly BidiClass[], start: BidiClass): BidiClass[] =>
  scan(classes, start, (bidiClass, lastStrong): [BidiClass, BidiClass] => {
    const nextStrong = bidiClass === 'L' || bidiClass === 'R' ? bidiClass : lastStrong
    return [bidiClass === 'EN' && lastStrong === 'L' ? 'L' : bidiClass, nextStrong]
  })

const influenceOf = (bidiClass: BidiClass | undefined, fallback: 'L' | 'R'): 'L' | 'R' | 'N' => {
  if (bidiClass === undefined) return fallback
  if (bidiClass === 'L') return 'L'
  return bidiClass === 'N' ? 'N' : 'R'
}

// N1 and N2: neutrals between two letters of one direction take it, else the paragraph's.
const resolveNeutrals = (classes: readonly BidiClass[], base: 'L' | 'R'): BidiClass[] => {
  const findInfluence = (from: number, step: 1 | -1): 'L' | 'R' => {
    const neighbour = classes[from]
    const influence = influenceOf(neighbour, base)
    return influence === 'N' ? findInfluence(from + step, step) : influence
  }
  return classes.map((bidiClass, index) => {
    if (bidiClass !== 'N') return bidiClass
    const before = findInfluence(index - 1, -1)
    const after = findInfluence(index + 1, 1)
    return before === after ? before : base
  })
}

// I1 and I2: the embedding level each class ends up at.
const levelFor = (bidiClass: BidiClass, baseLevel: number): number => {
  const isRightToLeftBase = baseLevel % 2 === 1
  if (isRightToLeftBase) return bidiClass === 'R' ? baseLevel : baseLevel + 1
  if (bidiClass === 'R') return baseLevel + 1
  return bidiClass === 'EN' || bidiClass === 'AN' ? baseLevel + 2 : baseLevel
}

/**
 * Works out the embedding level of every character of a paragraph, so text in two directions can
 * be put in visual order. This follows the Unicode bidirectional algorithm's resolution of
 * letters, numbers, separators and neutrals; explicit embeddings, overrides and isolates
 * (U+202A to U+202E, U+2066 to U+2069) are not applied and count as neutral.
 * @param text - One paragraph.
 * @param baseDirection - The paragraph's direction; read from the first strong letter when absent.
 * @returns The direction and one level per UTF-16 unit.
 */
export const resolveBidiLevels = (text: string, baseDirection?: TextDirection): BidiLevels => {
  const direction = baseDirection ?? detectBaseDirection(text)
  const start = toDirectionClass(direction)
  const characters = [...text]
  const classes = resolveNeutrals(
    resolveEuropeanDigits(
      resolveSeparators(
        resolveArabic(resolveMarks(characters.map(classifyCharacter), start), start)
      ),
      start
    ),
    start
  )
  const baseLevel = direction === 'rtl' ? 1 : 0
  const levels = characters.flatMap((character, index) =>
    Array.from({ length: character.length }, () => levelFor(classes[index] ?? 'N', baseLevel))
  )
  return { baseDirection: direction, levels }
}

const reverseRunsAtOrAbove = (
  order: readonly number[],
  levels: readonly number[],
  threshold: number
): number[] => {
  const groups = order.reduce<{ indices: number[]; isRaised: boolean }[]>((collected, index) => {
    const isRaised = (levels[index] ?? 0) >= threshold
    const last = collected.at(-1)
    if (last && last.isRaised === isRaised) {
      last.indices.push(index)
      return collected
    }
    return [...collected, { indices: [index], isRaised }]
  }, [])
  return groups.flatMap((group) => (group.isRaised ? group.indices.toReversed() : group.indices))
}

/**
 * Puts items of a line in the order they are drawn left to right (rule L2): runs at the highest
 * level are reversed, then those at the next level down, and so on to the lowest odd level.
 * @param levels - The embedding level of each item, in reading order.
 * @returns The indices of the items, left to right.
 */
export const getVisualOrder = (levels: readonly number[]): number[] => {
  const indices = levels.map((_, index) => index)
  const highest = Math.max(0, ...levels)
  const lowestOdd = Math.min(...levels.filter((level) => level % 2 === 1))
  if (!Number.isFinite(lowestOdd)) return indices
  return Array.from({ length: highest - lowestOdd + 1 }, (_, step) => highest - step).reduce(
    (order, threshold) => reverseRunsAtOrAbove(order, levels, threshold),
    indices
  )
}
