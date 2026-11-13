export interface ThemeColor {
  id: string
  name: string
  /** accent in light mode: buttons, selected tab, links */
  color: string
  /** accent in dark mode (lighter, to keep contrast on dark surfaces) */
  dark: string
  /** a very light tint of the accent used for the page tint and soft fills */
  tint: string
}

/** Accent colours the user can pick. More can be added here later. */
export const THEMES: ThemeColor[] = [
  { id: 'brown', name: '棕', color: '#9a6b4b', dark: '#c99a78', tint: '#fbf7f3' },
  { id: 'blue', name: '藍', color: '#3b82c4', dark: '#6aaae4', tint: '#f3f8fd' },
]

export const DEFAULT_THEME = THEMES.find((t) => t.id === 'brown') ?? THEMES[0]!

export const themeById = (id: string): ThemeColor => THEMES.find((t) => t.id === id) ?? DEFAULT_THEME
