'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { Badge } from '@/components/ui';
import {
  useTeamQuery,
  useInvitationsQuery,
  useProfileQuery,
  useAgentsQuery,
  useIntegrationsQuery,
  useUpdateTeamMember,
  useInviteUser,
  useRevokeInvitation,
  useUpdateProfile,
  usePatchAgent,
  useSyncMutation,
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
  const integrations = useIntegrationsQuery();
  const syncMutation = useSyncMutation();
  const session = useSession();
  const isAdmin = session.data?.user?.role === 'ADMIN';

  function handleSync() {
    syncMutation.mutate('all');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">Integrations</span>
        {isAdmin && (
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="px-3 py-1 text-[10px] font-medium bg-brand text-white rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
          </button>
        )}
      </div>

      {syncMutation.isSuccess && (
        <div className="text-[10px] text-brand bg-brand/10 px-3 py-1.5 rounded-md">
          Sync complete — {syncMutation.data?.synced ?? 0} items synced
          {(syncMutation.data?.errors?.length ?? 0) > 0 && `, ${syncMutation.data.errors.length} errors`}
        </div>
      )}
      {syncMutation.isError && (
        <div className="text-[10px] text-red-400 bg-red-400/10 px-3 py-1.5 rounded-md">
          Sync failed — {syncMutation.error instanceof Error ? syncMutation.error.message : 'Unknown error'}
        </div>
      )}

      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
        {integrations.isLoading ? (
          <div className="text-[11px] text-muted py-2">Loading integrations...</div>
        ) : integrations.isError ? (
          <div className="text-[11px] text-red-400 py-2">Failed to load integrations</div>
        ) : (
          integrations.data?.data?.map((i: any) => (
            <div key={i.provider || i.name} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-[12.5px]">{i.name}</span>
                <div className="flex items-center gap-2 text-[9px] text-muted">
                  {i.lastSyncAt && <span>Last sync: {new Date(i.lastSyncAt).toLocaleString()}</span>}
                  {i.emailsSynced != null && <span>{i.emailsSynced} emails</span>}
                  {i.meetingsSynced != null && <span>{i.meetingsSynced} meetings</span>}
                </div>
                {i.lastError && (
                  <span className="text-[9px] text-red-400">{i.lastError}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${i.active ? 'text-brand' : i.needsReconnect ? 'text-red-400' : 'text-muted'}`}>
                  {i.active ? 'Connected' : i.needsReconnect ? 'Reconnect' : i.status === 'manual' ? 'Manual' : 'Disconnected'}
                </span>
                {i.provider !== 'linkedin' && (
                  <button className="px-2 py-1 text-[11px] text-sub hover:bg-[var(--hover)] rounded-md transition-colors">
                    {i.needsReconnect ? 'Reconnect' : i.active ? 'Disconnect' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Agents Tab ─────────────────────────────────────────────

function AgentsTab() {
  const { openDrawer, closeDrawer } = useStore();
  const agents = useAgentsQuery();
  const patchAgent = usePatchAgent();

  function openAgentConfig(agent: { name: string; displayName: string; description: string; status: string; parameters: Record<string, string> }) {
    const isPaused = agent.status === 'paused';
    openDrawer({
      title: `${agent.displayName} — Configuration`,
      subtitle: 'AI Agent',
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="ai-box">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">{agent.displayName}</div>
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
            <Badge variant={isPaused ? 'neutral' : 'ok'}>{isPaused ? 'Paused' : 'Active'}</Badge>
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
    <div className="flex flex-col gap-4">
      <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">AI Agents</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {agents.isLoading ? (
          <div className="text-[11px] text-muted py-4 px-4">Loading agents...</div>
        ) : agents.isError ? (
          <div className="text-[11px] text-red-400 py-4 px-4">Failed to load agents</div>
        ) : (
          agents.data?.data?.map((a: any) => (
            <div key={a.name} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex flex-col">
                <span className="text-[12.5px] font-medium text-[var(--text)]">{a.displayName}</span>
                <span className={`text-[10px] ${a.status === 'paused' ? 'text-muted' : 'text-brand'}`}>
                  {a.status === 'paused' ? 'Paused' : 'Active'}
                </span>
              </div>
              <button
                className="px-2 py-1 text-[11px] text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
                onClick={() => openAgentConfig(a)}
              >
                Configure
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
