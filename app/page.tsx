'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const lang = (navigator.language || '').toLowerCase();
    if (lang.startsWith('ja')) {
      router.replace('/ja');
    } else if (lang.startsWith('ko')) {
      router.replace('/ko');
    } else {
      router.replace('/en');
    }
  }, [router]);

  return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <p>Redirecting to <a href="/en">JunJun</a>...</p>
    </div>
  );
}

