import { create } from 'zustand';
import i18n from '../services/i18n';

type LanguageCode = 'en' | 'es' | 'de' | 'fr' | 'ru' | 'it';

interface LanguageState {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
}

export const useLanguageStore = create<LanguageState>()((set) => ({
  language: 'en',
  
  setLanguage: (lang: LanguageCode) => {
    i18n.changeLanguage(lang);
    set({ language: lang });
  },
}));
