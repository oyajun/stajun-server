import { describe, it, expect } from "vitest";
import { getDictionary, locales, defaultLocale } from "../lib/i18n/get-dictionary";
import { ja } from "../lib/i18n/dictionaries/ja";
import { en } from "../lib/i18n/dictionaries/en";
import { ko } from "../lib/i18n/dictionaries/ko";

describe("i18n Dictionary System", () => {
  it("returns default locale (ja) for invalid or empty locale", () => {
    const { dictionary, currentLocale } = getDictionary("fr");
    expect(currentLocale).toBe("ja");
    expect(dictionary).toBe(ja);
  });

  it("returns Japanese dictionary for 'ja'", () => {
    const { dictionary, currentLocale } = getDictionary("ja");
    expect(currentLocale).toBe("ja");
    expect(dictionary.community.form.url).toBe("https://forms.cloud.microsoft/r/ANjheNkb0B");
    expect(dictionary.community.x.url).toBe("https://x.com/junjun_nihon");
  });

  it("returns English dictionary for 'en'", () => {
    const { dictionary, currentLocale } = getDictionary("en");
    expect(currentLocale).toBe("en");
    expect(dictionary.community.form.url).toBe("https://forms.cloud.microsoft/r/u0XVnrtyDd");
    expect(dictionary.community.x.url).toBe("https://x.com/junjun_global");
  });

  it("returns Korean dictionary for 'ko'", () => {
    const { dictionary, currentLocale } = getDictionary("ko");
    expect(currentLocale).toBe("ko");
    expect(dictionary.community.form.url).toBe("https://forms.cloud.microsoft/r/u0XVnrtyDd");
    expect(dictionary.community.x.url).toBe("https://x.com/junjun_global");
  });

  it("has consistent dictionary structures across all languages", () => {
    const checkKeysMatch = (obj1: Record<string, any>, obj2: Record<string, any>, path = "") => {
      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);

      for (const key of keys1) {
        expect(keys2).toContain(key);
        if (typeof obj1[key] === "object" && obj1[key] !== null) {
          checkKeysMatch(obj1[key], obj2[key], `${path}.${key}`);
        }
      }
    };

    checkKeysMatch(ja, en);
    checkKeysMatch(ja, ko);
  });
});
