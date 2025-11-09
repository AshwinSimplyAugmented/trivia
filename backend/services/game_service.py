import threading
from datetime import datetime
from models import db, Lobby, Player, PlayerAnswer
from config import GAME_MODES

def calculate_points(time_taken, time_limit, is_correct):
    """Calculate points based on answer speed and correctness"""
    if not is_correct:
        return 0

    base_points = 1
    time_remaining = max(0, time_limit - time_taken)
    time_bonus = int((time_remaining / time_limit) * 4)

    return base_points + time_bonus

def start_question(app, socketio, code):
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
            end_game(app, socketio, code)
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
        threading.Timer(time_limit, lambda: end_question(app, socketio, code)).start()

def end_question(app, socketio, code):
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
        threading.Timer(5.0, lambda: next_question(app, socketio, code)).start()

def next_question(app, socketio, code):
    """Move to the next question"""
    with app.app_context():
        lobby = Lobby.query.filter_by(code=code).first()
        if not lobby:
            return

        lobby.current_question_index += 1
        lobby.status = 'playing'
        db.session.commit()

        start_question(app, socketio, code)

def end_game(app, socketio, code):
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
