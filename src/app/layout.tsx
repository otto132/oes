import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';
import { ThemeInit } from './theme-init';

export const metadata: Metadata = {
  title: 'Eco-Insight · Revenue OS',
  description: 'AI-assisted Revenue OS for the GoO / renewable certificates market',
};

const themeScript = `(function(){try{var t=localStorage.getItem('eco-theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-brand focus:text-brand-on focus:rounded-md focus:text-sm focus:font-medium">
          Skip to content
        </a>
        <QueryProvider>
          <ThemeInit />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
