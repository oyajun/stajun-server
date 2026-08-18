import fs from 'fs/promises';
import path from 'path';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

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
    <div className="markdown-content" style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif', lineHeight: '1.6' }}>
      {currentLang !== 'ja' && (
        <div style={{
          marginBottom: '24px',
          fontSize: '13px',
          color: '#64748b',
          lineHeight: '1.6'
        }}>
          {currentLang === 'ko' ? (
            <p style={{ margin: 0 }}>
              ※ 이 번역은 참고용으로 제공되며 법적 효력이 없습니다. 공식 문서는 일본어판입니다.{' '}
              <Link href="/ja/privacy-policy" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                일본어판 보기 →
              </Link>
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              *This translation is provided for reference only. The Japanese version is the official governing version.{' '}
              <Link href="/ja/privacy-policy" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                View Japanese Version →
              </Link>
            </p>
          )}
        </div>
      )}
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
