import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
import Drawer from '@/components/shell/Drawer';
import ToastContainer from '@/components/ui/Toast';
import CommandPalette from '@/components/shell/CommandPalette';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <TopBar />
      <main className="md:ml-[220px] pt-12 min-h-screen pb-20 md:pb-0">
        <div className="px-4 py-4 md:px-6 md:py-5 max-w-[1280px]">
          {children}
        </div>
      </main>
      <BottomNav />
      <Drawer />
      <ToastContainer />
      <CommandPalette />
    </>
  );
}
