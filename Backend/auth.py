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


# Decorator that locks routes behind a role check. Key for the user is stored in g.current_user_role
def require_role(required_role):
    def decorator(function_to_wrap):
        @wraps(function_to_wrap)
        # Wrapper function, checks role before running. Grabs positional and keyword arguments to pass to the wrapped function
        def check_role_then_run(*args, **kwargs):
            # Parse the role from the token and store it in the global context
            parse_role_from_token()

            # On an invalid token the request is not authenticated,and 401 is returned. Frontend should handle this by redirecting to the login page
            if g.current_user_role is None:
                return jsonify({"error": "Missing or invalid token. Please log in."}), 401
            
            # If the user's role does not meet the required role, return a 403 Forbidden error. Frontend should handle this by showing an error message or redirecting to a "not authorized" page
            if g.current_user_role != required_role:
                return jsonify({"error": f"Access denied. Required role: {required_role}"}), 403

            # Both checks passed, run the wrapped function with the original arguments
            return function_to_wrap(*args, **kwargs)
        
        return check_role_then_run
    return decorator