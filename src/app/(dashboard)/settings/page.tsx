'use client';
import { useStore } from '@/lib/store';
import { Avatar, Badge } from '@/components/ui';
import { useTeamQuery, useAgentsQuery, useIntegrationsQuery, usePatchAgent } from '@/lib/queries/settings';
import { ApiError } from '@/lib/api-client';

const SHORTCUTS = [
  ['Command palette', '⌘K'], ['Home', '1'], ['Approval Queue', '2'], ['Signals', '3'],
  ['Leads', '4'], ['Accounts', '5'], ['Pipeline', '6'], ['Tasks', '7'],
];

export default function SettingsPage() {
  const { openDrawer, closeDrawer } = useStore();
  const team = useTeamQuery();
  const agents = useAgentsQuery();
  const integrations = useIntegrationsQuery();
  const patchAgent = usePatchAgent();

  function openAgentConfig(agent: { name: string; displayName: string; description: string; status: string; parameters: Record<string, string> }) {
    const isPaused = agent.status === 'paused';
    openDrawer({
      title: `${agent.displayName} — Configuration`,
      subtitle: 'AI Agent',
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="ai-box">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">⚡ {agent.displayName}</div>
            <p className="text-[12.5px] text-sub">{agent.description}</p>
          </div>
          <div>
            <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2">Parameters</div>
            <div className="flex flex-col gap-1.5">
              {Object.entries(agent.parameters).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-1.5 px-2 border border-[var(--border)] rounded-md">
                  <span className="text-[11px] text-sub">{k.replace(/_/g, ' ')}</span>
                  <span className="text-[11px] font-medium text-[var(--text)]">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={isPaused ? 'neutral' : 'ok'}>{isPaused ? '⏸ Paused' : '● Active'}</Badge>
            <span className="text-[10px] text-muted">Last run: —</span>
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-sub hover:bg-[var(--hover)] rounded-md transition-colors" onClick={closeDrawer}>Close</button>
          <button
            className="px-3.5 py-1.5 text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            onClick={() => {
              patchAgent.mutate(
                { name: agent.name, data: { status: isPaused ? 'active' : 'paused' } },
                { onSuccess: () => closeDrawer() },
              );
            }}
          >
            {isPaused ? 'Resume Agent' : 'Pause Agent'}
          </button>
          <button className="px-3.5 py-1.5 text-sm font-medium bg-brand text-[#09090b] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Save</button>
        </>
      ),
    });
  }

  return (
    <div className="max-w-[700px] page-enter">
      <h1 className="text-[18px] font-semibold tracking-tight mb-3.5">Settings</h1>

      {/* Team (hidden for non-admin users who get 403) */}
      {team.isError && team.error instanceof ApiError && team.error.status === 403 ? null : (
        <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 mb-2.5">
          <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2.5">Team</div>
          {team.isLoading ? (
            <div className="text-[11px] text-muted py-2">Loading team...</div>
          ) : team.isError ? (
            <div className="text-[11px] text-red-400 py-2">Failed to load team</div>
          ) : (
            team.data?.data?.map((u: any) => (
              <div key={u.id} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
                <Avatar initials={u.initials} color={u.color} size="sm" />
                <div className="flex-1">
                  <div className="text-[12.5px] font-medium">{u.name}</div>
                  <div className="text-[10px] text-muted">{u.role}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* AI Agents */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 mb-2.5">
        <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2.5">AI Agents</div>
        {agents.isLoading ? (
          <div className="text-[11px] text-muted py-2">Loading agents...</div>
        ) : agents.isError ? (
          <div className="text-[11px] text-red-400 py-2">Failed to load agents</div>
        ) : (
          agents.data?.data?.map((a: any) => (
            <div key={a.name} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-b-0">
              <div>
                <div className="text-[12.5px] font-medium">{a.displayName}</div>
                <div className={`text-[10px] ${a.status === 'paused' ? 'text-muted' : 'text-brand'}`}>
                  {a.status === 'paused' ? '⏸ Paused' : `Active`}
                </div>
              </div>
              <button className="px-2 py-1 text-[11px] text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={() => openAgentConfig(a)}>Configure</button>
            </div>
          ))
        )}
      </div>

      {/* Integrations */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 mb-2.5">
        <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2.5">Integrations</div>
        {integrations.isLoading ? (
          <div className="text-[11px] text-muted py-2">Loading integrations...</div>
        ) : integrations.isError ? (
          <div className="text-[11px] text-red-400 py-2">Failed to load integrations</div>
        ) : (
          integrations.data?.data?.map((i: any) => (
            <div key={i.name} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-b-0">
              <span className="text-[12.5px]">{i.name}</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${i.active ? 'text-brand' : 'text-muted'}`}>{i.status}</span>
                <button className="px-2 py-1 text-[11px] text-sub hover:bg-[var(--hover)] rounded-md transition-colors">{i.active ? 'Disconnect' : 'Connect'}</button>
              </div>
            </div>
          ))
        )}
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
