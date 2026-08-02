'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function HomeLink() {
  const path = usePathname();
  if (path === '/') return null;
  return (
    <div className="sticky top-0 z-50 flex justify-end bg-[#17365F] px-4 py-2">
      <Link className="flex items-center gap-1 text-sm font-semibold text-white hover:text-[#F27321]" href="/">
        الرئيسية 🏠
      </Link>
    </div>
  );
}
