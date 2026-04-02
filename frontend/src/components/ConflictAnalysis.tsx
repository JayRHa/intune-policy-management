import { useState, useMemo, useCallback } from 'react';
import { POLICY_TYPE_LABELS } from '../types';
import type { ConflictEntry } from '../api/client';

interface Props {
  conflicts: ConflictEntry[];
  loading: boolean;
  onAnalyze: () => void;
}

export default function ConflictAnalysis({ conflicts, loading, onAnalyze }: Props) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'conflicts' | 'duplicates'>('all');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return conflicts.filter((c) => {
      const matchesSearch =
        c.setting_key.toLowerCase().includes(search.toLowerCase()) ||
        c.setting_label.toLowerCase().includes(search.toLowerCase()) ||
        c.policies.some((p) => p.policy_name.toLowerCase().includes(search.toLowerCase()));

      if (filterMode === 'conflicts') return matchesSearch && c.has_different_values;
      if (filterMode === 'duplicates') return matchesSearch && !c.has_different_values;
      return matchesSearch;
    });
  }, [conflicts, search, filterMode]);

  const stats = useMemo(() => {
    const withConflicts = conflicts.filter((c) => c.has_different_values).length;
    const withDuplicates = conflicts.filter((c) => !c.has_different_values).length;
    const affectedPolicies = new Set(conflicts.flatMap((c) => c.policies.map((p) => p.policy_id))).size;
    return { total: conflicts.length, withConflicts, withDuplicates, affectedPolicies };
  }, [conflicts]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpandedKeys(new Set(filtered.map((c) => c.setting_key)));
  const collapseAll = () => setExpandedKeys(new Set());

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const exportToJson = useCallback(() => {
    const data = filtered.map((c) => ({
      setting_key: c.setting_key,
      setting_label: c.setting_label,
      type: c.has_different_values ? 'conflict' : 'duplicate',
      policies: c.policies.map((p) => ({
        name: p.policy_name,
        type: p.policy_type,
        platform: p.platform,
        description: p.description,
        assignments: p.assignments,
        value: p.value,
      })),
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intune-conflicts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const exportToCsv = useCallback(() => {
    const rows: string[][] = [['Setting Key', 'Setting Label', 'Type', 'Policy Name', 'Policy Type', 'Platform', 'Description', 'Assignments', 'Value']];
    for (const c of filtered) {
      for (const p of c.policies) {
        rows.push([
          c.setting_key,
          c.setting_label,
          c.has_different_values ? 'Conflict' : 'Duplicate',
          p.policy_name,
          POLICY_TYPE_LABELS[p.policy_type] || p.policy_type,
          p.platform || '',
          p.description || '',
          (p.assignments || []).join('; '),
          typeof p.value === 'object' ? JSON.stringify(p.value) : String(p.value ?? ''),
        ]);
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intune-conflicts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  // Empty / initial state
  if (conflicts.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-float">
        <div className="glass-panel p-10 max-w-lg w-full text-center relative overflow-hidden">
          <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 blur-2xl opacity-60 z-0"></div>
          <div className="relative z-10">
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="absolute -inset-3 bg-gradient-to-br from-amber-400/30 to-orange-400/30 blur-xl rounded-full animate-pulse-glow"></div>
                <div className="relative p-5 bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-md rounded-2xl shadow-glass border border-white/60">
                  <svg className="w-10 h-10 text-amber-600" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.933 13.909A4.357 4.357 0 018 12c1.886 0 3.479 1.156 4.067 2.909M15.933 13.909A4.357 4.357 0 0120 12c0-2.408-1.955-4.357-4.357-4.357M8 12a4.357 4.357 0 110-8.714A4.357 4.357 0 018 12z" />
                    <circle cx="8" cy="7.5" r="2" fill="currentColor" opacity=".3" />
                    <circle cx="16" cy="7.5" r="2" fill="currentColor" opacity=".3" />
                    <path stroke="currentColor" strokeLinecap="round" strokeWidth={1.5} d="M12 15v6m-3-3h6" />
                  </svg>
                </div>
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-800 tracking-tight mb-2">
              Policy Conflict Analysis
            </h3>
            <p className="text-slate-500 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
              Scan your entire Intune tenant to discover settings configured across multiple policies. Identify conflicts and redundant configurations.
            </p>
            <button
              onClick={onAnalyze}
              disabled={loading}
              className="btn-primary-glass px-8 py-3 text-sm flex items-center justify-center gap-2.5 mx-auto group bg-gradient-to-r from-amber-500/90 to-orange-500/90 border-amber-400/50 shadow-amber-500/20 hover:shadow-amber-500/30"
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="font-semibold">Start Analysis</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading && conflicts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28">
        <div className="relative mb-8">
          <div className="absolute -inset-8 bg-gradient-to-br from-amber-400/20 to-orange-400/20 blur-2xl rounded-full animate-pulse-glow"></div>
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-amber-100 border-t-amber-500 animate-spin"></div>
            <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-b-orange-400/50 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
          </div>
        </div>
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Analyzing Policies...</h3>
        <p className="text-sm text-slate-400 max-w-xs text-center">Fetching detailed settings from all policies and comparing configurations.</p>
        <div className="mt-6 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100/80 flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
            <p className="text-xs text-slate-400 mt-0.5">shared settings</p>
          </div>
        </div>

        <div className="glass-panel p-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-red-50/80 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <span className="text-xs font-medium text-red-500 uppercase tracking-wider">Conflicts</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.withConflicts}</p>
            <p className="text-xs text-slate-400 mt-0.5">different values</p>
          </div>
        </div>

        <div className="glass-panel p-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50/80 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">Duplicates</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{stats.withDuplicates}</p>
            <p className="text-xs text-slate-400 mt-0.5">identical values</p>
          </div>
        </div>

        <div className="glass-panel p-4 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50/80 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <span className="text-xs font-medium text-purple-500 uppercase tracking-wider">Policies</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{stats.affectedPolicies}</p>
            <p className="text-xs text-slate-400 mt-0.5">policies affected</p>
          </div>
        </div>
      </div>

      {/* Main panel */}
      <div className="glass-panel overflow-hidden relative">
        {/* Toolbar */}
        <div className="p-5 border-b border-white/40 bg-white/30 backdrop-blur-md relative z-10">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search settings or policy names..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="glass-input pl-10"
              />
            </div>

            {/* Filter chips */}
            <div className="flex gap-1.5 items-center">
              {([
                { key: 'all', label: 'All', color: 'slate' },
                { key: 'conflicts', label: 'Conflicts', color: 'red' },
                { key: 'duplicates', label: 'Duplicates', color: 'amber' },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilterMode(f.key)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 ${
                    filterMode === f.key
                      ? f.color === 'red'
                        ? 'bg-red-50 text-red-700 border-red-200 shadow-sm'
                        : f.color === 'amber'
                        ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm'
                        : 'bg-white/80 text-slate-700 border-slate-200 shadow-sm'
                      : 'bg-white/30 text-slate-500 border-white/40 hover:bg-white/60 hover:text-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={expandAll} className="px-3 py-2 text-xs btn-glass text-slate-600 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                Expand
              </button>
              <button onClick={collapseAll} className="px-3 py-2 text-xs btn-glass text-slate-600 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M15 15h4.5m-4.5 0v4.5m0-4.5l5.5 5.5" />
                </svg>
                Collapse
              </button>

              <div className="w-px bg-slate-200/60 mx-1"></div>

              {/* Export dropdown */}
              <div className="relative group/export">
                <button className="px-3 py-2 text-xs btn-glass text-slate-600 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-white/95 backdrop-blur-xl rounded-xl border border-white/60 shadow-xl opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all duration-200 z-50">
                  <button
                    onClick={exportToJson}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <span className="w-5 h-5 rounded bg-amber-50 flex items-center justify-center text-[9px] font-bold text-amber-600">{ }</span>
                    Export as JSON
                  </button>
                  <button
                    onClick={exportToCsv}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <span className="w-5 h-5 rounded bg-green-50 flex items-center justify-center text-[9px] font-bold text-green-600">csv</span>
                    Export as CSV
                  </button>
                </div>
              </div>

              <button
                onClick={onAnalyze}
                disabled={loading}
                className="px-3.5 py-2 text-xs btn-primary-glass flex items-center gap-1.5 bg-gradient-to-r from-amber-500/90 to-orange-500/90 border-amber-400/50 shadow-amber-500/20 hover:shadow-amber-500/30"
              >
                <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {loading ? 'Analyzing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Result count */}
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 px-0.5">
            <span>{filtered.length} of {conflicts.length} settings shown</span>
          </div>
        </div>

        {/* Conflict entries */}
        <div className="overflow-auto max-h-[calc(100vh-420px)] relative">
          {filtered.map((conflict, idx) => {
            const isExpanded = expandedKeys.has(conflict.setting_key);
            const isConflict = conflict.has_different_values;
            return (
              <div
                key={conflict.setting_key}
                className={`relative border-b border-white/15 ${idx % 2 === 0 ? 'bg-white/5' : 'bg-white/15'}`}
              >
                {/* Row header */}
                <button
                  onClick={() => toggleExpand(conflict.setting_key)}
                  className={`w-full text-left px-5 py-3.5 flex items-center gap-4 transition-all duration-200 hover:bg-white/40 group/row ${
                    isExpanded ? 'bg-white/30' : ''
                  }`}
                >
                  {/* Indicator bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r-full transition-all ${
                    isConflict
                      ? 'bg-gradient-to-b from-red-400 to-red-500'
                      : 'bg-gradient-to-b from-amber-300 to-amber-400'
                  }`} />

                  {/* Chevron */}
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 ${
                    isExpanded
                      ? 'bg-slate-200/60 rotate-0'
                      : 'bg-slate-100/40 group-hover/row:bg-slate-200/60'
                  }`}>
                    <svg
                      className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Status icon */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isConflict
                      ? 'bg-red-50/80 border border-red-200/50'
                      : 'bg-amber-50/80 border border-amber-200/50'
                  }`}>
                    {isConflict ? (
                      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-sm text-slate-800 truncate group-hover/row:text-slate-900">
                        {conflict.setting_label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${
                        isConflict
                          ? 'bg-red-100/80 text-red-600 ring-1 ring-red-200/50'
                          : 'bg-amber-100/80 text-amber-600 ring-1 ring-amber-200/50'
                      }`}>
                        {isConflict ? 'Conflict' : 'Duplicate'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5 font-mono tracking-tight max-w-lg">
                      {conflict.setting_key}
                    </p>
                  </div>

                  {/* Policy avatars */}
                  <div className="hidden md:flex items-center -space-x-2 flex-shrink-0">
                    {conflict.policies.slice(0, 4).map((p, i) => (
                      <div
                        key={p.policy_id}
                        className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-100 to-blue-100 border-2 border-white flex items-center justify-center shadow-sm"
                        style={{ zIndex: 10 - i }}
                        title={p.policy_name}
                      >
                        <span className="text-[9px] font-bold text-purple-700">
                          {p.policy_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    ))}
                    {conflict.policies.length > 4 && (
                      <div className="w-7 h-7 rounded-lg bg-slate-100 border-2 border-white flex items-center justify-center shadow-sm" style={{ zIndex: 5 }}>
                        <span className="text-[9px] font-bold text-slate-500">+{conflict.policies.length - 4}</span>
                      </div>
                    )}
                  </div>

                  {/* Policy count */}
                  <div className="flex-shrink-0 text-right hidden sm:block">
                    <span className="text-xs font-semibold text-slate-500">{conflict.policies.length}</span>
                    <p className="text-[10px] text-slate-400">policies</p>
                  </div>
                </button>

                {/* Expanded detail panel — card layout per policy */}
                {isExpanded && (
                  <div className="border-t border-white/30 bg-gradient-to-b from-white/40 to-white/20 backdrop-blur-sm">
                    <div className="p-5">
                      {/* Setting source info */}
                      <div className="mb-4 px-3 py-2.5 rounded-lg bg-slate-50/60 border border-slate-200/40">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                          </svg>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Setting Key</span>
                        </div>
                        <code className="text-xs font-mono text-slate-600 break-all">{conflict.setting_key}</code>
                      </div>

                      {/* Policy cards */}
                      <div className="space-y-3">
                        {conflict.policies.map((p, pidx) => {
                          const valueStr = formatValue(p.value);
                          const firstValueStr = formatValue(conflict.policies[0].value);
                          const isDifferent = isConflict && pidx > 0 && valueStr !== firstValueStr;

                          return (
                            <div
                              key={`${p.policy_id}-${pidx}`}
                              className={`rounded-xl border overflow-hidden transition-all ${
                                isDifferent
                                  ? 'border-red-200/60 bg-red-50/20'
                                  : 'border-white/50 bg-white/30'
                              }`}
                            >
                              {/* Card header */}
                              <div className={`flex items-center gap-3 px-4 py-3 border-b ${
                                isDifferent ? 'border-red-100/40 bg-red-50/30' : 'border-white/40 bg-white/20'
                              }`}>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  isDifferent
                                    ? 'bg-red-100/80 border border-red-200/50'
                                    : 'bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-100/50'
                                }`}>
                                  <span className={`text-[10px] font-bold ${isDifferent ? 'text-red-600' : 'text-purple-600'}`}>
                                    {p.policy_name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-800 truncate">{p.policy_name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="soft-pill bg-purple-50/60 text-purple-600 border-purple-200/40 !text-[10px] !px-2 !py-0.5">
                                      {POLICY_TYPE_LABELS[p.policy_type] || p.policy_type}
                                    </span>
                                    {p.platform && (
                                      <span className="soft-pill bg-slate-50/60 text-slate-500 border-slate-200/40 !text-[10px] !px-2 !py-0.5">
                                        {p.platform}
                                      </span>
                                    )}
                                    {isDifferent && (
                                      <span className="soft-pill bg-red-50/80 text-red-600 border-red-200/40 !text-[10px] !px-2 !py-0.5">
                                        Different value
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Card body — grid layout */}
                              <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* Description */}
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                                    </svg>
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Description</span>
                                  </div>
                                  <p className="text-[11px] text-slate-600 leading-relaxed">
                                    {p.description || <span className="italic text-slate-400">No description</span>}
                                  </p>
                                </div>

                                {/* Assignments */}
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Assignments</span>
                                  </div>
                                  {p.assignments && p.assignments.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {p.assignments.map((a, ai) => (
                                        <span
                                          key={ai}
                                          className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md border ${
                                            a.startsWith('Exclude')
                                              ? 'bg-red-50/60 text-red-600 border-red-200/40'
                                              : a === 'All Devices' || a === 'All Users'
                                              ? 'bg-blue-50/60 text-blue-600 border-blue-200/40'
                                              : 'bg-slate-50/60 text-slate-600 border-slate-200/40'
                                          }`}
                                        >
                                          {a}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] italic text-slate-400">No assignments</p>
                                  )}
                                </div>

                                {/* Value */}
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                    </svg>
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Value (JSON)</span>
                                  </div>
                                  <pre className={`text-[11px] font-mono p-2.5 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap break-all ${
                                    isDifferent
                                      ? 'bg-red-50/80 border border-red-200/40 text-red-800'
                                      : 'bg-slate-50/80 border border-slate-200/40 text-slate-700'
                                  }`}>
                                    {valueStr}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty filter results */}
          {filtered.length === 0 && !loading && (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
              <div className="p-4 bg-white/40 rounded-2xl mb-4">
                <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-semibold text-slate-500">
                {search || filterMode !== 'all'
                  ? 'No results matching your filters'
                  : 'No overlapping settings found'}
              </p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filter criteria</p>
            </div>
          )}

          {/* Loading overlay when re-analyzing */}
          {loading && conflicts.length > 0 && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-4 border-amber-100 border-t-amber-500 animate-spin"></div>
                <p className="text-sm font-medium text-slate-600">Re-analyzing...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
