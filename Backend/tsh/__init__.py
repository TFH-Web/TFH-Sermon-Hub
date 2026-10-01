# Load Backend/.env so scripts like up.py and populate.py get TENANT_ID and CLIENT_ID.
# Real env vars win over .env, so production can just set them normally.
from dotenv import load_dotenv

load_dotenv()

from tsh.app import create_app  # noqa: E402

__all__ = [create_app]
