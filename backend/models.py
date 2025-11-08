from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import json

db = SQLAlchemy()

class Lobby(db.Model):
    __tablename__ = 'lobbies'

    code = db.Column(db.String(4), primary_key=True)
    host_session_id = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), default='waiting')  # waiting, mode_selection, playing, reveal, results
    game_mode = db.Column(db.String(20), nullable=True)  # ffa, teams_half, teams_3, teams_4
    current_question_index = db.Column(db.Integer, default=0)
    question_start_time = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, default=lambda: datetime.utcnow() + timedelta(hours=24))

    # Relationships
    players = db.relationship('Player', backref='lobby', lazy=True, cascade='all, delete-orphan')
    socket_sessions = db.relationship('SocketSession', backref='lobby', lazy=True, cascade='all, delete-orphan')
    player_answers = db.relationship('PlayerAnswer', backref='lobby', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'code': self.code,
            'host_session_id': self.host_session_id,
            'status': self.status,
            'current_question_index': self.current_question_index,
            'created_at': self.created_at.isoformat(),
            'players': [p.to_dict() for p in self.players]
        }

class Player(db.Model):
    __tablename__ = 'players'

    session_id = db.Column(db.String(100), primary_key=True)
    lobby_code = db.Column(db.String(4), db.ForeignKey('lobbies.code'), nullable=False)
    display_name = db.Column(db.String(100), nullable=False)
    score = db.Column(db.Integer, default=0)
    is_connected = db.Column(db.Boolean, default=True)
    last_seen_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.session_id,
            'name': self.display_name,
            'score': self.score,
            'connected': self.is_connected
        }

class SocketSession(db.Model):
    __tablename__ = 'socket_sessions'

    socket_id = db.Column(db.String(100), primary_key=True)
    session_id = db.Column(db.String(100), nullable=False)
    lobby_code = db.Column(db.String(4), db.ForeignKey('lobbies.code'), nullable=True)
    role = db.Column(db.String(20), nullable=False)  # host or player
    connected_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'socket_id': self.socket_id,
            'session_id': self.session_id,
            'lobby_code': self.lobby_code,
            'role': self.role
        }

class PlayerAnswer(db.Model):
    __tablename__ = 'player_answers'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    player_session_id = db.Column(db.String(100), nullable=False)
    lobby_code = db.Column(db.String(4), db.ForeignKey('lobbies.code'), nullable=False)
    question_index = db.Column(db.Integer, nullable=False)
    answer_index = db.Column(db.Integer, nullable=False)  # 0-3
    answered_at = db.Column(db.DateTime, default=datetime.utcnow)
    time_taken = db.Column(db.Float, nullable=False)  # seconds from question start
    points_earned = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id,
            'player_session_id': self.player_session_id,
            'lobby_code': self.lobby_code,
            'question_index': self.question_index,
            'answer_index': self.answer_index,
            'answered_at': self.answered_at.isoformat(),
            'time_taken': self.time_taken,
            'points_earned': self.points_earned
        }
