import type { StationeryTemplate } from './types.ts'

const SANS = 'Inter, sans-serif'
const SERIF = 'Lora, serif'
const INK = '#1a1a1a'
const MUTED = '#6b6b6b'
const ACCENT = '#2f5d50'

/**
 * Ready layouts for stationery. Sizes come from the paper size list, and every position is in
 * millimetres from the page's top left corner. The words are placeholders to type over.
 */
export const STATIONERY_TEMPLATES: readonly StationeryTemplate[] = [
  {
    id: 'letterhead',
    name: 'Letterhead',
    paperSizeId: 'a4',
    nodes: [
      {
        type: 'text',
        name: 'Sender name',
        x: 25,
        y: 20,
        width: 100,
        height: 10,
        properties: {
          text: 'Your name',
          fontSize: 20,
          fontFamily: SERIF,
          fontWeight: 700,
          fill: INK
        }
      },
      {
        type: 'text',
        name: 'Sender details',
        x: 135,
        y: 20,
        width: 50,
        height: 20,
        properties: {
          text: 'Street 1\n12345 City\nname@example.com',
          fontSize: 9,
          fontFamily: SANS,
          fill: MUTED,
          textAlign: 'right'
        }
      },
      {
        type: 'rectangle',
        name: 'Rule',
        x: 25,
        y: 45,
        width: 160,
        height: 0.5,
        properties: { fill: ACCENT }
      },
      {
        type: 'text',
        name: 'Recipient',
        x: 25,
        y: 55,
        width: 85,
        height: 25,
        properties: {
          text: 'Recipient\nStreet 2\n54321 Town',
          fontSize: 11,
          fontFamily: SANS,
          fill: INK
        }
      },
      {
        type: 'text',
        name: 'Subject',
        x: 25,
        y: 100,
        width: 160,
        height: 8,
        properties: { text: 'Subject', fontSize: 12, fontFamily: SANS, fontWeight: 600, fill: INK }
      },
      {
        type: 'text',
        name: 'Body',
        x: 25,
        y: 115,
        width: 160,
        height: 140,
        properties: {
          text: 'Dear Sir or Madam,\n\nWrite your letter here.',
          fontSize: 11,
          fontFamily: SANS,
          lineHeight: 1.5,
          fill: INK
        }
      }
    ]
  },
  {
    id: 'business-card',
    name: 'Business card',
    paperSizeId: 'business-card',
    nodes: [
      {
        type: 'rectangle',
        name: 'Accent',
        x: 0,
        y: 0,
        width: 6,
        height: 55,
        properties: { fill: ACCENT }
      },
      {
        type: 'text',
        name: 'Name',
        x: 14,
        y: 10,
        width: 65,
        height: 8,
        properties: {
          text: 'Your name',
          fontSize: 14,
          fontFamily: SERIF,
          fontWeight: 700,
          fill: INK
        }
      },
      {
        type: 'text',
        name: 'Title',
        x: 14,
        y: 19,
        width: 65,
        height: 5,
        properties: {
          text: 'Job title',
          fontSize: 8,
          fontFamily: SANS,
          fontWeight: 500,
          fill: ACCENT
        }
      },
      {
        type: 'text',
        name: 'Contact',
        x: 14,
        y: 34,
        width: 65,
        height: 14,
        properties: {
          text: 'name@example.com\n+49 000 000000\nexample.com',
          fontSize: 7,
          fontFamily: SANS,
          fill: MUTED
        }
      }
    ]
  },
  {
    id: 'envelope-dl',
    name: 'DL envelope',
    paperSizeId: 'dl',
    nodes: [
      {
        type: 'text',
        name: 'Sender',
        x: 10,
        y: 8,
        width: 70,
        height: 14,
        properties: {
          text: 'Your name\nStreet 1, 12345 City',
          fontSize: 8,
          fontFamily: SANS,
          fill: MUTED
        }
      },
      {
        type: 'text',
        name: 'Recipient',
        x: 110,
        y: 50,
        width: 95,
        height: 30,
        properties: {
          text: 'Recipient\nStreet 2\n54321 Town',
          fontSize: 12,
          fontFamily: SANS,
          fill: INK
        }
      }
    ]
  },
  {
    id: 'postcard',
    name: 'Postcard',
    paperSizeId: 'postcard',
    nodes: [
      {
        type: 'rectangle',
        name: 'Picture',
        x: 0,
        y: 0,
        width: 100,
        height: 70,
        properties: { fill: '#cfd8d3' }
      },
      {
        type: 'text',
        name: 'Greeting',
        x: 10,
        y: 80,
        width: 80,
        height: 12,
        properties: {
          text: 'Greetings from',
          fontSize: 16,
          fontFamily: SERIF,
          fontWeight: 700,
          fill: INK
        }
      },
      {
        type: 'text',
        name: 'Message',
        x: 10,
        y: 98,
        width: 80,
        height: 40,
        properties: {
          text: 'Write your message here.',
          fontSize: 10,
          fontFamily: SANS,
          lineHeight: 1.5,
          fill: MUTED
        }
      }
    ]
  }
]
