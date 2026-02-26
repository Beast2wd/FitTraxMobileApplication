import { create } from 'zustand';
import { AccentColor, ThemeMode, getTheme, Theme } from '../constants/Colors';

interface ThemeState {
  mode: ThemeMode;
  accent: AccentColor;
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
  toggleMode: () => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  mode: 'dark',
  accent: 'blue',
  theme: getTheme('dark', 'blue'),
  
  setMode: (mode: ThemeMode) => {
    const accent = get().accent;
    set({ 
      mode, 
      theme: getTheme(mode, accent) 
    });
  },
  
  setAccent: (accent: AccentColor) => {
    const mode = get().mode;
    set({ 
      accent, 
      theme: getTheme(mode, accent) 
    });
  },
  
  toggleMode: () => {
    const currentMode = get().mode;
    const newMode: ThemeMode = currentMode === 'dark' ? 'light' : 'dark';
    const accent = get().accent;
    set({ 
      mode: newMode, 
      theme: getTheme(newMode, accent) 
    });
  },
}));
