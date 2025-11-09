from flask import request
from flask_socketio import emit, join_room
import uuid
from datetime import datetime
from models import db, Lobby, Player, SocketSession
from utils.helpers import generate_code

def register_lobby_handlers(socketio):
    """Register lobby-related socket handlers"""

    @socketio.on('create_lobby')
    def on_create_lobby(data):
        sid = request.sid
        code = generate_code()

        # Generate or use existing session ID
        session_id = data.get('sessionId') or str(uuid.uuid4())

        # Create lobby in database
        lobby = Lobby(
            code=code,
            host_session_id=session_id,
            status='waiting',
            current_question_index=0
        )
        db.session.add(lobby)

        # Create socket session mapping
        socket_session = SocketSession(
            socket_id=sid,
            session_id=session_id,
            lobby_code=code,
            role='host'
        )
        db.session.add(socket_session)

        db.session.commit()
        join_room(code)

        print(f"Lobby created: {code} by session {session_id}")
        emit('lobby_created', {'code': code, 'sessionId': session_id})

    @socketio.on('rejoin_host')
    def on_rejoin_host(data):
        sid = request.sid
        code = data['code'].upper()
        session_id = data.get('sessionId')

        # Verify lobby exists and user is the host
        lobby = Lobby.query.filter_by(code=code).first()
        if not lobby:
            return emit('error', {'message': 'Lobby not found'})

        if lobby.host_session_id != session_id:
            return emit('error', {'message': 'Not authorized as host'})

        # Create socket session mapping for host
        socket_session = SocketSession.query.filter_by(socket_id=sid).first()
        if socket_session:
            socket_session.session_id = session_id
            socket_session.lobby_code = code
            socket_session.role = 'host'
        else:
            socket_session = SocketSession(
                socket_id=sid,
                session_id=session_id,
                lobby_code=code,
                role='host'
            )
            db.session.add(socket_session)

        db.session.commit()
        join_room(code)

        print(f"Host reconnected to lobby {code}")

        # Send updated player list to host
        players_list = [p.to_dict() for p in Player.query.filter_by(lobby_code=code).all()]
        emit('players_updated', {'players': players_list})

    @socketio.on('join_lobby')
    def on_join_lobby(data):
        sid = request.sid
        code = data['code'].upper()
        name = data['name']

        # Generate or use existing session ID
        session_id = data.get('sessionId') or str(uuid.uuid4())

        # Check if lobby exists
        lobby = Lobby.query.filter_by(code=code).first()
        if not lobby:
            return emit('error', {'message': 'Lobby not found'})

        # Check if player already exists (reconnection case)
        player = Player.query.filter_by(session_id=session_id, lobby_code=code).first()

        if player:
            # Reconnecting player - keep their existing name, don't modify it
            player.is_connected = True
            player.last_seen_at = datetime.utcnow()
            name = player.display_name  # Use existing name
        else:
            # Delete any existing player with this session_id from other lobbies
            old_player = Player.query.filter_by(session_id=session_id).first()
            if old_player:
                db.session.delete(old_player)
                db.session.flush()  # Flush the delete before adding new player

            # New player - check for duplicate names
            existing_players = Player.query.filter_by(lobby_code=code).all()
            names = [p.display_name for p in existing_players]
            original_name = name
            counter = 2
            while name in names:
                name = f"{original_name} ({counter})"
                counter += 1

            # Create new player
            player = Player(
                session_id=session_id,
                lobby_code=code,
                display_name=name,
                score=0,
                is_connected=True
            )
            db.session.add(player)

        # Create socket session mapping
        socket_session = SocketSession.query.filter_by(socket_id=sid).first()
        if socket_session:
            socket_session.session_id = session_id
            socket_session.lobby_code = code
            socket_session.role = 'player'
        else:
            socket_session = SocketSession(
                socket_id=sid,
                session_id=session_id,
                lobby_code=code,
                role='player'
            )
            db.session.add(socket_session)

        db.session.commit()
        join_room(code)

        print(f"Player {name} joined {code}")

        emit('lobby_joined', {'code': code, 'sessionId': session_id, 'name': name})

        # Broadcast updated player list
        players_list = [p.to_dict() for p in Player.query.filter_by(lobby_code=code).all()]
        socketio.emit('players_updated', {'players': players_list}, room=code)

    @socketio.on('leave_lobby')
    def on_leave_lobby(data):
        sid = request.sid

        # Find socket session
        socket_session = SocketSession.query.filter_by(socket_id=sid).first()
        if not socket_session:
            return emit('error', {'message': 'Session not found'})

        code = socket_session.lobby_code
        session_id = socket_session.session_id

        # Remove player from database
        player = Player.query.filter_by(session_id=session_id, lobby_code=code).first()
        if player:
            player_name = player.display_name
            db.session.delete(player)
            db.session.commit()
            print(f"Player {player_name} left lobby {code}")

            # Broadcast updated player list
            players_list = [p.to_dict() for p in Player.query.filter_by(lobby_code=code).all()]
            socketio.emit('players_updated', {'players': players_list}, room=code)

        # Remove socket session
        db.session.delete(socket_session)
        db.session.commit()

        # Confirm to the player
        emit('lobby_left', {'success': True})

    @socketio.on('disband_lobby')
    def on_disband_lobby(data):
        sid = request.sid
        code = data['code']

        # Verify lobby exists
        lobby = Lobby.query.filter_by(code=code).first()
        if not lobby:
            return emit('error', {'message': 'Lobby not found'})

        # Verify user is the host
        socket_session = SocketSession.query.filter_by(socket_id=sid).first()
        if not socket_session or socket_session.session_id != lobby.host_session_id:
            return emit('error', {'message': 'Only host can disband lobby'})

        print(f"Lobby {code} disbanded by host")

        # Notify all clients in the lobby
        socketio.emit('lobby_disbanded', {'message': 'Host disbanded the lobby'}, room=code)

        # Delete lobby (cascade will delete players and socket sessions)
        db.session.delete(lobby)
        db.session.commit()

    @socketio.on('start_game')
    def on_start_game(data):
        sid = request.sid
        code = data['code']

        lobby = Lobby.query.filter_by(code=code).first()
        if not lobby:
            return emit('error', {'message': 'Lobby not found'})

        # Check if the socket belongs to the host
        socket_session = SocketSession.query.filter_by(socket_id=sid).first()
        if not socket_session or socket_session.session_id != lobby.host_session_id:
            return emit('error', {'message': 'Only host can start'})

        lobby.status = 'mode_selection'
        db.session.commit()

        print(f"Game starting in {code} - entering mode selection")
        socketio.emit('mode_selection_started', {}, room=code)
