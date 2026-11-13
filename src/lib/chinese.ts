type Convert = (text: string) => string

let loading: Promise<Convert> | undefined

/** Simplified → Traditional (Taiwan wording). The conversion tables are big, so they are only fetched when first needed. */
export function traditional(): Promise<Convert> {
  loading ??= import('opencc-js/cn2t').then((m) => m.Converter({ from: 'cn', to: 'twp' }) as Convert).catch(() => (t: string) => t)
  return loading
}
