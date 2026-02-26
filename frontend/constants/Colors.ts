// Theme system with dark mode and accent color customization

export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'cyan' | 'red';

export const AccentColors: Record<AccentColor, { primary: string; hover: string; active: string; gradient: [string, string] }> = {
  blue: {
    primary: '#3B82F6',
    hover: '#60A5FA',
    active: '#2563EB',
    gradient: ['#3B82F6', '#1D4ED8'],
  },
  purple: {
    primary: '#8B5CF6',
    hover: '#A78BFA',
    active: '#7C3AED',
    gradient: ['#8B5CF6', '#6D28D9'],
  },
  green: {
    primary: '#10B981',
    hover: '#34D399',
    active: '#059669',
    gradient: ['#10B981', '#047857'],
  },
  orange: {
    primary: '#F59E0B',
    hover: '#FBBF24',
    active: '#D97706',
    gradient: ['#F59E0B', '#D97706'],
  },
  pink: {
    primary: '#EC4899',
    hover: '#F472B6',
    active: '#DB2777',
    gradient: ['#EC4899', '#BE185D'],
  },
  cyan: {
    primary: '#06B6D4',
    hover: '#22D3EE',
    active: '#0891B2',
    gradient: ['#06B6D4', '#0E7490'],
  },
  red: {
    primary: '#EF4444',
    hover: '#F87171',
    active: '#DC2626',
    gradient: ['#EF4444', '#B91C1C'],
  },
};

// Dark Theme (Default)
export const DarkTheme = {
  background: {
    primary: '#0D0D0D',
    secondary: '#1A1A1A',
    card: '#1F1F1F',
    elevated: '#262626',
    input: '#2A2A2A',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#A1A1AA',
    muted: '#71717A',
    inverse: '#0D0D0D',
  },
  border: {
    primary: '#2A2A2A',
    secondary: '#3F3F46',
    accent: '#404040',
  },
  status: {
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  heartRate: {
    resting: '#6B7280',
    fatBurn: '#22C55E',
    cardio: '#F59E0B',
    peak: '#EF4444',
  },
};

// Light Theme
export const LightTheme = {
  background: {
    primary: '#FFFFFF',
    secondary: '#F4F4F5',
    card: '#FFFFFF',
    elevated: '#FAFAFA',
    input: '#F4F4F5',
  },
  text: {
    primary: '#18181B',
    secondary: '#52525B',
    muted: '#A1A1AA',
    inverse: '#FFFFFF',
  },
  border: {
    primary: '#E4E4E7',
    secondary: '#D4D4D8',
    accent: '#A1A1AA',
  },
  status: {
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  heartRate: {
    resting: '#6B7280',
    fatBurn: '#22C55E',
    cardio: '#F59E0B',
    peak: '#EF4444',
  },
};

// Legacy Colors export for backward compatibility
export const Colors = {
  brand: AccentColors.blue,
  background: {
    page: DarkTheme.background.primary,
    card: DarkTheme.background.card,
    section: DarkTheme.background.secondary,
    light: DarkTheme.background.elevated,
  },
  text: {
    primary: DarkTheme.text.primary,
    secondary: DarkTheme.text.secondary,
    muted: DarkTheme.text.muted,
    white: '#FFFFFF',
  },
  border: {
    light: DarkTheme.border.primary,
    medium: DarkTheme.border.secondary,
  },
  status: DarkTheme.status,
  heartRate: DarkTheme.heartRate,
};

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;
  accent: AccentColor;
  colors: typeof DarkTheme;
  accentColors: typeof AccentColors.blue;
}

export const getTheme = (mode: ThemeMode, accent: AccentColor): Theme => ({
  mode,
  accent,
  colors: mode === 'dark' ? DarkTheme : LightTheme,
  accentColors: AccentColors[accent],
});
