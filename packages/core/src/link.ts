const MAILTO = /^mailto:[^\s@]+@[^\s@]+$/
const TEL = /^tel:\+?[\d\s().-]{3,}$/
const NO_WHITESPACE_OR_CONTROL = /^\S+$/

const isSecureWebAddress = (link: string): boolean => {
  if (!NO_WHITESPACE_OR_CONTROL.test(link)) return false
  try {
    const { protocol, hostname } = new URL(link)
    return protocol === 'https:' && hostname !== ''
  } catch {
    return false
  }
}

/**
 * Whether a string is a link a node may carry: an `https:` address, a `mailto:` address or a
 * `tel:` number. Other schemes, such as `javascript:` or `file:`, are refused because a PDF
 * reader or a browser would act on them.
 * @param link - The text to check.
 * @returns True when it is one of the three kinds.
 */
export const isValidLink = (link: string): boolean =>
  isSecureWebAddress(link) || MAILTO.test(link) || TEL.test(link)
