import React from 'react';
import {
  Activity,
  Bell,
  Compass,
  Cpu,
  Database,
  FolderOpen,
  GitCompare,
  Globe,
  Lock,
  LogOut,
  Mic,
  Moon,
  Play,
  Shield,
  Sun,
  Upload,
  User,
  Zap,
  Eye,
  BookOpen,
  KeyRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useFirebase } from '../lib/FirebaseProvider';
import { useTheme } from '../contexts/ThemeContext';
import { canAccessPermission, hasPermission, type Permission } from '../lib/authorization';

type SettingsTab =
  | 'Identity'
  | 'Voice Playbook'
  | 'Protocols'
  | 'Notifications'
  | 'Integration'
  | 'Security';

interface SettingsSection {
  title: SettingsTab;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
  minimumRole?: string;
}

function SettingCard({
  title,
  value,
  detail,
  accent = 'primary',
}: {
  title: string;
  value: string;
  detail: string;
  accent?: 'primary' | 'secondary' | 'success' | 'warning';
}) {
  const accentClass =
    accent === 'secondary'
      ? 'text-secondary border-secondary/20 bg-secondary/5'
      : accent === 'success'
        ? 'text-success border-success/20 bg-success/5'
        : accent === 'warning'
          ? 'text-warning border-warning/20 bg-warning/5'
          : 'text-primary border-primary/20 bg-primary/5';

  return (
    <div className={`rounded-xl border p-4 ${accentClass}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.22em] opacity-70">{title}</p>
      <p className="mt-2 text-base font-black tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed opacity-80">{detail}</p>
    </div>
  );
}

function SectionLocked({
  tab,
  role,
  minimumRole,
}: {
  tab: SettingsTab;
  role: string;
  minimumRole: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-4 rounded-xl border border-outline/10 bg-surface-container-low px-6 py-10 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-outline/10 bg-surface-container">
        <Lock className="h-6 w-6 text-on-surface/35" />
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface/35">{tab} requires authorization</p>
        <p className="mx-auto max-w-xl text-sm text-on-surface/65">
          Your current role is <span className="font-bold">{role}</span>. Access to this section is limited to{' '}
          <span className="font-bold">{minimumRole}</span> because it can expose operational or security-sensitive controls.
        </p>
      </div>
    </motion.div>
  );
}

function VoiceSelector() {
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem('smartCharter.voiceName');
    } catch {
      return null;
    }
  });

  React.useEffect(() => {
    const load = () => {
      const availableVoices = window.speechSynthesis.getVoices() || [];
      setVoices(availableVoices);
    };

    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const handle = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value || null;
    setSelected(name);
    try {
      localStorage.setItem('smartCharter.voiceName', name || '');
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('smart-charter-voice-changed', { detail: name }));
    } catch {}
  };

  return (
    <div className="space-y-2">
      <select
        value={selected ?? ''}
        onChange={handle}
        className="w-full rounded-lg border border-outline/10 bg-surface px-3 py-2 text-sm text-on-surface outline-none"
      >
        <option value="">(Browser default)</option>
        {voices.map((voice) => (
          <option key={`${voice.name}|${voice.lang}`} value={voice.name}>
            {voice.name} - {voice.lang}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-on-surface/55">Choose a browser-provided voice for the assistant. Changes apply immediately.</p>
    </div>
  );
}

export default function Settings() {
  const { user, userProfile, role, logout } = useFirebase();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = React.useState<SettingsTab>('Identity');
  const [voiceCount, setVoiceCount] = React.useState(0);
  const [micPermission, setMicPermission] = React.useState<'granted' | 'prompt' | 'denied' | 'unsupported'>('unsupported');

  const sections: SettingsSection[] = [
    { title: 'Identity', icon: User },
    { title: 'Voice Playbook', icon: Mic },
    { title: 'Protocols', icon: Shield, permission: 'settings.protocols.read', minimumRole: 'manager' },
    { title: 'Notifications', icon: Bell, permission: 'settings.notifications.read', minimumRole: 'manager' },
    { title: 'Integration', icon: Database, permission: 'settings.integration.read', minimumRole: 'admin' },
    { title: 'Security', icon: Lock, permission: 'settings.security.read', minimumRole: 'admin' },
  ];

  const userRole = role || 'user';
  const visibleSections = sections.filter((section) => canAccessPermission(userRole, section.permission));

  React.useEffect(() => {
    const availableVoices = window.speechSynthesis?.getVoices?.() || [];
    setVoiceCount(availableVoices.length);
  }, []);

  React.useEffect(() => {
    let active = true;

    async function loadPermission() {
      if (!('permissions' in navigator) || !navigator.permissions?.query) {
        setMicPermission('unsupported');
        return;
      }

      try {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (!active) return;
        setMicPermission(permission.state);
        permission.onchange = () => {
          if (active) setMicPermission(permission.state);
        };
      } catch {
        if (active) setMicPermission('unsupported');
      }
    }

    loadPermission();
    return () => {
      active = false;
    };
  }, []);

  const activeSection = sections.find((section) => section.title === activeTab) || sections[0];
  const canAccessActiveTab = !activeSection.permission || hasPermission(userRole, activeSection.permission);
  const publicFirebaseProject = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'Not configured';
  const publicDatabaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)';
  const speechmaticsRegion = import.meta.env.VITE_SPEECHMATICS_REGION || 'Not configured';

  React.useEffect(() => {
    if (!visibleSections.some((section) => section.title === activeTab)) {
      setActiveTab(visibleSections[0]?.title || 'Identity');
    }
  }, [activeTab, visibleSections]);

  const protocolCards = [
    {
      title: 'Ownership Model',
      value: 'Per-user isolation',
      detail: 'Contracts, projects, e-sign docs, and insights are scoped by owner and Firestore rules.',
      accent: 'primary' as const,
    },
    {
      title: 'RAG Storage',
      value: 'Server-only vectors',
      detail: 'Embedding chunks are denied to the client and written through the admin server only.',
      accent: 'success' as const,
    },
    {
      title: 'AI Access',
      value: 'Bearer token required',
      detail: 'Sensitive AI endpoints are protected by verified Firebase ID tokens before model calls run.',
      accent: 'secondary' as const,
    },
  ];

  const notificationCards = [
    {
      title: 'Browser Notifications',
      value: typeof Notification === 'undefined' ? 'Unsupported' : Notification.permission,
      detail: 'Client-side notification availability in this browser session.',
      accent: typeof Notification === 'undefined' ? 'warning' as const : 'primary' as const,
    },
    {
      title: 'Email Verification',
      value: user?.emailVerified ? 'Verified' : 'Unverified',
      detail: 'Used for trust and workflow identity confirmation.',
      accent: user?.emailVerified ? 'success' as const : 'warning' as const,
    },
    {
      title: 'Alert Channel',
      value: 'In-app signals',
      detail: 'Risk, review, and workflow notifications are surfaced inside the authenticated workspace.',
      accent: 'secondary' as const,
    },
  ];

  const integrationCards = [
    {
      title: 'Firebase Project',
      value: publicFirebaseProject,
      detail: `Connected via public client configuration. Active database: ${publicDatabaseId}.`,
      accent: publicFirebaseProject === 'Not configured' ? 'warning' as const : 'success' as const,
    },
    {
      title: 'Speech Region',
      value: speechmaticsRegion,
      detail: 'Realtime voice token requests depend on this configured region.',
      accent: speechmaticsRegion === 'Not configured' ? 'warning' as const : 'secondary' as const,
    },
    {
      title: 'Server AI Secrets',
      value: 'Hidden from client',
      detail: 'Model keys stay server-side; this panel intentionally shows status only, never secret values.',
      accent: 'primary' as const,
    },
  ];

  const securityCards = [
    {
      title: 'Role',
      value: userRole,
      detail: 'Sensitive settings are gated by role-based authorization before controls are shown.',
      accent: userRole === 'admin' || userRole === 'owner' ? 'success' as const : 'primary' as const,
    },
    {
      title: 'Auth Providers',
      value: user?.providerData?.map((provider) => provider.providerId).join(', ') || 'Unknown',
      detail: 'Authentication providers linked to the current workspace account.',
      accent: 'secondary' as const,
    },
    {
      title: 'Session Identity',
      value: user?.uid ? 'Authenticated' : 'Unavailable',
      detail: 'Security-sensitive backend routes validate the active Firebase session token.',
      accent: user?.uid ? 'success' as const : 'warning' as const,
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        <header id="walkthrough-settings-view" className="space-y-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.35em] text-primary/60">System Configuration</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-black leading-none tracking-tight text-on-surface sm:text-3xl">Settings</h1>
              <p className="mt-2 text-sm text-on-surface/60">Controls and diagnostics are now driven by live account state and role-based authorization.</p>
            </div>
            <div className="flex items-center gap-2 self-start rounded-full border border-outline/10 bg-surface-container px-3 py-1.5">
              <KeyRound className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface/70">Role: {userRole}</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-[240px_1fr]">
          <aside className="space-y-1">
            {visibleSections.map((section) => {
              const isActive = activeTab === section.title;
              return (
                <button
                  key={section.title}
                  onClick={() => setActiveTab(section.title)}
                  className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] transition-all ${
                    isActive ? 'bg-primary/8 text-on-primary shadow-sm' : 'text-on-surface/45 hover:bg-surface-container/60 hover:text-on-surface/90'
                  }`}
                >
                  <section.icon className={`h-4 w-4 ${isActive ? 'opacity-100' : 'opacity-70'}`} />
                  <span className="truncate">{section.title}</span>
                  {isActive && <motion.div layoutId="settings-active-tab" className="absolute left-0 h-5 w-1 rounded-full bg-on-primary" />}
                </button>
              );
            })}
          </aside>

          <main className="space-y-6">
            {activeTab === 'Identity' && (
              <>
                <section className="rounded-xl border border-outline/10 bg-surface-container-low p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface/35">User Profile</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-primary">Authorized</span>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <img
                      src={user?.photoURL || ''}
                      alt={user?.displayName || 'User'}
                      className="h-16 w-16 rounded-xl border border-outline/20 object-cover grayscale transition-all duration-300 hover:grayscale-0 sm:h-20 sm:w-20"
                    />
                    <div className="space-y-1">
                      <h4 className="max-w-[28ch] truncate text-lg font-black tracking-tight text-on-surface">{userProfile?.name || user?.displayName}</h4>
                      <p className="max-w-[36ch] truncate text-[12px] font-medium text-on-surface/55">{userProfile?.email || user?.email}</p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-success">
                          {user?.emailVerified ? 'Verified' : 'Needs verification'}
                        </span>
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-on-surface/45">
                          Role: {userRole}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-outline/10 bg-surface-container-low p-4 shadow-sm">
                  <h3 className="mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-on-surface/35">Interface</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border border-outline/10 bg-surface/30 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline/10 bg-surface-container">
                          {theme === 'light' ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-warning" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Theme</p>
                          <p className="text-[10px] uppercase tracking-widest text-on-surface/40">Current mode: {theme}</p>
                        </div>
                      </div>
                      <button onClick={toggleTheme} className="rounded-lg bg-primary px-3 py-1 text-[10px] font-black uppercase text-on-primary">
                        {theme === 'light' ? 'Dark' : 'Light'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-outline/10 bg-surface/30 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline/10 bg-surface-container">
                          <LogOut className="h-4 w-4 text-error" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Sign Out</p>
                          <p className="text-[10px] uppercase tracking-widest text-on-surface/40">End authenticated session</p>
                        </div>
                      </div>
                      <button onClick={logout} className="rounded-lg border border-error/30 px-3 py-1 text-[10px] font-black uppercase text-error">
                        Logout
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeTab === 'Voice Playbook' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <section className="relative overflow-hidden rounded-xl border border-outline/10 bg-surface-container-low p-5 shadow-sm">
                  <div className="absolute right-0 top-0 hidden h-48 w-48 rounded-full bg-primary/5 blur-3xl md:block" />
                  <div className="relative z-10 space-y-5">
                    <div className="flex flex-col gap-3 border-b border-outline/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary">Voice Runtime</p>
                        <h3 className="text-2xl font-black tracking-tight text-on-surface">Live Assistant Controls</h3>
                      </div>
                      <span className="rounded-full border border-success/20 bg-success/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-success">
                        Speech synthesis {typeof window.speechSynthesis !== 'undefined' ? 'available' : 'unavailable'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <SettingCard title="Available Voices" value={`${voiceCount}`} detail="Detected from the browser speech synthesis engine." accent="primary" />
                      <SettingCard title="Microphone Permission" value={micPermission} detail="Live permission state reported by the browser." accent={micPermission === 'granted' ? 'success' : micPermission === 'prompt' ? 'warning' : 'secondary'} />
                      <SettingCard title="Realtime Region" value={speechmaticsRegion} detail="Client-side voice region used for realtime token requests." accent={speechmaticsRegion === 'Not configured' ? 'warning' : 'secondary'} />
                    </div>

                    <div className="rounded-xl border border-outline/10 bg-surface/30 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface/40">Preferred Browser Voice</p>
                      <div className="mt-3">
                        <VoiceSelector />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {[
                        { voice: 'Go to Dashboard', action: 'Open portfolio overview', icon: Compass, link: '/' },
                        { voice: 'Go to Projects', action: 'Open project workspaces', icon: FolderOpen, link: '/projects' },
                        { voice: 'Go to Compare', action: 'Open comparison workbench', icon: GitCompare, link: '/compare' },
                        { voice: 'Open Playbook', action: 'Open risk playbooks', icon: BookOpen, link: '/risk' },
                        { voice: 'Upload Document', action: 'Launch ingestion modal', icon: Upload, event: 'smart-charter-open-upload' },
                        { voice: 'Start Walkthrough', action: 'Start guided setup', icon: Eye, event: 'smart-charter-start-walkthrough' },
                      ].map((command) => (
                        <div key={command.voice} className="flex items-start justify-between gap-3 rounded-lg border border-outline/10 bg-surface p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline/10 bg-surface-container">
                              <command.icon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-[11px] font-black text-on-surface">"{command.voice}"</p>
                              <p className="text-[11px] text-on-surface/55">{command.action}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if ('event' in command) {
                                window.dispatchEvent(new CustomEvent(command.event));
                              } else {
                                window.dispatchEvent(new CustomEvent('smart-charter-voice-simulate', { detail: command.voice }));
                                window.location.href = command.link;
                              }
                            }}
                            className="flex items-center gap-1 rounded-md border border-outline/10 bg-surface-container px-2 py-1 text-[9px] font-black uppercase tracking-wider text-on-surface/70 transition-colors hover:text-on-surface"
                          >
                            <Play className="h-3 w-3" />
                            Try
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'Protocols' && canAccessActiveTab && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {protocolCards.map((card) => (
                  <SettingCard key={card.title} {...card} />
                ))}
              </motion.div>
            )}

            {activeTab === 'Notifications' && canAccessActiveTab && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {notificationCards.map((card) => (
                  <SettingCard key={card.title} {...card} />
                ))}
              </motion.div>
            )}

            {activeTab === 'Integration' && canAccessActiveTab && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {integrationCards.map((card) => (
                  <SettingCard key={card.title} {...card} />
                ))}
              </motion.div>
            )}

            {activeTab === 'Security' && canAccessActiveTab && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {securityCards.map((card) => (
                  <SettingCard key={card.title} {...card} />
                ))}
              </motion.div>
            )}

            {!canAccessActiveTab && activeSection.minimumRole && (
              <SectionLocked tab={activeTab} role={userRole} minimumRole={activeSection.minimumRole} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
