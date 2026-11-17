<script setup lang="ts">
import { Bot, LogOut, UserRound, Users } from 'lucide-vue-next'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { SignedInAccount } from '../editing/types.ts'
import AccountsDialog from './AccountsDialog.vue'
import ConnectedAgentsDialog from './ConnectedAgentsDialog.vue'

defineProps<{ account: SignedInAccount }>()
const emit = defineEmits<{ signOut: []; accessRefused: [] }>()

const isAccountsOpen = ref(false)
const isAgentsOpen = ref(false)
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" aria-label="Account menu">
        <UserRound />
        <span class="max-w-40 truncate">{{ account.name }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuLabel class="font-normal">
        <div class="truncate font-medium">{{ account.name }}</div>
        <div class="truncate opacity-70">{{ account.email }}</div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem v-if="account.isAdmin" @select="isAccountsOpen = true">
        <Users />
        Accounts
      </DropdownMenuItem>
      <DropdownMenuItem @select="isAgentsOpen = true">
        <Bot />
        Connected agents
      </DropdownMenuItem>
      <DropdownMenuItem @select="emit('signOut')">
        <LogOut />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <ConnectedAgentsDialog v-model:open="isAgentsOpen" @access-refused="emit('accessRefused')" />
  <AccountsDialog
    v-if="account.isAdmin"
    v-model:open="isAccountsOpen"
    @access-refused="emit('accessRefused')"
  />
</template>
