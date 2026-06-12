import os

# ---------------------------------------------------------------------------
# Central tool-switching config
# Set TOOL=sage (default) or TOOL=zoho in your environment / .env file.
# ---------------------------------------------------------------------------

TOOL = os.getenv("TOOL", "sage")

CONFIG = {
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

if TOOL not in CONFIG:
    raise ValueError(
        f"Unknown TOOL value: '{TOOL}'. "
        f"Valid values are: {list(CONFIG.keys())}. "
        "Set the TOOL environment variable before starting the server."
    )

# The active configuration for the currently running tool instance.
ACTIVE_CONFIG = CONFIG[TOOL]
