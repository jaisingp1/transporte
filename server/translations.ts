
export const translations = {
  es: {
    explanationError: "Encontré los datos, pero no pude generar una explicación."
  },
  en: {
    explanationError: "I found the data, but couldn't generate an explanation."
  },
  pt: {
    explanationError: "Encontrei os dados, mas não consegui gerar uma explicação."
  },
  sv: {
    explanationError: "Jag hittade datan, men kunde inte generera en förklaring."
  }
};

export const getTranslation = (lang: string, key: string): string => {
  const supportedLangs = ['es', 'en', 'pt', 'sv'];
  const language = supportedLangs.includes(lang) ? lang : 'en'; // Default to English
  return translations[language as keyof typeof translations][key as keyof typeof translations['en']];
};
