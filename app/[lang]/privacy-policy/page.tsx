import fs from 'fs/promises';
import path from 'path';

export default async function PrivacyPolicyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  
  const supportedLangs = ['ja', 'en', 'ko'];
  const currentLang = supportedLangs.includes(lang) ? lang : 'ja';

  const filePath = path.join(process.cwd(), 'docs', currentLang, 'privacy-policy.md');
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    content = 'Not found';
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
      {content}
    </div>
  );
}
