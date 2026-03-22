from flask import request, jsonify, g

# Checks the Authorization header for a valid JWT token and reads the user's role from the token. Raises an error if the token is missing, invalid, or if the role is not present in the token.
from flask_jwt_extended import verify_jwt_in_request, get_jwt

# Decorator to protect routes and ensure the user has the required role, as well as making debugging easier by printing the token's claims
from functools import wraps


# Verifies the token and reads in the roles. Handles cases where the token is missing, invalid, or without a role claim
def parse_role_from_token():
    try: 
        # This will raise an error if the token is missing or invalid
        verify_jwt_in_request()

        # Reads the user's role from the token's claims
        token_claims = get_jwt()

        # Grabs the role from the payload and stores it in the Flask global context for use in the route. Defaults to viewer if the role is not present in the token, but the token exists and is valid
        g.current_user_role = token_claims.get("role", "viewer")

    # If an error occurs then the user is not authenticated and the role is set to None
    except Exception as error:
        g.current_user_role = None