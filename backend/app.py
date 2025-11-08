from flask import Flask, request, send_from_directory, jsonify
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
import random
import string
import json
import uuid
import os
import threading
import time
from models import db, Lobby, Player, SocketSession, PlayerAnswer
from datetime import datetime, timedelta

# Get absolute path to the backend directory
basedir = os.path.abspath(os.path.dirname(__file__))

# Create data directory if it doesn't exist (MUST be before app initialization)
data_dir = os.path.join(basedir, 'data')
os.makedirs(data_dir, exist_ok=True)

app = Flask(__name__, static_folder='build')
CORS(app)

# Database configuration with absolute path
db_path = os.path.join(data_dir, 'trivia.db')
# Convert Windows backslashes to forward slashes for SQLite URI
db_uri = db_path.replace('\\', '/')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_uri}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
print(f"Database URI: sqlite:///{db_uri}")

# Initialize database
db.init_app(app)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Load questions for different game modes
with open('questions_ffa.json', 'r') as f:
    QUESTIONS_FFA = json.load(f)

# Map of game modes to their question sets
GAME_MODES = {
    'ffa': QUESTIONS_FFA
}

def generate_code():
    while True:
        code = ''.join(random.choices(string.ascii_uppercase, k=4))
        if not Lobby.query.filter_by(code=code).first():
            return code

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

# ========== GAME MODE & QUESTION FLOW ==========

def calculate_points(time_taken, time_limit, is_correct):
    """Calculate points based on answer speed and correctness"""
    if not is_correct:
        return 0

    base_points = 1
    time_remaining = max(0, time_limit - time_taken)
    time_bonus = int((time_remaining / time_limit) * 4)

    return base_points + time_bonus

@socketio.on('select_game_mode')
def on_select_game_mode(data):
    sid = request.sid
    code = data['code']
    mode = data['mode']  # 'ffa', 'teams_half', etc.

    lobby = Lobby.query.filter_by(code=code).first()
    if not lobby:
        return emit('error', {'message': 'Lobby not found'})

    # Verify user is the host
    socket_session = SocketSession.query.filter_by(socket_id=sid).first()
    if not socket_session or socket_session.session_id != lobby.host_session_id:
        return emit('error', {'message': 'Only host can select game mode'})

    # Validate mode exists
    if mode not in GAME_MODES:
        return emit('error', {'message': 'Invalid game mode'})

    lobby.game_mode = mode
    lobby.status = 'playing'
    lobby.current_question_index = 0
    db.session.commit()

    mode_info = GAME_MODES[mode]

    print(f"Game mode selected: {mode} for lobby {code}")

    # Notify all players
    socketio.emit('game_mode_selected', {
        'mode': mode,
        'mode_name': mode_info['mode_display_name']
    }, room=code)

    # Start first question after a short delay
    threading.Timer(2.0, lambda: start_question(code)).start()

def start_question(code):
    """Start a question for the lobby"""
    with app.app_context():
        lobby = Lobby.query.filter_by(code=code).first()
        if not lobby or lobby.status != 'playing':
            return

        mode_config = GAME_MODES[lobby.game_mode]
        questions = mode_config['questions']
        question_index = lobby.current_question_index

        if question_index >= len(questions):
            # Game over
            end_game(code)
            return

        question_data = questions[question_index]
        lobby.question_start_time = datetime.utcnow()
        db.session.commit()

        print(f"Starting question {question_index + 1} in lobby {code}")

        # Send question to all clients
        socketio.emit('question_started', {
            'question_index': question_index,
            'question': question_data['question'],
            'answers': question_data['answers'],
            'time_limit': mode_config['time_per_question'],
            'total_questions': len(questions)
        }, room=code)

        # Auto-end question after time limit
        time_limit = mode_config['time_per_question']
        threading.Timer(time_limit, lambda: end_question(code)).start()

