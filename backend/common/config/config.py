import os

# ---------------------------------------------------------------------------
# Central tool-switching config
# Set TOOL=sage (default) or TOOL=zoho in your environment / .env file.
# DB name is resolved from active tool configuration.
# ---------------------------------------------------------------------------

TOOL = os.getenv("TOOL", "sage").lower()

# Per-tool defaults (used as fallback when env vars are not set)
_DEFAULTS = {
    "sage": {
        "db": "accounts_payable",
        "erp_name": "Sage",
    },
    "zoho": {
        "db": "accounts_payable_zoho",
        "erp_name": "Zoho",
    },
}

if TOOL not in _DEFAULTS:
    raise ValueError(
        f"Unknown TOOL value: '{TOOL}'. "
        f"Valid values are: {list(_DEFAULTS.keys())}. "
        "Set the TOOL environment variable before starting the server."
    )

_tool_defaults = _DEFAULTS[TOOL]

# Build the active config by preferring env vars over hardcoded defaults.
ACTIVE_CONFIG = {
    "db":            os.getenv("DB_NAME",            _tool_defaults["db"]),
    "erp_name":      _tool_defaults["erp_name"],
}

# Keep CONFIG for any code that still reads CONFIG[TOOL] directly.
CONFIG = {TOOL: ACTIVE_CONFIG}
