'use client';
import { create } from 'zustand';
import type { Signal, Lead, Account, Opportunity, Task, Activity, Email, QueueItem, Goal, Meeting, User } from './types';
import * as data from './data';

interface Store {
  users: User[];
  signals: Signal[];
  leads: Lead[];
  accounts: Account[];
  opps: Opportunity[];
  tasks: Task[];
  activities: Activity[];
  emails: Email[];
  queue: QueueItem[]; // kept for layout badge counts; Queue page uses React Query
  goals: Goal[];
  meetings: Meeting[];
  theme: 'dark' | 'light';
  drawerOpen: boolean;
  drawerContent: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode } | null;
  toggleTheme: () => void;
  openDrawer: (c: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode }) => void;
  closeDrawer: () => void;
}

export const useStore = create<Store>((set) => ({
  users: data.USERS,
  signals: [...data.signals],
  leads: [...data.leads],
  accounts: [...data.accounts],
  opps: [...data.opps],
  tasks: [...data.tasks],
  activities: [...data.activities],
  emails: [...data.emails],
  queue: [...data.queue],
  goals: [...data.goals],
  meetings: [...data.meetings],
  theme: 'dark',
  drawerOpen: false,
  drawerContent: null,
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark';
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', next === 'dark');
    return { theme: next };
  }),
  openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
