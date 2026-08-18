import { Dictionary, Locale } from "./types";
import { ja } from "./dictionaries/ja";
import { en } from "./dictionaries/en";
import { ko } from "./dictionaries/ko";

const dictionaries: Record<Locale, Dictionary> = {
  ja,
  en,
  ko,
};

export const defaultLocale: Locale = "ja";
export const locales: Locale[] = ["ja", "en", "ko"];

export function getDictionary(locale: string): { dictionary: Dictionary; currentLocale: Locale } {
  const currentLocale: Locale = locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale;
  return {
    dictionary: dictionaries[currentLocale],
    currentLocale,
  };
}
