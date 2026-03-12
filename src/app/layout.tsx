import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
import Drawer from '@/components/shell/Drawer';
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
          <Sidebar />
          <TopBar />
          <main className="md:ml-[240px] pt-14 min-h-screen pb-20 md:pb-0">
            <div className="px-4 py-5 md:px-8 md:py-7 max-w-[1340px]">
              {children}
            </div>
          </main>
          <BottomNav />
          <Drawer />
        </QueryProvider>
      </body>
    </html>
  );
}
