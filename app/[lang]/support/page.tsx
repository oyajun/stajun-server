import fs from 'fs/promises';
import path from 'path';
import ReactMarkdown from 'react-markdown';

import { locales } from '@/lib/i18n/get-dictionary';

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function SupportPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  
  const supportedLangs = ['ja', 'en', 'ko'];
  const currentLang = supportedLangs.includes(lang) ? lang : 'ja';

  const filePath = path.join(process.cwd(), 'docs', currentLang, 'support.md');
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    content = 'Not found';
  }

  return (
    <div className="markdown-content" style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif', lineHeight: '1.6' }}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
