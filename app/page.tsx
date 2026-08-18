import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { defaultLocale, locales } from "@/lib/i18n/get-dictionary";
import { Locale } from "@/lib/i18n/types";

export default async function RootPage() {
  const headerList = await headers();
  const acceptLanguage = headerList.get("accept-language") || "";

  let detectedLocale: Locale = defaultLocale;

  // Simple locale detection from Accept-Language header
  if (acceptLanguage) {
    const primaryLang = acceptLanguage.split(",")[0].toLowerCase().trim();
    if (primaryLang.startsWith("ko")) {
      detectedLocale = "ko";
    } else if (primaryLang.startsWith("en")) {
      detectedLocale = "en";
    } else if (primaryLang.startsWith("ja")) {
      detectedLocale = "ja";
    } else {
      // Fallback check if any supported language exists in header
      for (const loc of locales) {
        if (acceptLanguage.toLowerCase().includes(loc)) {
          detectedLocale = loc;
          break;
        }
      }
    }
  }

  redirect(`/${detectedLocale}`);
}
