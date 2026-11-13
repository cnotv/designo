<script setup lang="ts">
import type { DesignDocument } from '@designo/core'
import type { DocumentSummary } from '@designo/storage'
import { documentSummaryListSchema, storedDocumentSchema } from '@designo/storage/schemas'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import DesignCanvas from './components/DesignCanvas.vue'

// Polling keeps the dev loop simple until the Yjs sync server lands; MCP edits show within a second.
const POLL_INTERVAL_MILLISECONDS = 1000

const documentSummaries = ref<DocumentSummary[]>([])
const selectedFileId = ref<string>()
const activeDocument = ref<DesignDocument>()
const lastDocumentJson = ref('')

const refresh = async (): Promise<void> => {
  const listResponse = await fetch('/api/files')
  if (!listResponse.ok) return
  documentSummaries.value = documentSummaryListSchema.parse(await listResponse.json())
  selectedFileId.value ??= documentSummaries.value[0]?.id
  if (!selectedFileId.value) return
  const response = await fetch(`/api/files/${encodeURIComponent(selectedFileId.value)}`)
  if (!response.ok) return
  const documentJson = await response.text()
  if (documentJson === lastDocumentJson.value) return
  lastDocumentJson.value = documentJson
  activeDocument.value = storedDocumentSchema.parse(JSON.parse(documentJson))
}

const selectFile = (fileId: string): void => {
  selectedFileId.value = fileId
  lastDocumentJson.value = ''
  void refresh()
}

const pollTimer = setInterval(() => void refresh(), POLL_INTERVAL_MILLISECONDS)

onMounted(() => void refresh())
onBeforeUnmount(() => clearInterval(pollTimer))
</script>

<template>
  <div class="editor-layout">
    <nav class="file-list" aria-label="Files">
      <h1 class="file-list-title">Designo</h1>
      <p v-if="documentSummaries.length === 0" class="file-list-empty">
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

.file-list-empty {
  font-size: 13px;
  opacity: 0.7;
}

.file-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.file-list a {
  display: block;
  padding: 6px 8px;
  border-radius: 6px;
  color: inherit;
  text-decoration: none;
}

.file-list a[aria-current='page'] {
  background: color-mix(in srgb, currentColor 10%, transparent);
}

.canvas-area {
  min-width: 0;
}
</style>
