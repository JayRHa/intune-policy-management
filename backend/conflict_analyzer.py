import asyncio
import traceback

from graph_client import graph_client
from policy_fetcher import POLICY_ENDPOINTS


async def _get_policy_settings(policy_type: str, policy_id: str, endpoint: str) -> list[dict]:
    """Extract individual settings from a policy as a list of {key, value} dicts."""
    settings = []
    full_endpoint = f"{endpoint}/{policy_id}"

    try:
        data = await graph_client.get(full_endpoint)
    except Exception:
        return []

    if policy_type == "settingsCatalog":
        try:
            settings_data = await graph_client.get(f"{full_endpoint}/settings")
            for s in settings_data.get("value", []):
                def_id = s.get("settingInstance", {}).get("settingDefinitionId", "")
                if def_id:
                    # Extract the value from the setting instance
                    instance = s.get("settingInstance", {})
                    odata_type = instance.get("@odata.type", "")
                    value = None
                    if "choiceSettingInstance" in odata_type.lower():
                        value = instance.get("choiceSettingValue", {}).get("value", "")
                    elif "simplesettinginstance" in odata_type.lower():
                        sv = instance.get("simpleSettingValue", {})
                        value = sv.get("value", sv)
                    elif "simplesettingcollectioninstance" in odata_type.lower():
                        value = instance.get("simpleSettingCollectionValue", [])
                    elif "groupsettingcollectioninstance" in odata_type.lower():
                        value = instance.get("groupSettingCollectionValue", [])
                    else:
                        value = str(instance)

                    settings.append({
                        "setting_key": def_id,
                        "setting_label": def_id.split("_")[-1] if "_" in def_id else def_id,
                        "value": value,
                    })
        except Exception:
            traceback.print_exc()

    elif policy_type == "deviceConfiguration":
        skip_keys = {
            "id", "@odata.type", "@odata.context", "displayName", "description",
            "createdDateTime", "lastModifiedDateTime", "version", "roleScopeTagIds",
            "supportsScopeTags", "deviceManagementApplicabilityRuleOsEdition",
            "deviceManagementApplicabilityRuleOsVersion",
            "deviceManagementApplicabilityRuleDeviceMode",
        }
        odata_type = data.get("@odata.type", "")
        for key, value in data.items():
            if key in skip_keys or key.startswith("@"):
                continue
            if value is None or value == "" or value == [] or value == {}:
                continue
            # For OMA-URI custom profiles, expand individual OMA settings
            if key == "omaSettings" and isinstance(value, list):
                for oma in value:
                    oma_uri = oma.get("omaUri", "")
                    oma_name = oma.get("displayName", oma_uri)
                    oma_value = oma.get("value", oma.get("secretReferenceValueId", ""))
                    settings.append({
                        "setting_key": f"oma-uri:{oma_uri}",
                        "setting_label": oma_name,
                        "value": oma_value,
                    })
            else:
                settings.append({
                    "setting_key": f"{odata_type}:{key}",
                    "setting_label": key,
                    "value": value,
                })

    elif policy_type == "endpointSecurity":
        try:
            categories = await graph_client.get_all(f"{full_endpoint}/categories")
            for cat in categories:
                cat_settings = await graph_client.get_all(
                    f"{full_endpoint}/categories/{cat['id']}/settings"
                )
                for s in cat_settings:
                    def_id = s.get("definitionId", "")
                    if def_id:
                        settings.append({
                            "setting_key": def_id,
                            "setting_label": def_id.split("_")[-1] if "_" in def_id else def_id,
                            "value": s.get("valueJson", s.get("value", "")),
                        })
        except Exception:
            traceback.print_exc()

    elif policy_type == "groupPolicy":
        try:
            values = await graph_client.get_all(f"{full_endpoint}/definitionValues")
            for v in values:
                def_id = v.get("id", "")
                settings.append({
                    "setting_key": f"gpo:{def_id}",
                    "setting_label": v.get("displayName", def_id),
                    "value": v.get("enabled", True),
                })
        except Exception:
            traceback.print_exc()

    elif policy_type == "compliance":
        skip_keys = {
            "id", "@odata.type", "@odata.context", "displayName", "description",
            "createdDateTime", "lastModifiedDateTime", "version", "roleScopeTagIds",
            "scheduledActionsForRule", "validOperatingSystemBuildRanges",
        }
        odata_type = data.get("@odata.type", "")
        for key, value in data.items():
            if key in skip_keys or key.startswith("@"):
                continue
            if value is None or value == "" or value == [] or value == {}:
                continue
            settings.append({
                "setting_key": f"{odata_type}:{key}",
                "setting_label": key,
                "value": value,
            })

    return settings


