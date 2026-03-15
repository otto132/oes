'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import { Badge, Sparkline, Spinner } from '@/components/ui';
import { Sun, Moon } from 'lucide-react';
import {
  useTeamQuery,
  useInvitationsQuery,
  useProfileQuery,
  useAgentsQuery,
  useAgentUsageQuery,
  useIntegrationsQuery,
  useUpdateTeamMember,
  useInviteUser,
  useRevokeInvitation,
  useUpdateProfile,
  usePatchAgent,
  useSyncMutation,
} from '@/lib/queries/settings';
import {
  useContactRolesQuery,
  useCreateContactRole,
  useUpdateContactRole,
} from '@/lib/queries/contact-roles';
import { useAgentAnalyticsQuery } from '@/lib/queries/agent-analytics';

const TABS = ['Team', 'Integrations', 'Agents', 'Profile', 'Roles', 'Appearance'] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Team');
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  return (
    <div className="max-w-[700px] page-enter">
      <h1 className="text-2xl font-semibold tracking-tight mb-3.5">Settings</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
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
      {activeTab === 'Roles' && <RolesTab isAdmin={isAdmin} />}
      {activeTab === 'Appearance' && <AppearanceTab />}
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
        onError: (err: any) => addToast({ type: 'error', message: err.message }),
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
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Email *</span>
            <input
              autoFocus
              type="email"
              onChange={(e) => { state.email = e.target.value; }}
              placeholder="colleague@company.com"
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Role</span>
            <select
              defaultValue="MEMBER"
              onChange={(e) => { state.role = e.target.value; }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
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
          <button className="px-3.5 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>
            Cancel
          </button>
          <button
            disabled={inviteUser.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50"
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
                  onError: (err: any) => addToast({ type: 'error', message: err.message }),
                },
              );
            }}
          >
            {inviteUser.isPending && <Spinner className="h-3 w-3" />}Send Invitation
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
        <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)]">Team Members ({team.length})</span>
        {isAdmin && (
          <button onClick={openInviteDrawer} className="px-3 py-1 text-xs font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors">
            Invite Member
          </button>
        )}
      </div>

      {/* Team List */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {team.map((user: any) => (
          <div key={user.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--text)]">
                {user.name}
                {user.id === session?.user?.id && <span className="text-2xs text-[var(--muted)] ml-1">(you)</span>}
              </span>
              <span className="text-2xs text-[var(--muted)]">{user.email}</span>
              {user.lastLoginAt && (
                <span className="text-3xs text-[var(--muted)]">Last active: {new Date(user.lastLoginAt).toLocaleDateString()}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!user.isActive && (
                <span className="text-2xs font-semibold px-1.5 py-[1px] rounded border border-red-500/30 text-red-400 bg-red-500/10">Inactive</span>
              )}
              {isAdmin && user.id !== session?.user?.id ? (
                <>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="px-2 py-1 text-xs rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <button
                    onClick={() => handleToggleActive(user.id, user.isActive)}
                    className={`px-2 py-1 text-2xs font-medium rounded-md border transition-colors ${
                      user.isActive
                        ? 'text-red-400 border-red-500/30 hover:bg-red-500/10'
                        : 'text-green-400 border-green-500/30 hover:bg-green-500/10'
                    }`}
                  >
                    {user.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </>
              ) : (
                <span className="text-xs text-[var(--sub)] px-2 py-1">{user.role}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--elevated)] border border-[var(--border)] rounded-lg p-4 max-w-sm mx-4">
            <p className="text-sm text-[var(--text)] mb-3">
              {confirmAction.field === 'role'
                ? `Change this user's role to ${confirmAction.value}?`
                : confirmAction.value
                  ? 'Reactivate this user? They will be able to sign in again.'
                  : 'Deactivate this user? They will not be able to sign in.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md">
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                disabled={updateMember.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 disabled:opacity-50"
              >
                {updateMember.isPending && <Spinner className="h-3 w-3" />}Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Invitations (Admin Only) */}
      {isAdmin && invitations.length > 0 && (
        <>
          <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)] mt-2">Pending Invitations ({invitations.length})</span>
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {invitations.map((inv: any) => {
              const daysLeft = Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / 86400000);
              return (
                <div key={inv.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex flex-col">
                    <span className="text-sm text-[var(--text)]">{inv.email}</span>
                    <span className="text-2xs text-[var(--muted)]">Role: {inv.role} &middot; Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={() => revokeInvite.mutate(inv.id, {
                      onSuccess: () => addToast({ type: 'success', message: 'Invitation revoked' }),
                      onError: (err: any) => addToast({ type: 'error', message: err.message }),
                    })}
                    disabled={revokeInvite.isPending}
                    className="inline-flex items-center gap-1 px-2 py-1 text-2xs font-medium text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {revokeInvite.isPending && <Spinner className="h-3 w-3" />}Revoke
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
        onError: (err: any) => addToast({ type: 'error', message: err.message }),
      },
    );
  }

  if (isLoading || !formState) return <div className="animate-pulse space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[var(--card-hover)] rounded" />)}</div>;

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)]">Your Profile</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 flex flex-col gap-3">
        {/* Read-only fields */}
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Email</span>
          <span className="px-2.5 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md">{profile?.email}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Role</span>
          <span className="px-2.5 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md">{profile?.role}</span>
        </label>

        {/* Editable fields */}
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Display Name</span>
          <input
            value={formState.name}
            onChange={(e) => setFormState({ ...formState, name: e.target.value })}
            className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Initials (max 3)</span>
          <input
            value={formState.initials}
            maxLength={3}
            onChange={(e) => setFormState({ ...formState, initials: e.target.value })}
            className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40 w-20"
          />
        </label>

        {/* Notification Preferences */}
        <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)] mt-2">Notification Preferences</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formState.emailAlerts}
            onChange={(e) => setFormState({ ...formState, emailAlerts: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm text-[var(--text)]">Email alerts for new queue items</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formState.queueAlerts}
            onChange={(e) => setFormState({ ...formState, queueAlerts: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm text-[var(--text)]">Queue alerts for items needing review</span>
        </label>

        <button
          onClick={handleSave}
          disabled={updateProfile.isPending}
          className="inline-flex items-center gap-1.5 mt-2 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 self-start"
        >
          {updateProfile.isPending && <Spinner className="h-3 w-3" />}{updateProfile.isPending ? 'Saving...' : 'Save Changes'}
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
  const addToast = useStore(s => s.addToast);

  function handleSync() {
    syncMutation.mutate('all');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)]">Integrations</span>
        {isAdmin && (
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-2xs font-medium bg-brand text-brand-on rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {syncMutation.isPending && <Spinner className="h-3 w-3" />}{syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
          </button>
        )}
      </div>

      {syncMutation.isSuccess && (
        <div className="text-2xs text-brand bg-brand/10 px-3 py-1.5 rounded-md">
          Sync complete — {syncMutation.data?.synced ?? 0} items synced
          {(syncMutation.data?.errors?.length ?? 0) > 0 && `, ${syncMutation.data.errors.length} errors`}
        </div>
      )}
      {syncMutation.isError && (
        <div className="text-2xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-md">
          Sync failed — {syncMutation.error instanceof Error ? syncMutation.error.message : 'Unknown error'}
        </div>
      )}

      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
        {integrations.isLoading ? (
          <div className="text-xs text-muted py-2">Loading integrations...</div>
        ) : integrations.isError ? (
          <div className="text-xs text-red-400 py-2">Failed to load integrations</div>
        ) : (
          integrations.data?.data?.map((i: any) => (
            <div key={i.provider || i.name} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">{i.name}</span>
                <div className="flex items-center gap-2 text-3xs text-muted">
                  {i.lastSyncAt && <span>Last sync: {new Date(i.lastSyncAt).toLocaleString()}</span>}
                  {i.emailsSynced != null && <span>{i.emailsSynced} emails</span>}
                  {i.meetingsSynced != null && <span>{i.meetingsSynced} meetings</span>}
                </div>
                {i.lastError && (
                  <span className="text-3xs text-red-400">{i.lastError}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-2xs ${i.active ? 'text-brand' : i.needsReconnect ? 'text-red-400' : 'text-muted'}`}>
                  {i.active ? 'Connected' : i.needsReconnect ? 'Reconnect' : i.status === 'manual' ? 'Manual' : 'Disconnected'}
                </span>
                {i.provider !== 'linkedin' && (
                  <button
                    className="px-2 py-1 text-xs text-sub hover:bg-[var(--hover)] rounded-md transition-colors"
                    onClick={() => {
                      if (i.active && !i.needsReconnect) {
                        addToast({ type: 'info', message: 'Disconnect is not yet supported. Contact an admin.' });
                      } else {
                        window.location.href = '/api/auth/connect';
                      }
                    }}
                  >
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

// ─── Agent Performance Section ───────────────────────────────

function AgentPerformanceSection() {
  const { data, isLoading, isError } = useAgentAnalyticsQuery();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  if (isLoading) return (
    <div className="animate-pulse space-y-2 mt-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-9 bg-[var(--card-hover)] rounded" />)}
    </div>
  );

  if (isError) return (
    <div className="text-xs text-red-400 mt-4">Failed to load agent performance data</div>
  );

  const agents: any[] = data?.agents ?? [];
  const overall = data?.overall;

  if (!agents.length) return null;

  return (
    <div className="flex flex-col gap-3 mt-4">
      <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)]">Agent Performance (30d)</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-[var(--border)]">
          <span className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)]">Agent</span>
          <span className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)] text-right">Approval</span>
          <span className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)] text-right">Items</span>
          <span className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)] text-right">Runs</span>
          <span className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)]">Trend</span>
        </div>

        {/* Table Rows */}
        {agents.map((agent: any) => {
          const name: string = agent.agentName ?? agent.name ?? '';
          const displayName = name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          const approvalRate: number = agent.approvalRate ?? 0;
          const approvalPct = Math.round(approvalRate * 100);
          const approvalColor = approvalPct >= 80
            ? 'text-brand'
            : approvalPct >= 60
              ? 'text-warn'
              : 'text-red-400';
          const itemsByDay: number[] = agent.itemsByDay ?? [];
          const isExpanded = expandedAgent === name;

          return (
            <div key={name} className="border-b border-[var(--border)] last:border-b-0">
              <button
                className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2.5 hover:bg-[var(--hover)] transition-colors text-left"
                onClick={() => setExpandedAgent(isExpanded ? null : name)}
              >
                <span className="text-sm font-medium text-[var(--text)] truncate">{displayName}</span>
                <span className={`text-sm font-semibold font-mono ${approvalColor} text-right tabular-nums`}>
                  {approvalPct}%
                </span>
                <span className="text-sm text-[var(--sub)] text-right tabular-nums">{agent.itemsCreated ?? 0}</span>
                <span className="text-sm text-[var(--sub)] text-right tabular-nums">{agent.runs ?? 0}</span>
                <span className="flex items-center">
                  <Sparkline
                    data={itemsByDay}
                    width={80}
                    height={20}
                    color={approvalPct >= 80 ? '#3ecf8e' : approvalPct >= 60 ? '#f59e0b' : '#f87171'}
                  />
                </span>
              </button>

              {/* Expanded: top rejection reasons */}
              {isExpanded && overall?.topRejectionReasons && (
                <div className="px-4 pb-3 pt-1 bg-[var(--surface)] border-t border-[var(--border)]">
                  <span className="text-3xs font-semibold uppercase tracking-wide text-[var(--muted)] block mb-1.5">
                    Top Rejection Reasons
                  </span>
                  {overall.topRejectionReasons.length === 0 ? (
                    <span className="text-xs text-[var(--muted)]">No rejections in this period</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {overall.topRejectionReasons.map((r: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="text-xs text-[var(--sub)]">{r.reason ?? r.label ?? r}</span>
                          {r.count != null && (
                            <span className="text-2xs font-semibold text-[var(--muted)] tabular-nums">{r.count}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Schedule presets ────────────────────────────────────────

const SCHEDULE_PRESETS = [
  { label: 'Every 4 hours', cron: '0 */4 * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Weekly Monday', cron: '0 6 * * 1' },
  { label: 'Manual only', cron: '' },
] as const;

function cronToLabel(cron: string | undefined): string {
  if (!cron) return 'Default';
  const match = SCHEDULE_PRESETS.find((p) => p.cron === cron);
  return match?.label ?? cron;
}

// ─── Agents Tab ─────────────────────────────────────────────

function AgentsTab() {
  const { openDrawer, closeDrawer, addToast } = useStore();
  const agents = useAgentsQuery();
  const patchAgent = usePatchAgent();
  const { data: usageData } = useAgentUsageQuery('today');

  const capUsedPercent = usageData?.capUsedPercent ?? 0;
  const totalCostToday = usageData?.totalCostUsd ?? 0;
  const dailyCapUsd = usageData?.dailyCapUsd ?? 10;

  function openAgentConfig(agent: { name: string; displayName: string; description: string; status: string; parameters: Record<string, unknown>; lastRunAt?: string }) {
    const isPaused = agent.status === 'paused';
    const params = agent.parameters ?? {};
    const agentUsage = usageData?.byAgent?.find((a: any) => a.agent === agent.name);

    const state = {
      schedule: (params.schedule as string) ?? '',
      model: (params.model as string) ?? '',
      maxRunsPerDay: params.maxRunsPerDay ? String(params.maxRunsPerDay) : '',
    };

    openDrawer({
      title: `${agent.displayName} — Configuration`,
      subtitle: 'AI Agent',
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="ai-box">
            <div className="text-3xs font-semibold tracking-widest uppercase text-brand mb-1">{agent.displayName}</div>
            <p className="text-sm text-sub">{agent.description}</p>
          </div>

          {/* Guardrail settings */}
          <div>
            <div className="text-3xs font-semibold tracking-wide uppercase text-muted mb-2">Agent Settings</div>
            <div className="flex flex-col gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Schedule</span>
                <select
                  defaultValue={state.schedule}
                  onChange={(e) => { state.schedule = e.target.value; }}
                  className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
                >
                  <option value="">Default (agent built-in)</option>
                  {SCHEDULE_PRESETS.map((p) => (
                    <option key={p.cron} value={p.cron}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Model</span>
                <select
                  defaultValue={state.model}
                  onChange={(e) => { state.model = e.target.value; }}
                  className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
                >
                  <option value="">Default (agent built-in)</option>
                  <option value="claude-sonnet-4-6">Sonnet (higher quality)</option>
                  <option value="claude-haiku-4-5">Haiku (faster, cheaper)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Max runs/day</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={state.maxRunsPerDay}
                  placeholder="No limit"
                  onChange={(e) => { state.maxRunsPerDay = e.target.value; }}
                  className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 w-28"
                />
              </label>
            </div>
          </div>

          {/* Cost / usage display */}
          {agentUsage && (
            <div>
              <div className="text-3xs font-semibold tracking-wide uppercase text-muted mb-2">Today&apos;s Usage</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between py-1.5 px-2 border border-[var(--border)] rounded-md">
                  <span className="text-xs text-sub">API calls</span>
                  <span className="text-xs font-medium text-[var(--text)] tabular-nums">{agentUsage.calls}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 px-2 border border-[var(--border)] rounded-md">
                  <span className="text-xs text-sub">Tokens (in/out)</span>
                  <span className="text-xs font-medium text-[var(--text)] tabular-nums">
                    {(agentUsage.inputTokens / 1000).toFixed(1)}k / {(agentUsage.outputTokens / 1000).toFixed(1)}k
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 px-2 border border-[var(--border)] rounded-md">
                  <span className="text-xs text-sub">Cost today</span>
                  <span className="text-xs font-semibold text-brand tabular-nums">${agentUsage.costUsd.toFixed(2)}</span>
                </div>
                {agentUsage.maxRunsPerDay && (
                  <div className="flex items-center justify-between py-1.5 px-2 border border-[var(--border)] rounded-md">
                    <span className="text-xs text-sub">Runs today</span>
                    <span className="text-xs font-medium text-[var(--text)] tabular-nums">{agentUsage.runsToday} / {agentUsage.maxRunsPerDay}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Other parameters (read-only) */}
          {Object.entries(params).filter(([k]) => !['schedule', 'model', 'maxRunsPerDay'].includes(k)).length > 0 && (
            <div>
              <div className="text-3xs font-semibold tracking-wide uppercase text-muted mb-2">Other Parameters</div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(params)
                  .filter(([k]) => !['schedule', 'model', 'maxRunsPerDay'].includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between py-1.5 px-2 border border-[var(--border)] rounded-md">
                      <span className="text-xs text-sub">{k.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-medium text-[var(--text)]">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <Badge variant={isPaused ? 'neutral' : 'ok'}>{isPaused ? 'Paused' : 'Active'}</Badge>
            <span className="text-2xs text-muted">
              {params.schedule ? `Schedule: ${cronToLabel(params.schedule as string)}` : 'Default schedule'}
            </span>
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-sub hover:bg-[var(--hover)] rounded-md transition-colors" onClick={closeDrawer}>Close</button>
          <button
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50"
            disabled={patchAgent.isPending}
            onClick={() => {
              const newParams: Record<string, unknown> = {};
              if (state.schedule !== (params.schedule ?? '')) newParams.schedule = state.schedule || undefined;
              if (state.model !== (params.model ?? '')) newParams.model = state.model || undefined;
              if (state.maxRunsPerDay !== (params.maxRunsPerDay ? String(params.maxRunsPerDay) : '')) {
                newParams.maxRunsPerDay = state.maxRunsPerDay ? Number(state.maxRunsPerDay) : undefined;
              }

              const hasParamChanges = Object.keys(newParams).length > 0;
              patchAgent.mutate(
                {
                  name: agent.name,
                  data: {
                    ...(hasParamChanges ? { parameters: newParams } : {}),
                  },
                },
                {
                  onSuccess: () => {
                    addToast({ type: 'success', message: 'Agent settings saved' });
                    closeDrawer();
                  },
                  onError: (err: any) => addToast({ type: 'error', message: err.message }),
                },
              );
            }}
          >
            {patchAgent.isPending && <Spinner className="h-3 w-3" />}Save Settings
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
            disabled={patchAgent.isPending}
            onClick={() => {
              patchAgent.mutate(
                { name: agent.name, data: { status: isPaused ? 'active' : 'paused' } },
                { onSuccess: () => closeDrawer() },
              );
            }}
          >
            {isPaused ? 'Resume Agent' : 'Pause Agent'}
          </button>
        </>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Global spend cap banner */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)]">Daily Spend</span>
          <span className="text-xs font-semibold tabular-nums text-[var(--text)]">
            ${totalCostToday.toFixed(2)} / ${dailyCapUsd.toFixed(2)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${capUsedPercent >= 90 ? 'bg-red-400' : capUsedPercent >= 70 ? 'bg-amber-400' : 'bg-brand'}`}
            style={{ width: `${Math.min(capUsedPercent, 100)}%` }}
          />
        </div>
        <span className="text-3xs text-[var(--muted)] mt-1 block">
          Set via AI_DAILY_SPEND_CAP_USD environment variable
        </span>
      </div>

      <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)]">AI Agents</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {agents.isLoading ? (
          <div className="text-xs text-muted py-4 px-4">Loading agents...</div>
        ) : agents.isError ? (
          <div className="text-xs text-red-400 py-4 px-4">Failed to load agents</div>
        ) : (
          agents.data?.data?.map((a: any) => {
            const agentCost = usageData?.byAgent?.find((u: any) => u.agent === a.name);
            return (
              <div key={a.name} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-[var(--text)]">{a.displayName}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xs ${a.status === 'paused' ? 'text-muted' : 'text-brand'}`}>
                      {a.status === 'paused' ? 'Paused' : 'Active'}
                    </span>
                    {agentCost && agentCost.costUsd > 0 && (
                      <span className="text-2xs text-[var(--muted)] tabular-nums">${agentCost.costUsd.toFixed(2)} today</span>
                    )}
                  </div>
                </div>
                <button
                  className="px-2 py-1 text-xs text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
                  onClick={() => openAgentConfig(a)}
                >
                  Configure
                </button>
              </div>
            );
          })
        )}
      </div>

      <AgentPerformanceSection />
    </div>
  );
}

// ─── Appearance Tab ──────────────────────────────────────────

function AppearanceTab() {
  const theme = useStore(s => s.theme);
  const toggleTheme = useStore(s => s.toggleTheme);

  const options: { value: 'light' | 'dark'; label: string; icon: typeof Sun; description: string }[] = [
    { value: 'light', label: 'Light', icon: Sun, description: 'Clean and bright interface' },
    { value: 'dark', label: 'Dark', icon: Moon, description: 'Easier on the eyes in low light' },
  ];

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)]">Theme</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 flex flex-col gap-2">
        {options.map(opt => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => { if (!active) toggleTheme(); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md border transition-colors text-left ${
                active
                  ? 'border-brand bg-brand/[.06]'
                  : 'border-[var(--border)] hover:bg-[var(--hover)]'
              }`}
            >
              <opt.icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-brand' : 'text-[var(--muted)]'}`} />
              <div className="flex flex-col">
                <span className={`text-sm font-medium ${active ? 'text-[var(--text)]' : 'text-[var(--sub)]'}`}>{opt.label}</span>
                <span className="text-2xs text-[var(--muted)]">{opt.description}</span>
              </div>
              {active && (
                <span className="ml-auto text-2xs font-semibold text-brand">Active</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Roles Tab ───────────────────────────────────────────────

function RolesTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: rolesData, isLoading, isError } = useContactRolesQuery();
  const createRole = useCreateContactRole();
  const updateRole = useUpdateContactRole();
  const { addToast } = useStore();
  const [newLabel, setNewLabel] = useState('');

  const roles: any[] = rolesData?.data ?? [];
  const activeRoles = roles.filter((r: any) => !r.isArchived);
  const archivedRoles = roles.filter((r: any) => r.isArchived);

  function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    createRole.mutate(
      { label },
      {
        onSuccess: () => {
          addToast({ type: 'success', message: `Role "${label}" added` });
          setNewLabel('');
        },
        onError: (err: any) => addToast({ type: 'error', message: err.message }),
      },
    );
  }

  function handleArchive(role: any) {
    updateRole.mutate(
      { id: role.id, isArchived: true },
      {
        onSuccess: () => addToast({ type: 'success', message: `"${role.label}" archived` }),
        onError: (err: any) => addToast({ type: 'error', message: err.message }),
      },
    );
  }

  function handleRestore(role: any) {
    updateRole.mutate(
      { id: role.id, isArchived: false },
      {
        onSuccess: () => addToast({ type: 'success', message: `"${role.label}" restored` }),
        onError: (err: any) => addToast({ type: 'error', message: err.message }),
      },
    );
  }

  if (isLoading) return <div className="animate-pulse space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[var(--card-hover)] rounded" />)}</div>;
  if (isError) return <div className="text-xs text-red-400 py-4">Failed to load roles</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)]">Contact Roles ({activeRoles.length})</span>
      </div>

      {/* Active roles list */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {activeRoles.map((role: any) => (
          <div key={role.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text)]">{role.label}</span>
              {role.isDefault && (
                <span className="text-3xs font-semibold px-1.5 py-[1px] rounded border border-brand/30 text-brand bg-brand/[.06]">Default</span>
              )}
            </div>
            {isAdmin && !role.isDefault && (
              <button
                onClick={() => handleArchive(role)}
                disabled={updateRole.isPending}
                className="px-2 py-1 text-2xs font-medium text-[var(--muted)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              >
                Archive
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add new role (admin only) */}
      {isAdmin && (
        <div className="flex gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="New role name..."
            maxLength={50}
            className="flex-1 px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
          />
          <button
            onClick={handleAdd}
            disabled={createRole.isPending || !newLabel.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50"
          >
            {createRole.isPending && <Spinner className="h-3 w-3" />}Add
          </button>
        </div>
      )}

      {/* Archived roles */}
      {archivedRoles.length > 0 && (
        <>
          <span className="text-3xs font-semibold tracking-wide uppercase text-[var(--muted)] mt-2">Archived ({archivedRoles.length})</span>
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {archivedRoles.map((role: any) => (
              <div key={role.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-[var(--muted)]">{role.label}</span>
                {isAdmin && (
                  <button
                    onClick={() => handleRestore(role)}
                    disabled={updateRole.isPending}
                    className="px-2 py-1 text-2xs font-medium text-brand border border-brand/30 rounded-md hover:bg-brand/[.06] transition-colors disabled:opacity-50"
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
