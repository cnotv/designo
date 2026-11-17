<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
import { watch } from 'vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { useAccountAdministration } from '../composables/useAccountAdministration.ts'
import {
  actionsForAccount,
  countPendingAccounts,
  statusBadgeVariant
} from '../editing/accountAdministration.ts'
import { formatDay } from '../editing/formatDay.ts'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ accessRefused: [] }>()

const { accounts, isLoading, busyAccountId, error, load, changeAccount } = useAccountAdministration(
  () => emit('accessRefused')
)

// The list is read each time the screen opens, so it shows who signed in since it was last open.
watch(open, (isOpen) => {
  if (isOpen) void load()
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Accounts</DialogTitle>
        <DialogDescription>
          Everyone who has signed in with Google. An account can open designs once it is approved.
          <span v-if="countPendingAccounts(accounts) > 0" class="text-foreground font-medium">
            {{ countPendingAccounts(accounts) }} waiting for a decision.
          </span>
        </DialogDescription>
      </DialogHeader>

      <Alert v-if="error" variant="destructive" role="alert">
        <CircleAlert />
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>

      <div class="max-h-[60vh] overflow-y-auto">
        <Table aria-label="Accounts">
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmpty v-if="accounts.length === 0" :colspan="4">
              <span class="text-muted-foreground">{{
                isLoading ? 'Loading accounts' : 'Nobody has signed in yet.'
              }}</span>
            </TableEmpty>
            <TableRow v-for="account in accounts" :key="account.id">
              <TableCell>
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ account.name }}</span>
                  <Badge v-if="account.isAdmin" variant="outline">Admin</Badge>
                </div>
                <div class="text-muted-foreground">{{ account.email }}</div>
              </TableCell>
              <TableCell>
                <Badge :variant="statusBadgeVariant(account.status)">{{ account.status }}</Badge>
              </TableCell>
              <TableCell class="text-muted-foreground tabular-nums">
                {{ formatDay(account.createdAt) }}
              </TableCell>
              <TableCell>
                <div class="flex justify-end gap-2">
                  <Button
                    v-for="button in actionsForAccount(account)"
                    :key="button.action"
                    :variant="button.variant"
                    size="sm"
                    :disabled="busyAccountId === account.id"
                    :aria-label="`${button.label} ${account.email}`"
                    @click="changeAccount(account.id, button.action)"
                  >
                    {{ button.label }}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </DialogContent>
  </Dialog>
</template>
