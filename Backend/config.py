# config.py
# TODO: Move the secret key to an environment variable for better security before production deployment.
import os

class Config:
    # WARNING: This is a placeholder secret key. Do NOT use this in production. 
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "placeholder-secret-key")

    # Token expiry time in hours
    JWT_ACCESS_TOKEN_EXPIRES = 4