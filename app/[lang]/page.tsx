import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getDictionary, locales } from "@/lib/i18n/get-dictionary";
import { Locale } from "@/lib/i18n/types";

const APP_STORE_URL = "https://apps.apple.com/app/junjun-study-community/id6798144458";

interface PageProps {
  params: Promise<{
    lang: string;
  }>;
}

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const { dictionary } = getDictionary(lang);

  return {
    title: dictionary.meta.title,
    description: dictionary.meta.description,
    openGraph: {
      title: dictionary.meta.title,
      description: dictionary.meta.description,
      siteName: "JunJun",
      images: [
        {
          url: `/assets/screenshot_${lang === "ja" || lang === "ko" || lang === "en" ? lang : "ja"}.png`,
          width: 800,
          height: 1200,
          alt: "JunJun App Preview",
        },
      ],
      locale: lang === "ja" ? "ja_JP" : lang === "ko" ? "ko_KR" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: dictionary.meta.title,
      description: dictionary.meta.description,
      images: [`/assets/screenshot_${lang === "ja" || lang === "ko" || lang === "en" ? lang : "ja"}.png`],
    },
  };
}

export default async function LandingPage({ params }: PageProps) {
  const { lang } = await params;
  const { dictionary, currentLocale } = getDictionary(lang);

  const screenshotSrc = `/assets/screenshot_${currentLocale}.png`;
  const badgeSrc = `/assets/app-store-badge-${currentLocale}.svg`;

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col selection:bg-slate-200">
      {/* Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href={`/${currentLocale}`} className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg overflow-hidden shadow-xs border border-slate-200 flex-shrink-0">
              <Image
                src="/assets/app-icon.png"
                alt="JunJun Icon"
                width={32}
                height={32}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-bold text-lg text-slate-900 tracking-tight">JunJun</span>
          </Link>

          <nav className="flex items-center gap-3 sm:gap-6 text-sm">
            <a href="#features" className="hidden sm:inline-block text-slate-600 hover:text-slate-900 transition-colors">
              {dictionary.nav.features}
            </a>
            <a href="#community" className="hidden sm:inline-block text-slate-600 hover:text-slate-900 transition-colors">
              {dictionary.nav.community}
            </a>

            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
              {locales.map((l) => (
                <Link
                  key={l}
                  href={`/${l}`}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    l === currentLocale
                      ? "bg-white text-slate-900 shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {l.toUpperCase()}
                </Link>
              ))}
            </div>

            {/* App Store Header Link */}
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center transition-opacity hover:opacity-80"
              aria-label="Download on the App Store"
            >
              <Image
                src={badgeSrc}
                alt="Download on the App Store"
                width={120}
                height={40}
                className="h-9 w-auto"
              />
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="pt-12 pb-20 sm:pt-20 sm:pb-28 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            {/* App Icon Large & Name */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl sm:rounded-[2.2rem] overflow-hidden shadow-lg border border-slate-200/80 mb-4">
                <Image
                  src="/assets/app-icon.png"
                  alt="JunJun App Icon"
                  width={144}
                  height={144}
                  className="w-full h-full object-cover"
                  priority
                />
              </div>
              <span className="font-extrabold text-3xl sm:text-4xl text-slate-950 tracking-tight">JunJun</span>
            </div>

            {/* Badge */}
            <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs sm:text-sm font-medium mb-6">
              <span>{dictionary.hero.badge}</span>
            </div>

            {/* Main Heading */}
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-slate-950 tracking-tight leading-tight sm:leading-tight mb-5 text-center sm:whitespace-nowrap max-w-4xl mx-auto">
              {dictionary.hero.title}
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed mb-8">
              {dictionary.hero.subtitle}
            </p>

            {/* Platform Note & GDPR Note */}
            <div className="flex flex-col items-center gap-1 mb-6 text-xs text-slate-500">
              <p>{dictionary.hero.platformNote}</p>
              <p>{dictionary.hero.gdprNote}</p>
            </div>

            {/* Official App Store Download Badge */}
            <div className="mb-4">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block transition-transform hover:scale-[1.02] active:scale-[0.98]"
                aria-label="Download on the App Store"
              >
                <Image
                  src={badgeSrc}
                  alt="Download on the App Store"
                  width={160}
                  height={53}
                  className="h-12 sm:h-13 w-auto shadow-xs rounded-lg mx-auto"
                  priority
                />
              </a>
            </div>

            {/* AltStore PAL Download Badge & Notes (No border) */}
            <div className="flex flex-col items-center mb-14">
              <a
                href="altstore://source?url=https%3A%2F%2Fjunjun.oyajun.com%2Faltstore%2Fsource.json"
                className="inline-block transition-transform hover:scale-[1.02] active:scale-[0.98] mb-2"
                aria-label="Download on AltStore PAL"
              >
                <Image
                  src="/assets/altstore-badge.png"
                  alt="Download on AltStore PAL"
                  width={166}
                  height={53}
                  className="h-12 sm:h-13 w-auto shadow-xs rounded-lg"
                  priority
                />
              </a>
              <p className="text-xs text-slate-500 mt-1">
                {dictionary.hero.altstore.regionNotice}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                <span>{dictionary.hero.altstore.notInstalledPrompt} </span>
                <a
                  href="https://altstore.io/#Downloads"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {dictionary.hero.altstore.officialSiteLinkText}
                </a>
                <span> {dictionary.hero.altstore.notInstalledSuffix}</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                <span>{dictionary.hero.altstore.sourceUrlLabel}</span>
                <a
                  href="/altstore/source.json"
                  target="_blank"
                  className="text-blue-600 hover:underline"
                >
                  https://junjun.oyajun.com/altstore/source.json
                </a>
              </p>
            </div>

            {/* App Screenshot Hero (Frameless, Clean & Framed only by device silhouette) */}
            <div className="relative max-w-[280px] sm:max-w-[320px] mx-auto">
              <Image
                src={screenshotSrc}
                alt="JunJun App Screenshot"
                width={600}
                height={1000}
                className="w-full h-auto object-contain drop-shadow-xl"
                priority
              />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 px-4 sm:px-6 border-t border-slate-100">
          <div className="max-w-4xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
                {dictionary.features.sectionTitle}
              </h2>
              {dictionary.features.sectionSubtitle ? (
                <p className="text-slate-600 text-sm sm:text-base mt-3">
                  {dictionary.features.sectionSubtitle}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-12">
              {/* Feature 1: Time Tracking */}
              <div className="flex flex-col items-start">
                <span className="text-2xl mb-3">⏱️</span>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {dictionary.features.items.realtime.title}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
                  {dictionary.features.items.realtime.description}
                </p>
              </div>

              {/* Feature 2: Logs */}
              <div className="flex flex-col items-start">
                <span className="text-2xl mb-3">📝</span>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {dictionary.features.items.logs.title}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {dictionary.features.items.logs.description}
                </p>
              </div>

              {/* Feature 3: Stats */}
              <div className="flex flex-col items-start">
                <span className="text-2xl mb-3">📊</span>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {dictionary.features.items.stats.title}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {dictionary.features.items.stats.description}
                </p>
              </div>

              {/* Feature 4: Beyond Studying */}
              <div className="flex flex-col items-start">
                <span className="text-2xl mb-3">🏃</span>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {dictionary.features.items.privacy.title}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {dictionary.features.items.privacy.description}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Community & Contact Section */}
        <section id="community" className="py-20 px-4 sm:px-6 border-t border-slate-100">
          <div className="max-w-4xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
                {dictionary.community.sectionTitle}
              </h2>
              {dictionary.community.sectionSubtitle ? (
                <p className="text-slate-600 text-sm sm:text-base mt-3">
                  {dictionary.community.sectionSubtitle}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-12">
              {/* X (Twitter) */}
              <div className="flex flex-col items-start">
                <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </div>
                <h3 className="font-bold text-base text-slate-900 mb-1">{dictionary.community.x.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{dictionary.community.x.description}</p>
                <a
                  href={dictionary.community.x.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-slate-900 hover:text-slate-600 transition-colors inline-flex items-center gap-1 underline underline-offset-4"
                >
                  <span>{dictionary.community.x.button}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </div>

              {/* Discord */}
              <div className="flex flex-col items-start">
                <div className="w-10 h-10 rounded-xl bg-[#5865F2] text-white flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 127.14 96.36">
                    <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z" />
                  </svg>
                </div>
                <h3 className="font-bold text-base text-slate-900 mb-1">{dictionary.community.discord.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{dictionary.community.discord.description}</p>
                <a
                  href={dictionary.community.discord.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-slate-900 hover:text-slate-600 transition-colors inline-flex items-center gap-1 underline underline-offset-4"
                >
                  <span>{dictionary.community.discord.button}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </div>

              {/* Feedback Form */}
              <div className="flex flex-col items-start">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-4 text-lg">
                  📝
                </div>
                <h3 className="font-bold text-base text-slate-900 mb-1">{dictionary.community.form.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{dictionary.community.form.description}</p>
                <a
                  href={dictionary.community.form.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-slate-900 hover:text-slate-600 transition-colors inline-flex items-center gap-1 underline underline-offset-4"
                >
                  <span>{dictionary.community.form.button}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </div>

              {/* Email */}
              <div className="flex flex-col items-start">
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-4 text-lg">
                  ✉️
                </div>
                <h3 className="font-bold text-base text-slate-900 mb-1">{dictionary.community.email.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{dictionary.community.email.description}</p>
                <a
                  href={`mailto:${dictionary.community.email.address}`}
                  className="text-xs font-semibold text-slate-900 hover:text-slate-600 transition-colors inline-flex items-center gap-1 underline underline-offset-4"
                >
                  <span>{dictionary.community.email.address}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-10 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto flex items-center justify-center sm:justify-start gap-6 text-xs text-slate-600">
          <Link href={`/${currentLocale}/terms-of-service`} className="hover:text-slate-900 transition-colors">
            {dictionary.footer.termsOfService}
          </Link>
          <Link href={`/${currentLocale}/privacy-policy`} className="hover:text-slate-900 transition-colors">
            {dictionary.footer.privacyPolicy}
          </Link>
          <Link href={`/${currentLocale}/support`} className="hover:text-slate-900 transition-colors">
            {dictionary.footer.support}
          </Link>
        </div>
      </footer>
    </div>
  );
}
