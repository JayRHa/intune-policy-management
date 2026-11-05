export interface Policy {
  id: string;
  display_name: string;
  description: string | null;
  policy_type: string;
  platform: string | null;
}

export interface GenerationResult {
  policy_id: string;
  policy_name: string;
  policy_type: string;
  generated_description: string;
  original_description: string | null;
}

export interface LLMSettings {
  system_prompt: string;
  template: string;
  custom_instructions: string;
}

export interface AuthStatus {
  authenticated: boolean;
  tenant?: string;
  subscription?: string;
  user?: string;
  error?: string;
}

export const POLICY_TYPE_LABELS: Record<string, string> = {
  deviceConfiguration: 'Device Configuration',
  settingsCatalog: 'Settings Catalog',
  compliance: 'Compliance Policy',
  appProtection: 'App Protection',
  conditionalAccess: 'Conditional Access',
  endpointSecurity: 'Endpoint Security',
  appConfiguration: 'App Configuration',
  autopilot: 'Autopilot',
  enrollment: 'Device Enrollment',
  remediationScript: 'Remediation Script',
  powershellScript: 'PowerShell Script',
  groupPolicy: 'Group Policy (ADMX)',
  macosShellScript: 'macOS Shell Script',
  macosCustomAttribute: 'macOS Custom Attribute',
  complianceScript: 'Custom Compliance Script',
  windowsFeatureUpdate: 'Windows Feature Update',
  windowsQualityUpdatePolicy: 'Windows Quality Update Policy',
  windowsExpeditedUpdate: 'Windows Expedited Quality Update',
  windowsDriverUpdate: 'Windows Driver Update',
  assignmentFilter: 'Assignment Filter',
  deviceCleanupRule: 'Device Clean-up Rule',
  appleEnrollmentProfile: 'Apple Enrollment Type Profile',
  policySet: 'Policy Set',
};
