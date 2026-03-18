export const UNIFIED_FORMAT_VALUES = ['console', 'json', 'markdown', 'ai', 'sarif'] as const

export type UnifiedOutputFormat = (typeof UNIFIED_FORMAT_VALUES)[number]

type LegacyAlias = {
  flag: string
  used?: boolean
  mapsTo: UnifiedOutputFormat
}

export interface ResolveOutputFormatOptions {
  command: string
  format?: string
  supported: readonly UnifiedOutputFormat[]
  legacyAliases?: LegacyAlias[]
  onWarning?: (message: string) => void
}

function assertSupportedFormatValue(command: string, format: string): asserts format is UnifiedOutputFormat {
  if ((UNIFIED_FORMAT_VALUES as readonly string[]).includes(format)) return
  throw new Error(
    `Invalid --format '${format}' for '${command}'. Allowed values: ${UNIFIED_FORMAT_VALUES.join(', ')}.`,
  )
}

function throwUnsupportedFormat(command: string, selected: UnifiedOutputFormat, supported: readonly UnifiedOutputFormat[]): never {
  throw new Error(
    `Format '${selected}' is not supported for '${command}'. Supported formats: ${supported.join(', ')}.`,
  )
}

function normalizeLegacyFormatSelection(command: string, selectedLegacyFormats: UnifiedOutputFormat[]): UnifiedOutputFormat | undefined {
  if (selectedLegacyFormats.length === 0) return undefined

  const uniqueFormats = [...new Set(selectedLegacyFormats)]
  if (uniqueFormats.length > 1) {
    throw new Error(
      `Conflicting legacy format flags for '${command}': ${uniqueFormats.join(' vs ')}. Use a single format option.`,
    )
  }

  return uniqueFormats[0]
}

export function resolveOutputFormat(options: ResolveOutputFormatOptions): UnifiedOutputFormat {
  const { command, format, supported, onWarning } = options
  const legacyAliases = options.legacyAliases ?? []

  for (const alias of legacyAliases) {
    if (!alias.used) continue
    onWarning?.(`Warning: --${alias.flag} is deprecated for '${command}'. Use --format ${alias.mapsTo} instead.`)
  }

  const selectedLegacyFormat = normalizeLegacyFormatSelection(
    command,
    legacyAliases.filter((alias) => alias.used).map((alias) => alias.mapsTo),
  )

  const selectedFormat = format?.trim()
  if (selectedFormat) {
    assertSupportedFormatValue(command, selectedFormat)
    if (selectedLegacyFormat && selectedLegacyFormat !== selectedFormat) {
      throw new Error(
        `Conflicting format flags for '${command}': --format ${selectedFormat} and legacy alias for ${selectedLegacyFormat}.`,
      )
    }

    if (!supported.includes(selectedFormat)) {
      throwUnsupportedFormat(command, selectedFormat, supported)
    }

    return selectedFormat
  }

  const resolvedFromLegacy = selectedLegacyFormat ?? 'console'
  if (!supported.includes(resolvedFromLegacy)) {
    throwUnsupportedFormat(command, resolvedFromLegacy, supported)
  }

  return resolvedFromLegacy
}
