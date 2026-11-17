<script setup lang="ts">
import { CircleAlert, Clock, LogIn, ShieldOff } from 'lucide-vue-next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { SIGN_IN_ROUTE } from '../editing/accessGate.ts'
import type { GateScreen } from '../editing/types.ts'

defineProps<{ screen: GateScreen }>()
const emit = defineEmits<{ signOut: [] }>()
</script>

<template>
  <main class="bg-background flex h-screen items-center justify-center p-4">
    <Card v-if="screen.screen === 'signed-out'" class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Designo</CardTitle>
        <CardDescription>Sign in to open your designs.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <Alert v-if="screen.signInFailed" variant="destructive">
          <CircleAlert />
          <AlertTitle>Sign-in did not work</AlertTitle>
          <AlertDescription>Google did not confirm who you are. Please try again.</AlertDescription>
        </Alert>
        <Button as="a" :href="SIGN_IN_ROUTE" class="w-full">
          <LogIn />
          Sign in with Google
        </Button>
      </CardContent>
    </Card>

    <Card v-else-if="screen.screen === 'pending'" class="w-full max-w-sm">
      <CardHeader>
        <CardTitle class="flex items-center gap-2"
          ><Clock class="size-4" />Waiting for approval</CardTitle
        >
        <CardDescription>
          <span class="text-foreground font-medium">{{ screen.email }}</span> is signed in, but an
          admin has to approve the account before it can open designs.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="outline" class="w-full" @click="emit('signOut')">Sign out</Button>
      </CardFooter>
    </Card>

    <Card v-else-if="screen.screen === 'blocked'" class="w-full max-w-sm">
      <CardHeader>
        <CardTitle class="flex items-center gap-2"
          ><ShieldOff class="size-4" />Access refused</CardTitle
        >
        <CardDescription>
          <span class="text-foreground font-medium">{{ screen.email }}</span> cannot use this
          Designo server. Ask an admin if you think this is a mistake.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="outline" class="w-full" @click="emit('signOut')">Sign out</Button>
      </CardFooter>
    </Card>
  </main>
</template>
