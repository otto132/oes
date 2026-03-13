import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';
import { ThemeInit } from './theme-init';

export const metadata: Metadata = {
  title: 'Eco-Insight · Revenue OS',
  description: 'AI-assisted Revenue OS for the GoO / renewable certificates market',
};

// Inline script that runs before first paint to set the correct theme class,
// preventing a flash of the wrong theme on page load.
const themeInitScript = `(function(){try{var t=localStorage.getItem('eco-theme');if(t==='light'||t==='dark'){document.documentElement.className=t}else{document.documentElement.className='dark'}}catch(e){document.documentElement.className='dark'}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
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
