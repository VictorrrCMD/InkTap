export function outputName(original: string, signed: boolean): string {
  const base = original.replace(/\.pdf$/i, '').trim() || 'documento'
  return `${base}-${signed ? 'firmado' : 'relleno'}.pdf`
}

export function saveFile(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function canShareFiles(): boolean {
  try {
    const probe = new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] })
  } catch {
    return false
  }
}

export async function shareFile(bytes: Uint8Array, name: string) {
  const file = new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/pdf' })
  try {
    await navigator.share({ files: [file], title: name })
  } catch {
    // Dismissing the share sheet rejects; the file was already downloaded.
  }
}
