import random
import string
import time
import threading
from datetime import datetime, timedelta

def generate_code():
    """Generate a unique 4-letter lobby code"""
    from models import Lobby

    while True:
        code = ''.join(random.choices(string.ascii_uppercase, k=4))
        if not Lobby.query.filter_by(code=code).first():
            return code

def cleanup_expired_lobbies(app, db):
    """
    Cleanup function for expired lobbies and orphaned sessions.
    Runs in a background thread.
    """
    from models import Lobby, SocketSession

    while True:
        time.sleep(3600)  # Run every hour
        with app.app_context():
            try:
                # Clean up expired lobbies (this will cascade delete players and socket sessions)
                expired_lobbies = Lobby.query.filter(Lobby.expires_at < datetime.utcnow()).all()
                for lobby in expired_lobbies:
                    print(f"Cleaning up expired lobby: {lobby.code}")
                    db.session.delete(lobby)
                db.session.commit()

                # Clean up orphaned socket sessions (older than 1 hour with no lobby)
                one_hour_ago = datetime.utcnow() - timedelta(hours=1)
                orphaned_sessions = SocketSession.query.filter(
                    SocketSession.lobby_code == None,
                    SocketSession.connected_at < one_hour_ago
                ).all()
                for session in orphaned_sessions:
                    print(f"Cleaning up orphaned socket session: {session.socket_id}")
                    db.session.delete(session)
                db.session.commit()

                print(f"Cleanup completed: {len(expired_lobbies)} lobbies, {len(orphaned_sessions)} orphaned sessions")
            except Exception as e:
                print(f"Error cleaning up: {e}")

def start_cleanup_thread(app, db):
    """Start the cleanup thread"""
    cleanup_thread = threading.Thread(
        target=cleanup_expired_lobbies,
        args=(app, db),
        daemon=True
    )
    cleanup_thread.start()
    print("Cleanup thread started")
