<script setup lang="ts">
import DesignCanvas from './components/DesignCanvas.vue'
import { useDesignoFiles } from './composables/useDesignoFiles.ts'

const DOCS_SELF_HOSTING_URL = 'https://cnotv.github.io/designo/guides/self-hosting'

const { documentSummaries, selectedFileId, activeDocument, isDemo, selectFile } = useDesignoFiles()
</script>

<template>
  <div class="editor-layout">
    <nav class="file-list" aria-label="Files">
      <h1 class="file-list-title">Designo</h1>
      <p v-if="isDemo" class="file-list-note">
        Demo: no Designo server is behind this page, so it shows a sample. To keep files and connect
        agents, <a :href="DOCS_SELF_HOSTING_URL">self-host Designo</a>.
      </p>
      <p v-if="documentSummaries.length === 0" class="file-list-note">
        No files yet. Ask an agent to call <code>create_file</code> through the Designo MCP server.
      </p>
      <ul>
        <li v-for="summary in documentSummaries" :key="summary.id">
          <a
            href="#"
            :aria-current="summary.id === selectedFileId ? 'page' : undefined"
            @click.prevent="selectFile(summary.id)"
            >{{ summary.name }}</a
          >
        </li>
      </ul>
    </nav>
    <main class="canvas-area">
      <DesignCanvas v-if="activeDocument" :document="activeDocument" />
    </main>
  </div>
</template>

<style scoped>
.editor-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  height: 100vh;
}

.file-list {
  padding: 16px;
  border-right: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  overflow-y: auto;
}

.file-list-title {
  font-size: 16px;
  margin: 0 0 12px;
}

.file-list-note {
  font-size: 13px;
  opacity: 0.7;
}

.file-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.file-list li a {
  display: block;
  padding: 6px 8px;
  border-radius: 6px;
  color: inherit;
  text-decoration: none;
}

.file-list li a[aria-current='page'] {
  background: color-mix(in srgb, currentColor 10%, transparent);
}

.canvas-area {
  min-width: 0;
}
</style>
