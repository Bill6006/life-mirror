// Hands files to the phone's share sheet; on a browser without one, downloads them.

export async function shareOrDownload(files: File[], title: string): Promise<'shared' | 'downloaded'> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
    await navigator.share({ files, title })
    return 'shared'
  }
  for (const f of files) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return 'downloaded'
}