def _format_assignment_target(target: dict) -> str:
    """Convert a Graph API assignment target to a readable string."""
    odata_type = target.get("@odata.type", "")
    if "allDevices" in odata_type:
        return "All Devices"
    if "allLicensedUsers" in odata_type:
        return "All Users"
    if "exclusionGroup" in odata_type:
        group_id = target.get("groupId", "")
        return f"Exclude: {group_id}"
    if "group" in odata_type.lower():
        group_id = target.get("groupId", "")
        return f"Group: {group_id}"
    return odata_type.split(".")[-1] if odata_type else "Unknown"


async def _get_assignments(policy_type: str, policy_id: str, endpoint: str) -> list[str]:
    """Fetch assignment targets for a policy."""
    # Conditional Access policies have assignments embedded differently
    if policy_type == "conditionalAccess":
        return []
    # App Protection policies use a different assignment structure
    if policy_type == "appProtection":
        return []
    try:
        data = await graph_client.get(f"{endpoint}/{policy_id}/assignments")
        assignments = data.get("value", [])
        targets = []
        for a in assignments:
            target = a.get("target", {})
            targets.append(_format_assignment_target(target))
        return targets
    except Exception:
        return []


async def analyze_conflicts() -> list[dict]:
    """Analyze all policies and find settings that appear in multiple policies."""
    # Step 1: Fetch all policies (basic info)
    from policy_fetcher import fetch_all_policies
    all_policies = await fetch_all_policies()

    # Step 2: Fetch settings and assignments for each policy concurrently
    sem = asyncio.Semaphore(5)

    async def fetch_with_sem(policy):
        async with sem:
            endpoint = POLICY_ENDPOINTS[policy.policy_type]["endpoint"]
            policy_settings = await _get_policy_settings(
                policy.policy_type, policy.id, endpoint
            )
            assignments = await _get_assignments(
                policy.policy_type, policy.id, endpoint
            )
            return policy, policy_settings, assignments

    tasks = [fetch_with_sem(p) for p in all_policies]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Step 3: Build a map: setting_key -> list of (policy, value)
    setting_map: dict[str, list[dict]] = {}

    for result in results:
        if isinstance(result, Exception):
            continue
        policy, policy_settings, assignments = result
        for s in policy_settings:
            key = s["setting_key"]
            if key not in setting_map:
                setting_map[key] = []
            setting_map[key].append({
                "policy_id": policy.id,
                "policy_name": policy.display_name,
                "policy_type": policy.policy_type,
                "platform": policy.platform,
                "description": policy.description or "",
                "assignments": assignments,
                "value": s["value"],
                "setting_label": s["setting_label"],
            })

    # Step 4: Filter to only settings that appear in 2+ policies
    conflicts = []
    for setting_key, entries in setting_map.items():
        if len(entries) < 2:
            continue

        # Check if values differ
        values_str = [str(e["value"]) for e in entries]
        has_different = len(set(values_str)) > 1

        conflicts.append({
            "setting_key": setting_key,
            "setting_label": entries[0]["setting_label"],
            "policies": [
                {
                    "policy_id": e["policy_id"],
                    "policy_name": e["policy_name"],
                    "policy_type": e["policy_type"],
                    "platform": e["platform"],
                    "description": e["description"],
                    "assignments": e["assignments"],
                    "value": e["value"],
                }
                for e in entries
            ],
            "has_different_values": has_different,
        })

    # Sort: conflicts with different values first, then by number of policies
    conflicts.sort(key=lambda c: (-int(c["has_different_values"]), -len(c["policies"])))

    return conflicts