@socketio.on('submit_answer')
def on_submit_answer(data):
    sid = request.sid
    question_index = data['question_index']
    answer_index = data['answer_index']

    # Find player
    socket_session = SocketSession.query.filter_by(socket_id=sid).first()
    if not socket_session or socket_session.role != 'player':
        return emit('error', {'message': 'Only players can submit answers'})

    code = socket_session.lobby_code
    session_id = socket_session.session_id

    lobby = Lobby.query.filter_by(code=code).first()
    if not lobby or lobby.status != 'playing':
        return emit('error', {'message': 'Game not in progress'})

    # Check if they already answered this question
    existing_answer = PlayerAnswer.query.filter_by(
        player_session_id=session_id,
        lobby_code=code,
        question_index=question_index
    ).first()

    if existing_answer:
        return emit('error', {'message': 'Already answered this question'})

    # Calculate time taken
    if not lobby.question_start_time:
        return emit('error', {'message': 'Question not started'})

    time_taken = (datetime.utcnow() - lobby.question_start_time).total_seconds()

    mode_config = GAME_MODES[lobby.game_mode]
    question_data = mode_config['questions'][question_index]
    correct_answer = question_data['correct']
    is_correct = (answer_index == correct_answer)

    # Calculate points
    points = calculate_points(time_taken, mode_config['time_per_question'], is_correct)

    # Save answer
    player_answer = PlayerAnswer(
        player_session_id=session_id,
        lobby_code=code,
        question_index=question_index,
        answer_index=answer_index,
        time_taken=time_taken,
        points_earned=points
    )
    db.session.add(player_answer)

    # Update player total score
    player = Player.query.filter_by(session_id=session_id, lobby_code=code).first()
    if player:
        player.score += points

    db.session.commit()

    print(f"Player {session_id} answered question {question_index} with answer {answer_index} (correct: {is_correct}, points: {points})")

    # Confirm to player
    emit('answer_submitted', {
        'question_index': question_index,
        'answer_index': answer_index
    })

def end_question(code):
    """End the current question and show results"""
    with app.app_context():
        lobby = Lobby.query.filter_by(code=code).first()
        if not lobby or lobby.status != 'playing':
            return

        question_index = lobby.current_question_index
        mode_config = GAME_MODES[lobby.game_mode]
        question_data = mode_config['questions'][question_index]
        correct_answer = question_data['correct']

        # Get all answers for this question
        answers = PlayerAnswer.query.filter_by(
            lobby_code=code,
            question_index=question_index
        ).order_by(PlayerAnswer.answered_at).all()

        # Build answer stats with player names and initials
        answer_stats = [{'players': []} for _ in range(len(question_data['answers']))]

        for answer in answers:
            player = Player.query.filter_by(session_id=answer.player_session_id).first()
            if player:
                initial = player.display_name[0].upper()
                answer_stats[answer.answer_index]['players'].append({
                    'name': player.display_name,
                    'initial': initial,
                    'points': answer.points_earned,
                    'session_id': player.session_id
                })

        print(f"Ending question {question_index + 1} in lobby {code}")

        # Change status to reveal
        lobby.status = 'reveal'
        db.session.commit()

        # Send updated scores to all players
        players_list = [p.to_dict() for p in Player.query.filter_by(lobby_code=code).all()]
        socketio.emit('players_updated', {'players': players_list}, room=code)

        # Send reveal data
        socketio.emit('question_ended', {
            'question_index': question_index,
            'correct_answer': correct_answer,
            'answer_stats': answer_stats
        }, room=code)

        # After 5 seconds, move to next question
        threading.Timer(5.0, lambda: next_question(code)).start()

def next_question(code):
    """Move to the next question"""
    with app.app_context():
        lobby = Lobby.query.filter_by(code=code).first()
        if not lobby:
            return

        lobby.current_question_index += 1
        lobby.status = 'playing'
        db.session.commit()

        start_question(code)

