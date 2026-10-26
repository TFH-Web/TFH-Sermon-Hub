# Load Backend/.env so scripts like up.py and populate.py get TENANT_ID and CLIENT_ID.
# Real env vars win over .env, so production can just set them normally.
import os

from dotenv import load_dotenv

# Production services receive a private EnvironmentFile from systemd, never a
# leftover environment file in a checkout or one of its parent directories.
if os.environ.get("TFH_ENV", "").strip().lower() != "production":
    load_dotenv()

from tsh.app import create_app  # noqa: E402

__all__ = [create_app]
