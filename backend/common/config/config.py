import os

# ---------------------------------------------------------------------------
# Central tool-switching config
# Set TOOL=sage (default) or TOOL=zoho in your environment / .env file.
# Ports and DB name are read from the corresponding .env.<tool> file via
# FRONTEND_PORT, BACKEND_PORT, and DB_NAME environment variables.
# ---------------------------------------------------------------------------

TOOL = os.getenv("TOOL", "sage")

# Per-tool defaults (used as fallback when env vars are not set)
_DEFAULTS = {
    "sage": {
        "frontend_port": 3003,
        "backend_port": 8014,
        "db": "accounts_payable",
        "erp_name": "Sage",
    },
    "zoho": {
        "frontend_port": 3004,
        "backend_port": 8015,
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
# This allows .env.sage / .env.zoho to override ports and DB name without
# touching source code.
ACTIVE_CONFIG = {
    "frontend_port": int(os.getenv("FRONTEND_PORT", _tool_defaults["frontend_port"])),
    "backend_port":  int(os.getenv("BACKEND_PORT",  _tool_defaults["backend_port"])),
    "db":            os.getenv("DB_NAME",            _tool_defaults["db"]),
    "erp_name":      _tool_defaults["erp_name"],
}

# Keep CONFIG for any code that still reads CONFIG[TOOL] directly.
CONFIG = {TOOL: ACTIVE_CONFIG}
