import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';
import { ThemeInit } from './theme-init';

export const metadata: Metadata = {
  title: 'Eco-Insight · Revenue OS',
  description: 'AI-assisted Revenue OS for the GoO / renewable certificates market',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans">
        <QueryProvider>
          <ThemeInit />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
