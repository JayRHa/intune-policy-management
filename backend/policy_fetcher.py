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
    },
    "enrollment": {
        "endpoint": "/deviceManagement/deviceEnrollmentConfigurations",
        "label": "Device Enrollment",
    },
    "remediationScript": {
        "endpoint": "/deviceManagement/deviceHealthScripts",
        "label": "Remediation Script",
    },
    "powershellScript": {
        "endpoint": "/deviceManagement/deviceManagementScripts",
        "label": "PowerShell Script",
    },
    "groupPolicy": {
        "endpoint": "/deviceManagement/groupPolicyConfigurations",
        "label": "Group Policy (ADMX)",
    },
}


def _extract_platform(item: dict) -> str | None:
    odata_type = item.get("@odata.type", "")
    if "windows" in odata_type.lower() or "win" in odata_type.lower():
        return "Windows"
    if "ios" in odata_type.lower() or "apple" in odata_type.lower():
        return "iOS"
    if "macos" in odata_type.lower() or "macOS" in odata_type.lower():
        return "macOS"
    if "android" in odata_type.lower():
        return "Android"
    platforms = item.get("platforms", "")
    if platforms and platforms != "none":
        return platforms
    return None


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
                    platform=_extract_platform(item),
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
