import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Joins class names and lets later Tailwind classes override earlier ones, as shadcn-vue expects.
 * @param inputs - Class names, arrays or conditional objects.
 * @returns The merged class string.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
