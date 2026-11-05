from pathlib import Path

import msal

# Well-known Microsoft Graph PowerShell app - pre-consented for Graph APIs
CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
SCOPES = [
    "DeviceManagementConfiguration.Read.All",
    "DeviceManagementManagedDevices.Read.All",
    "DeviceManagementApps.Read.All",
    "DeviceManagementServiceConfig.Read.All",
    "DeviceManagementConfiguration.ReadWrite.All",
    # Required for /deviceManagement/deviceManagementScripts (PowerShell scripts)
    # and /deviceManagement/deviceHealthScripts (Remediation scripts).
    # DeviceManagementConfiguration.* does not cover these endpoints.
    "DeviceManagementScripts.Read.All",
    "Policy.Read.All",
]

TOKEN_CACHE_FILE = Path(__file__).parent / ".token_cache.json"
_token_cache = msal.SerializableTokenCache()
_cached_tenant: str | None = None
_app: msal.PublicClientApplication | None = None


def _load_cache():
    if TOKEN_CACHE_FILE.exists():
        _token_cache.deserialize(TOKEN_CACHE_FILE.read_text())


def _save_cache():
    if _token_cache.has_state_changed:
        TOKEN_CACHE_FILE.write_text(_token_cache.serialize())


def _get_app() -> msal.PublicClientApplication:
    global _app
    if _app is None:
        _load_cache()
        _app = msal.PublicClientApplication(
            CLIENT_ID,
            authority="https://login.microsoftonline.com/organizations",
            token_cache=_token_cache,
        )
    return _app


def logout():
    """Clear all cached tokens and reset the MSAL app so a new account can be chosen."""
    global _app, _cached_tenant
    _app = None
    _cached_tenant = None
    _token_cache._cache = {}
    if TOKEN_CACHE_FILE.exists():
        TOKEN_CACHE_FILE.unlink()
    _token_cache.has_state_changed = False


def get_graph_token() -> str:
    app = _get_app()

    # Try silent first (cached token)
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(SCOPES, account=accounts[0])
        if result and "access_token" in result:
            _save_cache()
            return result["access_token"]

    # Interactive browser login
    result = app.acquire_token_interactive(
        scopes=SCOPES,
        prompt="select_account",
    )
    if "access_token" not in result:
        raise RuntimeError(
            f"Authentication failed: {result.get('error_description', result.get('error', 'Unknown error'))}"
        )

    _save_cache()
    return result["access_token"]


def check_auth() -> dict:
    """Fast auth check - only checks token cache, no network calls."""
    try:
        app = _get_app()
        accounts = app.get_accounts()
        if accounts:
            account = accounts[0]
            tenant = account.get("realm", account.get("home_account_id", "").split(".")[1] if "." in account.get("home_account_id", "") else "Unknown")
            return {
                "authenticated": True,
                "tenant": tenant,
                "user": account.get("username", "Unknown"),
            }

        return {
            "authenticated": False,
            "error": "Not authenticated. Click 'Sign in' to connect.",
        }
    except Exception as e:
        return {"authenticated": False, "error": str(e)}