def end_game(code):
    """End the game and show final results"""
    with app.app_context():
        lobby = Lobby.query.filter_by(code=code).first()
        if not lobby:
            return

        lobby.status = 'results'
        db.session.commit()

        # Get final scores
        players = Player.query.filter_by(lobby_code=code).order_by(Player.score.desc()).all()
        final_scores = [
            {
                'name': p.display_name,
                'score': p.score,
                'session_id': p.session_id
            }
            for p in players
        ]

        winner = final_scores[0] if final_scores else None

        print(f"Game ended in lobby {code}. Winner: {winner['name'] if winner else 'None'}")

        socketio.emit('game_ended', {
            'final_scores': final_scores,
            'winner': winner
        }, room=code)

# HTTP API endpoint for reconnection
@app.route('/api/reconnect', methods=['POST'])
def reconnect():
    data = request.json
    session_id = data.get('sessionId')
    lobby_code = data.get('lobbyCode')

    if not session_id or not lobby_code:
        return jsonify({'success': False, 'message': 'Missing sessionId or lobbyCode'}), 400

    # Check if lobby exists
    lobby = Lobby.query.filter_by(code=lobby_code).first()
    if not lobby:
        return jsonify({'success': False, 'message': 'Lobby not found'}), 404

    # Check if user is the host
    if lobby.host_session_id == session_id:
        players_list = [p.to_dict() for p in Player.query.filter_by(lobby_code=lobby_code).all()]
        return jsonify({
            'success': True,
            'role': 'host',
            'lobbyCode': lobby_code,
            'status': lobby.status,
            'players': players_list
        })

    # Check if user is a player
    player = Player.query.filter_by(session_id=session_id, lobby_code=lobby_code).first()
    if player:
        players_list = [p.to_dict() for p in Player.query.filter_by(lobby_code=lobby_code).all()]
        return jsonify({
            'success': True,
            'role': 'player',
            'lobbyCode': lobby_code,
            'displayName': player.display_name,
            'status': lobby.status,
            'players': players_list
        })

    return jsonify({'success': False, 'message': 'Session not found in this lobby'}), 404

# Enhanced asset-manifest.json route with cache control
@app.route('/asset-manifest.json')
def serve_manifest():
    response = send_from_directory(app.static_folder, 'asset-manifest.json')
    # Add cache control headers to ensure latest version is always used
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Development-only route for hot reloading
@app.route('/<path:filename>.hot-update.json')
def hot_update_json(filename):
    """Handles hot-update requests during development"""
    print(f"Hot-update request received for: {filename}")
    return jsonify({"message": "Hot-update not handled here"}), 200

# Static files route to handle CSS and JS files properly
@app.route('/static/<path:filepath>')
def serve_static_files(filepath):
    print(f"Attempting to serve static file from: {filepath}")
    try:
        response = send_from_directory(os.path.join(app.static_folder, 'static'), filepath)
        # Set proper MIME types for different file types
        if filepath.endswith('.css'):
            response.headers['Content-Type'] = 'text/css'
        elif filepath.endswith('.js'):
            response.headers['Content-Type'] = 'application/javascript'
        return response
    except Exception as e:
        print(f"Error serving static file: {e}")
        return str(e), 404

# Main application route handler (catch-all for React routing)
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    """
    Main route handler that serves the React application and other static files.
    This acts as a catch-all route for any unmatched paths.
    """
    try:
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            print(f"Serving static file: {path}")
            return send_from_directory(app.static_folder, path)
        else:
            print("Serving default file: index.html")
            return send_from_directory(app.static_folder, 'index.html')
    except Exception as e:
        print(f"Error in serving file: {path}, Error: {e}")
        return "An error occurred", 500

# Cleanup function for expired lobbies and orphaned sessions
def cleanup_expired_lobbies():
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

# Initialize database tables
with app.app_context():
    db.create_all()
    print("Database initialized successfully")

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_expired_lobbies, daemon=True)
cleanup_thread.start()
print("Cleanup thread started")

if __name__ == '__main__':
    print("=" * 40)
    print("Trivia Server Running")
    print("http://localhost:5000")
    print("=" * 40)
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
