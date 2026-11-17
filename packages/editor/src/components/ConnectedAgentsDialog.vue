<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
import { watch } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { useConnectedAgents } from '../composables/useConnectedAgents.ts'
import { formatDay } from '../editing/formatDay.ts'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ accessRefused: [] }>()

const { agents, isLoading, busyAgentId, error, load, disconnect } = useConnectedAgents(() =>
  emit('accessRefused')
)

// Read each time the dialog opens, so an agent that connected since is on the list.
watch(open, (isOpen) => {
  if (isOpen) void load()
})

const mcpAddress = `${window.location.origin}/mcp`
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Connected agents</DialogTitle>
        <DialogDescription>
          Agents you signed in through Designo's remote MCP address. Each one can list, read and
          change your designs until you disconnect it.
        </DialogDescription>
      </DialogHeader>

      <Alert v-if="error" variant="destructive" role="alert">
        <CircleAlert />
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>

      <div class="max-h-[60vh] overflow-y-auto">
        <Table aria-label="Connected agents">
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Connected</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty v-if="agents.length === 0" :colspan="3">
              <span class="text-muted-foreground">{{
                isLoading ? 'Loading agents' : 'No agent is connected.'
              }}</span>
            </TableEmpty>
            <TableRow v-for="agent in agents" :key="agent.id">
              <TableCell class="font-medium">{{ agent.clientName }}</TableCell>
              <TableCell class="text-muted-foreground tabular-nums">
                {{ formatDay(agent.connectedAt) }}
              </TableCell>
              <TableCell>
                <div class="flex justify-end">
                  <Button
                    variant="destructive"
                    size="sm"
                    :disabled="busyAgentId === agent.id"
                    :aria-label="`Disconnect ${agent.clientName}`"
                    @click="disconnect(agent.id)"
                  >
                    Disconnect
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <p class="text-muted-foreground text-sm">
        To connect one, run
        <code class="bg-muted rounded px-1 py-0.5"
          >claude mcp add --transport http designo {{ mcpAddress }}</code
        >
        and sign in when the browser opens.
      </p>
    </DialogContent>
  </Dialog>
</template>
