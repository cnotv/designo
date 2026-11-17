import type { ConsentPageView } from './types.ts'

/**
 * Escapes text for HTML, in element content and in quoted attribute values alike. Client names
 * are chosen by whoever registers a client, so they are never trusted as markup.
 * @param text - Any text.
 * @returns The same text with `& < > " '` replaced by entities.
 */
export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/**
 * The headers every page of this kind carries. The consent page must not be framed, or another
 * site could put it under a transparent overlay and collect a click on Allow. The style sheet is
 * allowed by nonce, since nothing else, no script and no outside resource, is allowed to load.
 * @param nonce - A fresh random value for this response.
 * @returns Header names and values.
 */
export const consentPageHeaders = (nonce: string): Readonly<Record<string, string>> => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`
})

const styles = `
:root { color-scheme: light dark; --page: #f4f4f5; --card: #ffffff; --text: #18181b; --muted: #52525b; --line: #d4d4d8; --accent: #18181b; --on-accent: #fafafa; --focus: #2563eb; }
@media (prefers-color-scheme: dark) { :root { --page: #09090b; --card: #18181b; --text: #fafafa; --muted: #a1a1aa; --line: #3f3f46; --accent: #fafafa; --on-accent: #18181b; --focus: #60a5fa; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--page); color: var(--text); font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
main { width: 100%; max-width: 28rem; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 24px; }
h1 { margin: 0 0 12px; font-size: 1.25rem; line-height: 1.3; overflow-wrap: anywhere; }
p { margin: 0 0 12px; color: var(--muted); }
strong { color: var(--text); }
.actions { display: flex; gap: 12px; margin-top: 20px; }
button { flex: 1; min-height: 44px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--text); font: inherit; font-weight: 600; cursor: pointer; }
button.allow { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
button:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.note { font-size: 0.875rem; }
`

const page = (nonce: string, title: string, body: string): string =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style nonce="${nonce}">${styles}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`

const hiddenField = (name: string, value: string): string =>
  `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`

/**
 * Renders the consent page: who is asking, what they get, and Allow and Deny. The decision is a
 * plain form post, so it needs no script, and every value in it is escaped.
 * @param view - The client, the signed-in account and the form fields to send back.
 * @param nonce - The nonce the page's style sheet is allowed by.
 * @returns The HTML document.
 */
export const renderConsentPage = (view: ConsentPageView, nonce: string): string => {
  const fields = Object.entries(view.fields)
    .map(([name, value]) => hiddenField(name, value))
    .join('\n')
  return page(
    nonce,
    'Connect an agent to Designo',
    `<h1><strong>${escapeHtml(view.clientName)}</strong> wants to edit your Designo designs</h1>
<p>You are signed in as <strong>${escapeHtml(view.accountName)}</strong> (${escapeHtml(view.accountEmail)}). If you allow this, it can list, read, create and change your designs. It cannot see anyone else's.</p>
<p class="note">After you choose, you are sent back to <strong>${escapeHtml(view.redirectOrigin)}</strong>. Only allow it if you started this from a program you trust. You can disconnect it later from the account menu in Designo.</p>
<form method="post" action="/authorize">
${fields}
<div class="actions">
<button type="submit" name="decision" value="deny">Deny</button>
<button type="submit" name="decision" value="allow" class="allow">Allow</button>
</div>
</form>`
  )
}

/**
 * Renders a page that says why a request cannot go on, for the cases where sending the person
 * back to the client with an error would be wrong: the client or its redirect address is not one
 * Designo can vouch for, or the account may not use Designo.
 * @param title - The heading.
 * @param message - One or two sentences of explanation.
 * @param nonce - The nonce the page's style sheet is allowed by.
 * @returns The HTML document.
 */
export const renderErrorPage = (title: string, message: string, nonce: string): string =>
  page(nonce, title, `<h1>${escapeHtml(title)}</h1>\n<p>${escapeHtml(message)}</p>`)
