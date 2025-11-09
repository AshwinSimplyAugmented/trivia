from flask import request
from flask_socketio import emit
from models import db, Player, SocketSession
from datetime import datetime

def register_connection_handlers(socketio):
    """Register connect and disconnect socket handlers"""

    @socketio.on('connect')
    def on_connect():
        print(f"Client connected: {request.sid}")

    @socketio.on('disconnect')
    def on_disconnect():
        sid = request.sid
        print(f"Client disconnected: {sid}")

        # Find socket session
        socket_session = SocketSession.query.filter_by(socket_id=sid).first()
        if not socket_session:
            return

        # If player, mark as disconnected (not deleted)
        if socket_session.role == 'player':
            player = Player.query.filter_by(
                session_id=socket_session.session_id,
                lobby_code=socket_session.lobby_code
            ).first()
            if player:
                player.is_connected = False
                player.last_seen_at = datetime.utcnow()
                db.session.commit()

                # Broadcast updated player list
                players_list = [p.to_dict() for p in Player.query.filter_by(lobby_code=socket_session.lobby_code).all()]
                socketio.emit('players_updated', {'players': players_list}, room=socket_session.lobby_code)

        # Remove socket session (will be recreated on reconnect)
        db.session.delete(socket_session)
        db.session.commit()
