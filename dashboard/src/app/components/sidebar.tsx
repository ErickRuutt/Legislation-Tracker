'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/', label: 'Overview', icon: '~' },
  { href: '/legislation', label: 'Legislation', icon: '#' },
  { href: '/contracts', label: 'Contracts', icon: '$' },
  { href: '/news', label: 'News', icon: '@' },
  { href: '/social', label: 'Social', icon: '&' },
  { href: '/alerts', label: 'Alerts', icon: '!' },
  { href: '/research', label: 'Research', icon: '?' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full md:w-60 bg-[color:var(--every-navy)] text-white flex flex-col md:min-h-screen">
      <div className="p-5 md:p-6 border-b border-white/10">
        <h1 className="text-lg font-semibold tracking-tight">PFAS Monitor</h1>
        <p className="text-xs text-white/60 mt-1">Research & Field Intelligence</p>
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      </div>
      <nav className="flex-1 p-3 md:space-y-1.5 flex md:flex-col gap-2 overflow-x-auto md:overflow-visible">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[color:var(--every-blue)] text-white shadow-[0_10px_30px_rgba(39,29,205,0.35)]'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="w-5 text-center font-mono text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-5 border-t border-white/10 text-xs text-white/50 hidden md:block">
        Seattle PFAS Lab Intelligence
      </div>
    </aside>
  );
}
