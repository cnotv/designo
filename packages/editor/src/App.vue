<script setup lang="ts">
import AccessGate from './components/AccessGate.vue'
import EditorWorkspace from './components/EditorWorkspace.vue'
import { useAccessGate } from './composables/useAccessGate.ts'

const { screen, recheck, signOut } = useAccessGate()
</script>

<template>
  <div v-if="screen.screen === 'loading'" class="bg-background h-screen" />
  <!-- The workspace only exists once access is settled, so it never polls the files API signed out. -->
  <EditorWorkspace v-else-if="screen.screen === 'editor'" @access-refused="recheck" />
  <AccessGate v-else :screen="screen" @sign-out="signOut" />
</template>
