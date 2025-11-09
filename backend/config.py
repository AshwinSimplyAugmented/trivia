import os
import json

# Get absolute path to the backend directory
basedir = os.path.abspath(os.path.dirname(__file__))

# Create data directory if it doesn't exist
data_dir = os.path.join(basedir, 'data')
os.makedirs(data_dir, exist_ok=True)

# Database configuration with absolute path
db_path = os.path.join(data_dir, 'trivia.db')
# Convert Windows backslashes to forward slashes for SQLite URI
db_uri = db_path.replace('\\', '/')

class Config:
    """Application configuration"""

    # Flask config
    STATIC_FOLDER = 'build'

    # Database config
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{db_uri}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # CORS config
    CORS_ORIGINS = "*"

    # SocketIO config
    SOCKETIO_ASYNC_MODE = 'threading'
    SOCKETIO_CORS_ALLOWED_ORIGINS = "*"

    # Game modes config
    @staticmethod
    def load_game_modes():
        """Load game mode configurations"""
        with open(os.path.join(basedir, 'questions_ffa.json'), 'r') as f:
            questions_ffa = json.load(f)

        return {
            'ffa': questions_ffa
        }

# Load game modes
GAME_MODES = Config.load_game_modes()

# Print database URI for debugging
print(f"Database URI: sqlite:///{db_uri}")
