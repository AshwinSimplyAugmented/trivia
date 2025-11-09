from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS
from models import db
from config import Config
from routes.api import create_api_routes
from sockets.connection import register_connection_handlers
from sockets.lobby import register_lobby_handlers
from sockets.game import register_game_handlers
from utils.helpers import start_cleanup_thread
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Create Flask app
app = Flask(__name__, static_folder=Config.STATIC_FOLDER)
CORS(app, origins=Config.CORS_ORIGINS)

# Load configuration
app.config.from_object(Config)

# Initialize database
db.init_app(app)

# Initialize SocketIO
socketio = SocketIO(
    app,
    cors_allowed_origins=Config.SOCKETIO_CORS_ALLOWED_ORIGINS,
    async_mode=Config.SOCKETIO_ASYNC_MODE
)

# Register HTTP routes
create_api_routes(app)

# Register Socket.IO handlers
register_connection_handlers(socketio)
register_lobby_handlers(socketio)
register_game_handlers(app, socketio)

# Initialize database tables
with app.app_context():
    db.create_all()
    print("Database initialized successfully")

# Start cleanup thread
start_cleanup_thread(app, db)

if __name__ == '__main__':
    print("=" * 40)
    print("Trivia Server Running")
    print("http://localhost:5000")
    print("=" * 40)
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
