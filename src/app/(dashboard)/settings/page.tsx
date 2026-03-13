'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { Badge } from '@/components/ui';
import {
  useTeamQuery,
  useInvitationsQuery,
  useProfileQuery,
  useUpdateTeamMember,
  useInviteUser,
  useRevokeInvitation,
  useUpdateProfile,
} from '@/lib/queries/settings';

const TABS = ['Team', 'Integrations', 'Agents', 'Profile'] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Team');
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  return (
    <div className="max-w-[700px] page-enter">
      <h1 className="text-[18px] font-semibold tracking-tight mb-3.5">Settings</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-[12px] font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab
                ? 'border-brand text-[var(--text)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--sub)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Team' && <TeamTab isAdmin={isAdmin} />}
      {activeTab === 'Integrations' && <IntegrationsTab />}
      {activeTab === 'Agents' && <AgentsTab />}
      {activeTab === 'Profile' && <ProfileTab />}
    </div>
  );
}

// ─── Team Tab ───────────────────────────────────────────────

function TeamTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: teamData, isLoading: teamLoading } = useTeamQuery();
  const { data: invData } = useInvitationsQuery();
  const updateMember = useUpdateTeamMember();
  const inviteUser = useInviteUser();
  const revokeInvite = useRevokeInvitation();
  const { openDrawer, closeDrawer, addToast } = useStore();
  const { data: session } = useSession();
  const [confirmAction, setConfirmAction] = useState<{ userId: string; field: string; value: string | boolean } | null>(null);

  const team = teamData?.data ?? [];
  const invitations = invData?.data ?? [];

  function handleRoleChange(userId: string, newRole: string) {
    setConfirmAction({ userId, field: 'role', value: newRole });
  }

  function handleToggleActive(userId: string, currentlyActive: boolean) {
    setConfirmAction({ userId, field: 'isActive', value: !currentlyActive });
  }

  function executeConfirmedAction() {
    if (!confirmAction) return;
    const data = confirmAction.field === 'role'
      ? { role: confirmAction.value as string }
      : { isActive: confirmAction.value as boolean };
    updateMember.mutate(
      { id: confirmAction.userId, data },
      {
        onSuccess: () => {
          addToast({ type: 'success', message: confirmAction.field === 'role' ? 'Role updated' : (confirmAction.value ? 'User reactivated' : 'User deactivated') });
          setConfirmAction(null);
        },
        onError: (err) => addToast({ type: 'error', message: err.message }),
      },
    );
  }

  function openInviteDrawer() {
    const state = { email: '', role: 'MEMBER' };
    openDrawer({
      title: 'Invite Team Member',
      subtitle: 'Send an invitation link',
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Email *</span>
            <input
              autoFocus
              type="email"
              onChange={(e) => { state.email = e.target.value; }}
              placeholder="colleague@company.com"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Role</span>
            <select
              defaultValue="MEMBER"
              onChange={(e) => { state.role = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </label>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>
            Cancel
          </button>
          <button
            disabled={inviteUser.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50"
            onClick={() => {
              if (!state.email.trim()) {
                addToast({ type: 'error', message: 'Email is required' });
                return;
              }
              inviteUser.mutate(
                { email: state.email.trim(), role: state.role },
                {
                  onSuccess: (res) => {
                    const link = res?.data?.inviteLink || 'Check server response';
                    navigator.clipboard.writeText(link).catch(() => {});
                    addToast({ type: 'success', message: 'Invitation sent! Link copied to clipboard.' });
                    closeDrawer();
                  },
                  onError: (err) => addToast({ type: 'error', message: err.message }),
                },
              );
            }}
          >
            Send Invitation
          </button>
        </>
      ),
    });
  }

  if (teamLoading) return <div className="animate-pulse space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-[var(--card-hover)] rounded" />)}</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Team Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">Team Members ({team.length})</span>
        {isAdmin && (
          <button onClick={openInviteDrawer} className="px-3 py-1 text-[11px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors">
            Invite Member
          </button>
        )}
      </div>

      {/* Team List */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {team.map((user: any) => (
          <div key={user.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex flex-col">
              <span className="text-[12px] font-medium text-[var(--text)]">
                {user.name}
                {user.id === session?.user?.id && <span className="text-[10px] text-[var(--muted)] ml-1">(you)</span>}
              </span>
              <span className="text-[10px] text-[var(--muted)]">{user.email}</span>
              {user.lastLoginAt && (
                <span className="text-[9px] text-[var(--muted)]">Last active: {new Date(user.lastLoginAt).toLocaleDateString()}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!user.isActive && (
                <span className="text-[10px] font-semibold px-1.5 py-[1px] rounded border border-red-500/30 text-red-400 bg-red-500/10">Inactive</span>
              )}
              {isAdmin && user.id !== session?.user?.id ? (
                <>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="px-2 py-1 text-[11px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <button
                    onClick={() => handleToggleActive(user.id, user.isActive)}
                    className={`px-2 py-1 text-[10px] font-medium rounded-md border transition-colors ${
                      user.isActive
                        ? 'text-red-400 border-red-500/30 hover:bg-red-500/10'
                        : 'text-green-400 border-green-500/30 hover:bg-green-500/10'
                    }`}
                  >
                    {user.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-[var(--sub)] px-2 py-1">{user.role}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--elevated)] border border-[var(--border)] rounded-lg p-4 max-w-sm mx-4">
            <p className="text-[12px] text-[var(--text)] mb-3">
              {confirmAction.field === 'role'
                ? `Change this user's role to ${confirmAction.value}?`
                : confirmAction.value
                  ? 'Reactivate this user? They will be able to sign in again.'
                  : 'Deactivate this user? They will not be able to sign in.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md">
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                disabled={updateMember.isPending}
                className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Invitations (Admin Only) */}
      {isAdmin && invitations.length > 0 && (
        <>
          <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)] mt-2">Pending Invitations ({invitations.length})</span>
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {invitations.map((inv: any) => {
              const daysLeft = Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / 86400000);
              return (
                <div key={inv.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex flex-col">
                    <span className="text-[12px] text-[var(--text)]">{inv.email}</span>
                    <span className="text-[10px] text-[var(--muted)]">Role: {inv.role} &middot; Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={() => revokeInvite.mutate(inv.id, {
                      onSuccess: () => addToast({ type: 'success', message: 'Invitation revoked' }),
                      onError: (err) => addToast({ type: 'error', message: err.message }),
                    })}
                    disabled={revokeInvite.isPending}
                    className="px-2 py-1 text-[10px] font-medium text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Profile Tab ────────────────────────────────────────────

function ProfileTab() {
  const { data: profileData, isLoading } = useProfileQuery();
  const updateProfile = useUpdateProfile();
  const { addToast } = useStore();
  const [formState, setFormState] = useState<{ name: string; initials: string; emailAlerts: boolean; queueAlerts: boolean } | null>(null);

  const profile = profileData?.data;

  // Initialize form state when data loads
  if (profile && !formState) {
    setFormState({
      name: profile.name,
      initials: profile.initials,
      emailAlerts: profile.notificationPrefs?.emailAlerts ?? true,
      queueAlerts: profile.notificationPrefs?.queueAlerts ?? true,
    });
  }

  function handleSave() {
    if (!formState) return;
    updateProfile.mutate(
      {
        name: formState.name,
        initials: formState.initials,
        notificationPrefs: { emailAlerts: formState.emailAlerts, queueAlerts: formState.queueAlerts },
      },
      {
        onSuccess: () => addToast({ type: 'success', message: 'Profile updated' }),
        onError: (err) => addToast({ type: 'error', message: err.message }),
      },
    );
  }

  if (isLoading || !formState) return <div className="animate-pulse space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[var(--card-hover)] rounded" />)}</div>;

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">Your Profile</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 flex flex-col gap-3">
        {/* Read-only fields */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Email</span>
          <span className="px-2.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md">{profile?.email}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Role</span>
          <span className="px-2.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md">{profile?.role}</span>
        </label>

        {/* Editable fields */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Display Name</span>
          <input
            value={formState.name}
            onChange={(e) => setFormState({ ...formState, name: e.target.value })}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Initials (max 3)</span>
          <input
            value={formState.initials}
            maxLength={3}
            onChange={(e) => setFormState({ ...formState, initials: e.target.value })}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40 w-20"
          />
        </label>

        {/* Notification Preferences */}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] mt-2">Notification Preferences</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formState.emailAlerts}
            onChange={(e) => setFormState({ ...formState, emailAlerts: e.target.checked })}
            className="rounded"
          />
          <span className="text-[12px] text-[var(--text)]">Email alerts for new queue items</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formState.queueAlerts}
            onChange={(e) => setFormState({ ...formState, queueAlerts: e.target.checked })}
            className="rounded"
          />
          <span className="text-[12px] text-[var(--text)]">Queue alerts for items needing review</span>
        </label>

        <button
          onClick={handleSave}
          disabled={updateProfile.isPending}
          className="mt-2 px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 self-start"
        >
          {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Integrations Tab ───────────────────────────────────────

function IntegrationsTab() {
  const connectUrl = `/api/auth/connect?provider=microsoft`;

  return (
    <div className="flex flex-col gap-4">
      <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">Integrations</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[var(--text)]">Microsoft Outlook</span>
            <span className="text-[10px] text-[var(--muted)]">Email sync and calendar integration</span>
          </div>
          <a
            href={connectUrl}
            className="px-3 py-1.5 text-[11px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
          >
            Connect Outlook
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Agents Tab ─────────────────────────────────────────────

const AGENTS = [
  { key: 'signal_hunter', name: 'Signal Hunter', status: 'Active · scanning 6 sources daily', desc: 'Monitors news, LinkedIn, registries for GoO market signals', params: ['Sources: Reuters, Bloomberg, LinkedIn, Montel, AIB, ENTSO-E', 'Scan frequency: Every 4 hours', 'Min relevance threshold: 60/100', 'Auto-dismiss below: 30/100'] },
  { key: 'lead_qualifier', name: 'Lead Qualifier', status: 'Active · FIUAC scoring enabled', desc: 'Scores new leads using FIUAC dimensions', params: ['Auto-qualify threshold: FIUAC ≥ 70', 'Auto-disqualify: FIUAC ≤ 25', 'Route to Queue when: 25 < FIUAC < 70'] },
  { key: 'account_enricher', name: 'Account Enricher', status: 'Active · weekly refresh', desc: 'Updates account briefs with new intelligence', params: ['Refresh cycle: Weekly', 'Sources: Signals, email sync, LinkedIn', 'Min confidence for auto-update: 85%', 'Below 85%: Route to Queue'] },
  { key: 'outreach_drafter', name: 'Outreach Drafter', status: 'Active · routed to Queue', desc: 'Generates personalized outreach using account context', params: ['Always route to Queue: Yes', 'Template style: Consultative', 'Personalization sources: Pain, WhyNow, Signals', 'Max sequence length: 4 steps'] },
  { key: 'pipeline_hygiene', name: 'Pipeline Hygiene', status: 'Active · daily health check', desc: 'Monitors deal health and flags stale opportunities', params: ['Stale threshold: 7 days no activity', 'Auto-decay: 5 pts/week engagement', 'Alert when health < 40'] },
  { key: 'inbox_classifier', name: 'Inbox Classifier', status: 'Active · Outlook connected', desc: 'Classifies incoming emails by intent', params: ['Classification types: Positive, Question, Objection, Meeting, OOO, New Domain', 'Auto-link by domain: Enabled', 'New domain detection: Enabled', 'Min classification confidence: 70%'] },
];

function AgentsTab() {
  const { openDrawer, closeDrawer } = useStore();

  function openAgentConfig(key: string) {
    const a = AGENTS.find(x => x.key === key);
    if (!a) return;
    openDrawer({
      title: `${a.name} — Configuration`,
      subtitle: 'AI Agent',
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="ai-box">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">{a.name}</div>
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
            <Badge variant="ok">Active</Badge>
            <span className="text-[10px] text-muted">Last run: —</span>
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-sub hover:bg-[var(--hover)] rounded-md transition-colors" onClick={closeDrawer}>Close</button>
          <button className="px-3.5 py-1.5 text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Pause Agent</button>
        </>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">AI Agents</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {AGENTS.map((agent) => (
          <div key={agent.key} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex flex-col">
              <span className="text-[12.5px] font-medium text-[var(--text)]">{agent.name}</span>
              <span className="text-[10px] text-brand">{agent.status}</span>
            </div>
            <button
              className="px-2 py-1 text-[11px] text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
              onClick={() => openAgentConfig(agent.key)}
            >
              Configure
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
