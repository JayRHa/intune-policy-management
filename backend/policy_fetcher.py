import asyncio
import traceback

import httpx

from graph_client import graph_client
from models import Policy

POLICY_ENDPOINTS = {
    "deviceConfiguration": {
        "endpoint": "/deviceManagement/deviceConfigurations",
        "label": "Device Configuration",
    },
    "settingsCatalog": {
        "endpoint": "/deviceManagement/configurationPolicies",
        "label": "Settings Catalog",
    },
    "compliance": {
        "endpoint": "/deviceManagement/deviceCompliancePolicies",
        "label": "Compliance Policy",
    },
    "appProtection": {
        "endpoint": "/deviceAppManagement/managedAppPolicies",
        "label": "App Protection Policy",
    },
    "conditionalAccess": {
        "endpoint": "/identity/conditionalAccess/policies",
        "label": "Conditional Access",
    },
    "endpointSecurity": {
        "endpoint": "/deviceManagement/intents",
        "label": "Endpoint Security",
    },
    "appConfiguration": {
        "endpoint": "/deviceAppManagement/mobileAppConfigurations",
        "label": "App Configuration",
    },
    "autopilot": {
        "endpoint": "/deviceManagement/windowsAutopilotDeploymentProfiles",
        "label": "Autopilot Deployment Profile",
        "platform": "Windows",
    },
    "enrollment": {
        "endpoint": "/deviceManagement/deviceEnrollmentConfigurations",
        "label": "Device Enrollment",
    },
    "remediationScript": {
        "endpoint": "/deviceManagement/deviceHealthScripts",
        "label": "Remediation Script",
        "platform": "Windows",
    },
    "powershellScript": {
        "endpoint": "/deviceManagement/deviceManagementScripts",
        "label": "PowerShell Script",
        "platform": "Windows",
    },
    "groupPolicy": {
        "endpoint": "/deviceManagement/groupPolicyConfigurations",
        "label": "Group Policy (ADMX)",
        "platform": "Windows",
    },
    "macosShellScript": {
        "endpoint": "/deviceManagement/deviceShellScripts",
        "label": "macOS Shell Script",
        "platform": "macOS",
    },
    "macosCustomAttribute": {
        "endpoint": "/deviceManagement/deviceCustomAttributeShellScripts",
        "label": "macOS Custom Attribute",
        "platform": "macOS",
    },
    "complianceScript": {
        "endpoint": "/deviceManagement/deviceComplianceScripts",
        "label": "Custom Compliance Script",
        "platform": "Windows",
    },
    "windowsFeatureUpdate": {
        "endpoint": "/deviceManagement/windowsFeatureUpdateProfiles",
        "label": "Windows Feature Update",
        "platform": "Windows",
    },
    "windowsQualityUpdatePolicy": {
        "endpoint": "/deviceManagement/windowsQualityUpdatePolicies",
        "label": "Windows Quality Update Policy",
        "platform": "Windows",
    },
    "windowsExpeditedUpdate": {
        "endpoint": "/deviceManagement/windowsQualityUpdateProfiles",
        "label": "Windows Expedited Quality Update",
        "platform": "Windows",
    },
    "windowsDriverUpdate": {
        "endpoint": "/deviceManagement/windowsDriverUpdateProfiles",
        "label": "Windows Driver Update",
        "platform": "Windows",
    },
    "assignmentFilter": {
        "endpoint": "/deviceManagement/assignmentFilters",
        "label": "Assignment Filter",
    },
    "deviceCleanupRule": {
        "endpoint": "/deviceManagement/managedDeviceCleanupRules",
        "label": "Device Clean-up Rule",
    },
    "appleEnrollmentProfile": {
        "endpoint": "/deviceManagement/appleUserInitiatedEnrollmentProfiles",
        "label": "Apple Enrollment Type Profile",
    },
    "policySet": {
        "endpoint": "/deviceAppManagement/policySets",
        "label": "Policy Set",
    },
}


# Properties that state a platform explicitly. Checked before the @odata.type
# heuristic because types such as appleUserInitiatedEnrollmentProfile carry
# "apple" in their @odata.type for both iOS and macOS profiles.
_PLATFORM_FIELDS = ("platform", "platforms", "deviceCleanupRulePlatformType")


