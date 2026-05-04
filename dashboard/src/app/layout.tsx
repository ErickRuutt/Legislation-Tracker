import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from './components/sidebar';
import { Instrument_Sans, Fraunces } from 'next/font/google';

const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
});

export const metadata: Metadata = {
  title: 'PFAS Monitor',
  description: 'PFAS & Environmental Monitoring Intelligence Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${instrument.variable} ${fraunces.variable} text-[color:var(--ink-900)]`}>
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-6xl mx-auto animate-fade-up">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
