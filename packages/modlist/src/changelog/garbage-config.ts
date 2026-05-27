// Configuration for garbage/boilerplate detection in changelogs

// Heading titles that should be stripped as garbage
// Supports exact matches and patterns with optional suffixes
export const GARBAGE_HEADING_TITLES = [
  'Changelog',
  'Changes',
  'What\'s New',
  'Current version: unspecified',
]

// Extended heading patterns that allow suffixes (e.g. "Changes since 9.3e")
export const GARBAGE_HEADING_PATTERNS = [
  'Changes\\s+since\\s+[\\w.]+',
]

// Heading patterns that are just version numbers (redundant when version is shown above)
// These match headings like: "1.2.3", "v1.2.3", "Version 1.2.3", "1.12.2-2.0.4"
export const VERSION_HEADING_PATTERN = '(?:v(?:ersion)?\\s*)?\\d+(?:[\\.\\-]\\d+)+(?:\\s+changelog)?'

// Mod name + Changelog/Changes heading patterns
export const MOD_NAME_GARBAGE_PATTERNS = [
  'Changelog',
  'Changes',
]

// Keywords in short paragraphs that indicate boilerplate
export const BOILERPLATE_KEYWORDS = [
  'detailed changelog',
  'see readme',
  'more information',
  'known issues',
  'snapshot build',
  'full changelog',
]

// Maximum length for a paragraph to be considered boilerplate
export const BOILERPLATE_MAX_LENGTH = 150

// Placeholder detection patterns
export const PLACEHOLDER_PATTERNS = {
  fullChangelog    : /^(?:\*\*)?full changelog(?:\*\*)?\s*:/i,
  readChangelog    : /^read changelogs?$/i,
  bareUrl          : /^https?:\/\/\S+$/i,
  markdownLink     : /^\[.*?\]\([^)]+\)$/,
  htmlChangelogLink: /<a[^>]*>\s*(?:Changelog|Read changelogs?)\s*<\/a>/i,
  modrinthChangelog: /modrinth\.com\/mod\/[^/]+\/changelog/i,
  githubCompare    : /github\.com\/[^/]+\/[^/]+\/compare\//i,
}

// Short content threshold for linkout extraction (avoids false positives in full changelogs)
export const LINKOUT_SHORT_CONTENT_THRESHOLD = 200
