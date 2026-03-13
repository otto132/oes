import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';
import { ThemeInit } from './theme-init';

export const metadata: Metadata = {
  title: 'Eco-Insight · Revenue OS',
  description: 'AI-assisted Revenue OS for the GoO / renewable certificates market',
};

const themeScript = `(function(){try{var t=localStorage.getItem('eco-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <QueryProvider>
          <ThemeInit />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
