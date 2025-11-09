from flask import request
from flask_socketio import emit
import threading
from datetime import datetime
from models import db, Lobby, Player, SocketSession, PlayerAnswer
from config import GAME_MODES
from services.game_service import calculate_points, start_question

def register_game_handlers(app, socketio):
    """Register game-related socket handlers"""

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
        threading.Timer(2.0, lambda: start_question(app, socketio, code)).start()

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
