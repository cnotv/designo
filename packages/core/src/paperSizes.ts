import type { PaperSize, PageSetupInput } from './types.ts'

/**
 * Standard stationery sizes, in millimetres, grouped as the page setup lists them. Sizes are
 * stored in the orientation they are normally used: paper portrait, envelopes and cards
 * landscape.
 */
export const PAPER_SIZES: readonly PaperSize[] = [
  { id: 'a0', name: 'A0', group: 'iso', width: 841, height: 1189 },
  { id: 'a1', name: 'A1', group: 'iso', width: 594, height: 841 },
  { id: 'a2', name: 'A2', group: 'iso', width: 420, height: 594 },
  { id: 'a3', name: 'A3', group: 'iso', width: 297, height: 420 },
  { id: 'a4', name: 'A4', group: 'iso', width: 210, height: 297 },
  { id: 'a5', name: 'A5', group: 'iso', width: 148, height: 210 },
  { id: 'a6', name: 'A6', group: 'iso', width: 105, height: 148 },
  { id: 'a7', name: 'A7', group: 'iso', width: 74, height: 105 },
  { id: 'b0', name: 'B0', group: 'iso', width: 1000, height: 1414 },
  { id: 'b1', name: 'B1', group: 'iso', width: 707, height: 1000 },
  { id: 'b2', name: 'B2', group: 'iso', width: 500, height: 707 },
  { id: 'b3', name: 'B3', group: 'iso', width: 353, height: 500 },
  { id: 'b4', name: 'B4', group: 'iso', width: 250, height: 353 },
  { id: 'b5', name: 'B5', group: 'iso', width: 176, height: 250 },
  { id: 'b6', name: 'B6', group: 'iso', width: 125, height: 176 },
  { id: 'b7', name: 'B7', group: 'iso', width: 88, height: 125 },
  { id: 'letter', name: 'Letter', group: 'us', width: 215.9, height: 279.4 },
  { id: 'legal', name: 'Legal', group: 'us', width: 215.9, height: 355.6 },
  { id: 'tabloid', name: 'Tabloid', group: 'us', width: 279.4, height: 431.8 },
  { id: 'executive', name: 'Executive', group: 'us', width: 184.2, height: 266.7 },
  { id: 'half-letter', name: 'Half Letter', group: 'us', width: 139.7, height: 215.9 },
  { id: 'dl', name: 'DL', group: 'envelope', width: 220, height: 110 },
  { id: 'c4', name: 'C4', group: 'envelope', width: 324, height: 229 },
  { id: 'c5', name: 'C5', group: 'envelope', width: 229, height: 162 },
  { id: 'c6', name: 'C6', group: 'envelope', width: 162, height: 114 },
  { id: 'envelope-10', name: '#10', group: 'envelope', width: 241.3, height: 104.8 },
  { id: 'business-card', name: 'Business card', group: 'card', width: 85, height: 55 },
  { id: 'us-business-card', name: 'US business card', group: 'card', width: 88.9, height: 50.8 },
  { id: 'postcard', name: 'Postcard', group: 'card', width: 100, height: 148 },
  { id: 'square-card', name: 'Square card', group: 'card', width: 140, height: 140 }
]

/**
 * The page setup a paper size applies: in millimetres, with the size's width and height.
 * @param size - A standard size.
 * @returns The setup to hand to `getPageSetupPatch`.
 */
export const getPaperSizeSetup = (size: PaperSize): PageSetupInput => ({
  unit: 'mm',
  width: size.width,
  height: size.height
})