def _platform_from_text(text: str) -> str | None:
    t = text.lower()
    if "windows" in t or "win" in t:
        return "Windows"
    if "ios" in t or "apple" in t:
        return "iOS"
    if "macos" in t:
        return "macOS"
    if "android" in t:
        return "Android"
    return None


def _extract_platform(item: dict, default: str | None = None) -> str | None:
    """Best-effort platform label. `default` is the per-type platform from
    POLICY_ENDPOINTS, used for resources whose JSON carries no platform hint
    (scripts, update profiles, ADMX)."""
    for field in _PLATFORM_FIELDS:
        value = item.get(field)
        if value and value != "none":
            return _platform_from_text(str(value)) or str(value)
    platform = _platform_from_text(item.get("@odata.type", ""))
    if platform:
        return platform
    return default


async def _fetch_policy_type(policy_type: str, config: dict) -> list[Policy]:
    try:
        items = await graph_client.get_all(config["endpoint"])
        policies = []
        for item in items:
            name = item.get("displayName") or item.get("name") or "Unnamed"
            policies.append(
                Policy(
                    id=item.get("id", ""),
                    display_name=name,
                    description=item.get("description"),
                    policy_type=policy_type,
                    platform=_extract_platform(item, config.get("platform")),
                )
            )
        return policies
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        detail = ""
        try:
            err = e.response.json().get("error", {})
            detail = f" [{err.get('code', '')}] {str(err.get('message', ''))[:200]}"
        except Exception:
            pass
        print(f"Warning: Failed to fetch {config['label']}: HTTP {status} for {config['endpoint']}{detail}")
        if status == 403:
            print("  The signed-in account lacks a Graph scope or Intune RBAC permission for this endpoint. See README > Permissions.")
        return []
    except Exception as e:
        print(f"Warning: Failed to fetch {config['label']}: {e}")
        traceback.print_exc()
        return []


async def fetch_all_policies() -> list[Policy]:
    tasks = [
        _fetch_policy_type(ptype, config)
        for ptype, config in POLICY_ENDPOINTS.items()
    ]
    results = await asyncio.gather(*tasks)
    all_policies = []
    for result in results:
        all_policies.extend(result)
    return all_policies


async def fetch_policy_details(policy_type: str, policy_id: str) -> dict:
    config = POLICY_ENDPOINTS.get(policy_type)
    if not config:
        raise ValueError(f"Unknown policy type: {policy_type}")

    endpoint = f"{config['endpoint']}/{policy_id}"
    data = await graph_client.get(endpoint)

    # For Settings Catalog, also fetch the settings
    if policy_type == "settingsCatalog":
        try:
            settings_data = await graph_client.get(f"{endpoint}/settings")
            data["settings"] = settings_data.get("value", [])
        except Exception:
            pass

    # For Endpoint Security (intents), fetch categories and settings
    if policy_type == "endpointSecurity":
        try:
            categories = await graph_client.get_all(f"{endpoint}/categories")
            for cat in categories:
                cat_settings = await graph_client.get_all(
                    f"{endpoint}/categories/{cat['id']}/settings"
                )
                cat["settings"] = cat_settings
            data["categories"] = categories
        except Exception:
            pass

    # For Group Policy, fetch definition values
    if policy_type == "groupPolicy":
        try:
            values = await graph_client.get_all(f"{endpoint}/definitionValues")
            data["definitionValues"] = values
        except Exception:
            pass

    return data


# Policy types that support description updates via PATCH
PATCHABLE_TYPES = {
    "deviceConfiguration",
    "settingsCatalog",
    "compliance",
    "appProtection",
    "appConfiguration",
    "groupPolicy",
    "endpointSecurity",
}


async def update_policy_description(policy_type: str, policy_id: str, description: str):
    config = POLICY_ENDPOINTS.get(policy_type)
    if not config:
        raise ValueError(f"Unknown policy type: {policy_type}")

    if policy_type not in PATCHABLE_TYPES:
        raise ValueError(
            f"Policy type '{config['label']}' does not support description updates via Graph API."
        )

    endpoint = f"{config['endpoint']}/{policy_id}"

    # Device configurations require @odata.type in PATCH body
    if policy_type == "deviceConfiguration":
        existing = await graph_client.get(endpoint)
        odata_type = existing.get("@odata.type", "")
        await graph_client.patch(endpoint, {
            "@odata.type": odata_type,
            "description": description,
        })
    else:
        await graph_client.patch(endpoint, {"description": description})
