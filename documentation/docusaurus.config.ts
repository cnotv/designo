import type * as Preset from '@docusaurus/preset-classic'
import type { Config } from '@docusaurus/types'
import { themes as prismThemes } from 'prism-react-renderer'

const config: Config = {
  title: 'Designo',
  tagline: 'A personal, self-hosted design tool with its own MCP server',
  favicon: 'img/favicon.svg',
  future: { v4: true },
  url: 'https://cnotv.github.io',
  baseUrl: '/designo/',
  organizationName: 'cnotv',
  projectName: 'designo',
  onBrokenLinks: 'throw',
  markdown: { mermaid: true },
  themes: ['@docusaurus/theme-mermaid'],
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/cnotv/designo/tree/main/documentation/'
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'Designo',
      logo: { alt: 'Designo', src: 'img/favicon.svg' },
      items: [
        { type: 'docSidebar', sidebarId: 'docsSidebar', position: 'left', label: 'Docs' },
        { href: 'https://github.com/cnotv/designo', label: 'GitHub', position: 'right' }
      ]
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Self-hosting', to: '/guides/self-hosting' },
            { label: 'Connecting an agent', to: '/guides/mcp' },
            { label: 'Architecture', to: '/architecture' }
          ]
        },
        {
          title: 'Code',
          items: [{ label: 'GitHub', href: 'https://github.com/cnotv/designo' }]
        }
      ]
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula }
  } satisfies Preset.ThemeConfig
}

export default config
