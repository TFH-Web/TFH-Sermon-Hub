import os 
from functools import wraps

import jwt
from flask import g, jsonify, request
from jwt import PyJWKClient

TENANT_ID = os.environ['TENANT_ID']
CLIENT_ID = os.environ['CLIENT_ID']

JWKS_URL = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"
ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"

jwks_client = PyJWKClient(JWKS_URL)

def parse_role_from_token():
    try:
        auth_header = request.headers.get('Authorization', "")
        if not auth_header.startswith("Bearer "):
            raise ValueError("Missing bearer token")
        token = auth_header.split(" ", 1)[1]

        signing_key = jwks_client.get_signing_key_from_jwt(token)

        token_claims = jwt.decode(token, signing_key.key, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)

        g.current_user_role = token_claims.get("roles", [])

    except Exception:
        g.current_user_role = None

def require_role(required_role):
    def decorator(function_to_wrap):
        @wraps(function_to_wrap)
        def check_role_then_run(*args, **kwargs):
            parse_role_from_token()

            if g.current_user_role is None:
                return jsonify({"error": "Missing or invalid token. Please log in."}), 401
            
            if required_role not in g.current_user_role:
                return jsonify({"error": f"Access Denied. Required role: {required_role}"}), 403
            
            return function_to_wrap(*args, **kwargs)
        return check_role_then_run
    return decorator