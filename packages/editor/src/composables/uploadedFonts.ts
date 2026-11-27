import type { UploadedFont } from '@designo/fonts'
import { computed, readonly, ref, shallowRef } from 'vue'
import { fetchUploadedFonts, toServedFonts, uploadFont } from '../lib/uploadedFonts.ts'

// One list for the whole editor: the font lookup reads it, and the picker shows and grows it.
const fonts = shallowRef<readonly UploadedFont[]>([])
const isUploading = ref(false)
const uploadError = ref<string | undefined>()
const firstLoad: { value: Promise<void> | undefined } = { value: undefined }

const load = (): Promise<void> => {
  firstLoad.value ??= fetchUploadedFonts().then((listed) => {
    fonts.value = toServedFonts(listed)
  })
  return firstLoad.value
}

/**
 * The account's uploaded fonts, as the text engine looks families up: it waits for the first
 * list, so a text in an uploaded family is never drawn with a stand-in first.
 * @returns The fonts known now.
 */
export const getUploadedFonts = async (): Promise<readonly UploadedFont[]> => {
  await load()
  return fonts.value
}

const upload = async (file: File): Promise<string | undefined> => {
  isUploading.value = true
  uploadError.value = undefined
  try {
    const stored = await uploadFont(file)
    await load()
    fonts.value = [
      ...fonts.value.filter((font) => font.id !== stored.id),
      ...toServedFonts([stored])
    ]
    return stored.family
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : 'The font could not be stored'
    return undefined
  } finally {
    isUploading.value = false
  }
}

/**
 * The fonts the signed-in account uploaded, for the font picker.
 * @returns The fonts, `load`, and `upload`, which stores a file and answers its family, or
 * undefined with `uploadError` set when it was refused.
 */
export const useUploadedFonts = () => ({
  fonts: computed(() => fonts.value),
  isUploading: readonly(isUploading),
  uploadError: readonly(uploadError),
  load,
  upload
})
