import { useState, useEffect, useCallback } from 'react';
import type { Policy, GenerationResult, LLMSettings, AuthStatus } from './types';
import { getAuthStatus, getPolicies, generateSingleDescription, triggerLogin, triggerLogout, analyzeConflicts } from './api/client';
import type { ConflictEntry } from './api/client';
import PolicyList from './components/PolicyList';
import SettingsPanel from './components/SettingsPanel';
import GenerationProgress from './components/GenerationProgress';
import DescriptionResult from './components/DescriptionResult';
import ConflictAnalysis from './components/ConflictAnalysis';

type View = 'policies' | 'generating' | 'results';
type Tab = 'policies' | 'conflicts';

export default function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>('policies');
  const [activeTab, setActiveTab] = useState<Tab>('policies');
  const [genProgress, setGenProgress] = useState({ total: 0, current: 0, name: '' });
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [genErrors, setGenErrors] = useState<{ policy_id: string; error: string }[]>([]);
  const [llmSettings, setLlmSettings] = useState<LLMSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);

  useEffect(() => {
    getAuthStatus().then(setAuth).catch(() => setAuth({ authenticated: false, error: 'Backend not reachable' }));
  }, []);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPolicies();
      setPolicies(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // No auto-load - user clicks "Load Policies" manually

  const togglePolicy = (policy: Policy) => {
    const key = `${policy.policy_type}:${policy.id}`;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(policies.map((p) => `${p.policy_type}:${p.id}`)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleLogin = async () => {
    setLoggingIn(true);
    setError(null);
    try {
      await triggerLogin();
      const status = await getAuthStatus();
      setAuth(status);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await triggerLogout();
      setAuth({ authenticated: false });
      setPolicies([]);
      setSelectedIds(new Set());
      setResults([]);
      setView('policies');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleGenerate = async () => {
    const policyRefs = Array.from(selectedIds).map((key) => {
      const [ptype, ...idParts] = key.split(':');
      return { id: idParts.join(':'), policy_type: ptype };
    });
    const nameMap = new Map(policies.map((p) => [`${p.policy_type}:${p.id}`, p.display_name]));
    const descMap = new Map(policies.map((p) => [`${p.policy_type}:${p.id}`, p.description]));

    setView('generating');
    setResults([]);
    setGenErrors([]);
    setGenProgress({ total: policyRefs.length, current: 0, name: '' });

    const newResults: GenerationResult[] = [];
    const newErrors: { policy_id: string; error: string }[] = [];

    for (let i = 0; i < policyRefs.length; i++) {
      const ref = policyRefs[i];
      const key = `${ref.policy_type}:${ref.id}`;
      const policyName = nameMap.get(key) || ref.id;

      setGenProgress({ total: policyRefs.length, current: i, name: policyName });

      try {
        const result = await generateSingleDescription(
          ref.id,
          ref.policy_type,
          llmSettings?.system_prompt,
          llmSettings?.template,
          llmSettings?.custom_instructions
        );
        result.original_description = descMap.get(key) || null;
        newResults.push(result);
      } catch (e: any) {
        newErrors.push({ policy_id: ref.id, error: e.message });
      }
    }

    setGenProgress({ total: policyRefs.length, current: policyRefs.length, name: 'Done!' });
    setResults(newResults);
    setGenErrors(newErrors);
    setView('results');
  };

  const handleAnalyzeConflicts = async (includeUnique = false) => {
    setConflictsLoading(true);
    setError(null);
    try {
      const data = await analyzeConflicts(includeUnique);
      setConflicts(data.conflicts);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setConflictsLoading(false);
    }
  };

  // Loading screen
  if (!auth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Login screen
  if (!auth.authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-panel p-8 max-w-md w-full text-center animate-float relative overflow-hidden">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-xl opacity-50 z-0"></div>
          <div className="relative z-10">
            <div className="text-blue-500 mb-6 flex justify-center dropshadow-xl">
              <div className="p-4 bg-white/50 backdrop-blur-md rounded-2xl shadow-inner border border-white/60">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-3 text-slate-800 tracking-tight">Access Intune Policies</h2>
            <p className="text-slate-600 mb-8 text-sm leading-relaxed">
              Sign in with your Microsoft account to securely analyze and generate elegant policy descriptions.
            </p>
            {loggingIn ? (
              <div className="space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                <p className="text-sm text-blue-600 font-medium">Waiting for browser sign-in...</p>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="w-full btn-primary-glass py-3 flex items-center justify-center gap-2 group"
              >
                <span>Sign in with Microsoft</span>
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            )}
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Generating screen
  if (view === 'generating') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <div className="w-full max-w-lg z-10 animate-float">
          <GenerationProgress
            total={genProgress.total}
            current={genProgress.current}
            policyName={genProgress.name}
          />
        </div>
      </div>
    );
  }

  // Results screen
  if (view === 'results') {
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-50 bg-white/40 backdrop-blur-2xl border-b border-white/20 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Intune PolicyManagement</h1>
              <p className="text-sm text-gray-500">
                Signed in as {auth.user} | Tenant: {auth.tenant?.slice(0, 8)}...
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-sm btn-glass flex items-center gap-2 text-slate-600 hover:text-red-600"
              title="Switch Account"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Switch Account
            </button>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">
          <DescriptionResult
            results={results}
            errors={genErrors}
            onBack={() => setView('policies')}
          />
        </main>
      </div>
    );
  }

  // Policies screen (default)
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white/40 backdrop-blur-2xl border-b border-white/20 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Intune PolicyManagement</h1>
            <p className="text-sm text-gray-500">
              Signed in as {auth.user} | Tenant: {auth.tenant?.slice(0, 8)}...
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-sm btn-glass flex items-center gap-2 text-slate-600 hover:text-red-600"
              title="Switch Account"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Switch Account
            </button>
            {activeTab === 'policies' && (
              <>
                <SettingsPanel onSettingsChange={setLlmSettings} />
                <button
                  onClick={loadPolicies}
                  disabled={loading}
                  className="px-4 py-2 text-sm btn-glass flex items-center gap-2"
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {loading ? 'Refreshing...' : policies.length === 0 ? 'Load Policies' : 'Reload'}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={selectedIds.size === 0}
                  className="px-6 py-2 text-sm btn-primary-glass flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <span>Generate ({selectedIds.size})</span>
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-6 pt-2 pb-0">
          <div className="inline-flex p-1 bg-slate-100/60 backdrop-blur-sm rounded-xl gap-1">
            <button
              onClick={() => setActiveTab('policies')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 ${
                activeTab === 'policies'
                  ? 'bg-white shadow-sm text-slate-800 ring-1 ring-black/5'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <svg className={`w-4 h-4 ${activeTab === 'policies' ? 'text-blue-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Policies
              {policies.length > 0 && (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md ${
                  activeTab === 'policies' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200/80 text-slate-500'
                }`}>{policies.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('conflicts')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 ${
                activeTab === 'conflicts'
                  ? 'bg-white shadow-sm text-slate-800 ring-1 ring-black/5'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <svg className={`w-4 h-4 ${activeTab === 'conflicts' ? 'text-amber-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Conflict Analysis
              {conflicts.length > 0 && (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md ${
                  activeTab === 'conflicts'
                    ? conflicts.some((c) => c.has_different_values)
                      ? 'bg-red-100 text-red-600'
                      : 'bg-amber-100 text-amber-600'
                    : 'bg-slate-200/80 text-slate-500'
                }`}>{conflicts.length}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="glass-panel border-red-200/50 bg-red-50/50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-full text-red-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {activeTab === 'policies' && (
          <>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 animate-pulse-glow">
                <div className="relative">
                  <div className="absolute -inset-4 bg-blue-500/20 blur-xl rounded-full"></div>
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6 relative z-10" />
                </div>
                <p className="text-slate-600 font-medium tracking-wide">Syncing policies with Microsoft Intune...</p>
              </div>
            ) : (
              <PolicyList
                policies={policies}
                selectedIds={selectedIds}
                onToggle={togglePolicy}
                onSelectAll={selectAll}
                onDeselectAll={deselectAll}
              />
            )}
          </>
        )}

        {activeTab === 'conflicts' && (
          <ConflictAnalysis
            conflicts={conflicts}
            loading={conflictsLoading}
            onAnalyze={handleAnalyzeConflicts}
          />
        )}
      </main>
    </div>
  );
}
