'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.status === 401 && window.location.pathname !== '/') {
        router.replace('/');
      }
      return res;
    };
    return () => { window.fetch = original; };
  }, [router]);
  return null;
}
