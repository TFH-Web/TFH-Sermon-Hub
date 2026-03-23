from flask import Flask
from flask_jwt_extended import JWTManager
from config import Config

app = Flask(__name__)

# Load configuration from the Config class
app.config.from_object(Config)

# Initialize JWTManager with the Flask app
jwt = JWTManager(app)
