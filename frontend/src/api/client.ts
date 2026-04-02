import type { AuthStatus, GenerationResult, LLMSettings, Policy } from '../types';

const BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API Error ${res.status}: ${error}`);
  }
  return res.json();
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return fetchJson('/auth/status');
}

export async function triggerLogin(): Promise<{ status: string }> {
  return fetchJson('/auth/login', { method: 'POST' });
}

export async function triggerLogout(): Promise<{ status: string }> {
  return fetchJson('/auth/logout', { method: 'POST' });
}

export async function getPolicies(): Promise<Policy[]> {
  const data = await fetchJson<{ policies: Policy[] }>('/policies');
  return data.policies;
}

export async function getSettings(): Promise<LLMSettings> {
  return fetchJson('/settings');
}

export async function saveSettings(settings: LLMSettings): Promise<void> {
  await fetchJson('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function generateSingleDescription(
  policyId: string,
  policyType: string,
  systemPrompt?: string,
  template?: string,
  customInstructions?: string
): Promise<GenerationResult> {
  return fetchJson('/generate-single', {
    method: 'POST',
    body: JSON.stringify({
      policy_id: policyId,
      policy_type: policyType,
      system_prompt: systemPrompt || undefined,
      template: template || undefined,
      custom_instructions: customInstructions || undefined,
    }),
  });
}

export interface ConflictEntry {
  setting_key: string;
  setting_label: string;
  policies: {
    policy_id: string;
    policy_name: string;
    policy_type: string;
    platform: string | null;
    description: string;
    assignments: string[];
    value: unknown;
  }[];
  has_different_values: boolean;
}

export async function analyzeConflicts(): Promise<{ conflicts: ConflictEntry[]; total: number }> {
  return fetchJson('/analyze-conflicts');
}

export async function updateDescriptionsInIntune(
  updates: { policy_id: string; policy_type: string; description: string }[]
): Promise<{
  results: { policy_id: string; status: string }[];
  errors: { policy_id: string; error: string }[];
}> {
  return fetchJson('/update-descriptions', {
    method: 'POST',
    body: JSON.stringify({ updates }),
  });
}
