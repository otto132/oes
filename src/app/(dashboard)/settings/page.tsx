'use client';
import { useStore } from '@/lib/store';
import { Avatar, Badge } from '@/components/ui';

const AGENTS = [
  { key: 'signal_hunter', name: 'Signal Hunter', status: 'Active · scanning 6 sources daily', desc: 'Monitors news, LinkedIn, registries for GoO market signals', params: ['Sources: Reuters, Bloomberg, LinkedIn, Montel, AIB, ENTSO-E', 'Scan frequency: Every 4 hours', 'Min relevance threshold: 60/100', 'Auto-dismiss below: 30/100'] },
  { key: 'lead_qualifier', name: 'Lead Qualifier', status: 'Active · FIUAC scoring enabled', desc: 'Scores new leads using FIUAC dimensions', params: ['Auto-qualify threshold: FIUAC ≥ 70', 'Auto-disqualify: FIUAC ≤ 25', 'Route to Queue when: 25 < FIUAC < 70'] },
  { key: 'account_enricher', name: 'Account Enricher', status: 'Active · weekly refresh', desc: 'Updates account briefs with new intelligence', params: ['Refresh cycle: Weekly', 'Sources: Signals, email sync, LinkedIn', 'Min confidence for auto-update: 85%', 'Below 85%: Route to Queue'] },
  { key: 'outreach_drafter', name: 'Outreach Drafter', status: 'Active · routed to Queue', desc: 'Generates personalized outreach using account context', params: ['Always route to Queue: Yes', 'Template style: Consultative', 'Personalization sources: Pain, WhyNow, Signals', 'Max sequence length: 4 steps'] },
  { key: 'pipeline_hygiene', name: 'Pipeline Hygiene', status: 'Active · daily health check', desc: 'Monitors deal health and flags stale opportunities', params: ['Stale threshold: 7 days no activity', 'Auto-decay: 5 pts/week engagement', 'Alert when health < 40'] },
  { key: 'inbox_classifier', name: 'Inbox Classifier', status: 'Active · Outlook connected', desc: 'Classifies incoming emails by intent', params: ['Classification types: Positive, Question, Objection, Meeting, OOO, New Domain', 'Auto-link by domain: Enabled', 'New domain detection: Enabled', 'Min classification confidence: 70%'] },
];

const INTEGRATIONS = [
  { name: 'Microsoft 365 / Outlook', status: 'Connected', active: true },
  { name: 'Calendar Sync', status: 'Connected', active: true },
  { name: 'LinkedIn (manual)', status: 'Manual enrichment', active: false },
];

const SHORTCUTS = [
  ['Command palette', '⌘K'], ['Home', '1'], ['Approval Queue', '2'], ['Signals', '3'],
  ['Leads', '4'], ['Accounts', '5'], ['Pipeline', '6'], ['Tasks', '7'],
];

export default function SettingsPage() {
  const { users, openDrawer, closeDrawer } = useStore();

  function openAgentConfig(key: string) {
    const a = AGENTS.find(x => x.key === key);
    if (!a) return;
    openDrawer({
      title: `${a.name} — Configuration`,
      subtitle: 'AI Agent',
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="ai-box">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">⚡ {a.name}</div>
            <p className="text-[12.5px] text-sub">{a.desc}</p>
          </div>
          <div>
            <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2">Parameters</div>
            <div className="flex flex-col gap-1.5">
              {a.params.map(p => {
                const [k, v] = p.split(':');
                return (
                  <div key={p} className="flex items-center justify-between py-1.5 px-2 border border-[var(--border)] rounded-md">
                    <span className="text-[11px] text-sub">{k}</span>
                    <span className="text-[11px] font-medium text-[var(--text)]">{v || ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="ok">● Active</Badge>
            <span className="text-[10px] text-muted">Last run: 2 hours ago</span>
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-sub hover:bg-[var(--hover)] rounded-md transition-colors" onClick={closeDrawer}>Close</button>
          <button className="px-3.5 py-1.5 text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Pause Agent</button>
          <button className="px-3.5 py-1.5 text-sm font-medium bg-brand text-[#09090b] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Save</button>
        </>
      ),
    });
  }

  return (
    <div className="max-w-[700px] page-enter">
      <h1 className="text-[18px] font-semibold tracking-tight mb-3.5">Settings</h1>

      {/* Team */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 mb-2.5">
        <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2.5">Team</div>
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
            <Avatar initials={u.ini} color={u.ac} size="sm" />
            <div className="flex-1">
              <div className="text-[12.5px] font-medium">{u.name}</div>
              <div className="text-[10px] text-muted">{u.role}</div>
            </div>
          </div>
        ))}
      </div>

      {/* AI Agents */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 mb-2.5">
        <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2.5">AI Agents</div>
        {AGENTS.map(a => (
          <div key={a.key} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-b-0">
            <div>
              <div className="text-[12.5px] font-medium">{a.name}</div>
              <div className="text-[10px] text-brand">{a.status}</div>
            </div>
            <button className="px-2 py-1 text-[11px] text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={() => openAgentConfig(a.key)}>Configure</button>
          </div>
        ))}
      </div>

      {/* Integrations */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 mb-2.5">
        <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2.5">Integrations</div>
        {INTEGRATIONS.map(i => (
          <div key={i.name} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-b-0">
            <span className="text-[12.5px]">{i.name}</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] ${i.active ? 'text-brand' : 'text-muted'}`}>{i.status}</span>
              <button className="px-2 py-1 text-[11px] text-sub hover:bg-[var(--hover)] rounded-md transition-colors">{i.active ? 'Disconnect' : 'Connect'}</button>
            </div>
          </div>
        ))}
      </div>

      {/* Shortcuts (desktop only) */}
      <div className="hidden md:block rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
        <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2">Shortcuts</div>
        {SHORTCUTS.map(([label, key]) => (
          <div key={label} className="flex items-center justify-between py-1">
            <span className="text-[11px] text-sub">{label}</span>
            <kbd className="font-mono text-[10px] px-[5px] py-[1px] rounded bg-[var(--surface)] border border-[var(--border)] text-muted">{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
