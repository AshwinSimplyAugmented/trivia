import React, { useState, useEffect, useRef } from 'react';
import {
  Gamepad2, Users, Play, X, Settings, Clock, Check,
  AlertCircle, Crown, Trophy, Zap, Target, Shield,
  Loader2, Info, CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';

// Import centralized socket and utilities
import {
  socket,
  initializeSocketListeners,
  cleanupSocketListeners,
  createLobby,
  rejoinHost,
  joinLobby,
  startGame,
  selectGameMode,
  submitAnswer,
  leaveLobby,
  disbandLobby,
  reconnectToLobby
} from './api/socket';
import { getSessionId } from './utils/helpers';
import AudioManager from './services/AudioManager';

function App() {
  // View states: home, host, host_mode_select, host_question, host_reveal, host_results
  //              player, player_waiting, player_question, player_reveal, player_results
  const [view, setView] = useState('home');
  const [lobbyCode, setLobbyCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [players, setPlayers] = useState([]);
  const [playerId, setPlayerId] = useState('');
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(getSessionId());
  const [isReconnecting, setIsReconnecting] = useState(true);

  // Join code input
  const [joinCode, setJoinCode] = useState('');

  // Game state
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentAnswers, setCurrentAnswers] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLimit, setTimeLimit] = useState(15);
  const [timeRemaining, setTimeRemaining] = useState(15);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [answerStats, setAnswerStats] = useState([]);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [finalScores, setFinalScores] = useState([]);
  const [winner, setWinner] = useState(null);

  // Toast and Modal state
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);

  const timerRef = useRef(null);
  const selectedAnswerRef = useRef(null);
  const toastIdCounter = useRef(0);
  const audioInitialized = useRef(false);

  // Toast functions
  const showToast = (message, type = 'info') => {
    const id = toastIdCounter.current++;
    const toast = { id, message, type };
    setToasts(prev => [...prev, toast]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300); // Match exit animation duration
    }, 4000);
  };

  // Modal functions
  const showConfirm = (title, message, onConfirm, onCancel) => {
    setModal({ title, message, onConfirm, onCancel });
  };

  const closeModal = () => {
    setModal(null);
  };

  // Reconnection logic on mount
  useEffect(() => {
    const attemptReconnect = async () => {
      const storedLobbyCode = localStorage.getItem('lobbyCode');
      const storedSessionId = localStorage.getItem('sessionId');

      if (storedLobbyCode && storedSessionId) {
        try {
          const data = await reconnectToLobby(storedSessionId, storedLobbyCode);

          if (data.success) {
            setLobbyCode(data.lobbyCode);
            setPlayers(data.players || []);

            if (data.role === 'host') {
              setView('host');
              rejoinHost(data.lobbyCode, storedSessionId);
            } else if (data.role === 'player') {
              setView('player');
              setDisplayName(data.displayName);
              setPlayerId(storedSessionId);
              joinLobby(data.lobbyCode, data.displayName, storedSessionId);
            }
          } else {
            // Reconnection failed - lobby doesn't exist anymore
            localStorage.removeItem('lobbyCode');
            localStorage.removeItem('role');
            localStorage.removeItem('displayName');
            setView('home');
            setLobbyCode('');
            setPlayers([]);
            setDisplayName('');
            setPlayerId('');
          }
        } catch (err) {
          console.error('Reconnection failed:', err);
          // Clear everything on error
          localStorage.removeItem('lobbyCode');
          localStorage.removeItem('role');
          localStorage.removeItem('displayName');
          setView('home');
        }
      }
      setIsReconnecting(false);
    };

    attemptReconnect();
  }, []);

  // Initialize AudioManager on mount (only once)
  useEffect(() => {
    if (!audioInitialized.current) {
      console.log('[App] Initializing AudioManager');
      AudioManager.init();
      audioInitialized.current = true;
    }
    // No cleanup - AudioManager is a singleton that should persist
    // throughout the app lifecycle. Cleanup only happens on page unload.
  }, []);

  // Handle audio based on view changes (Host only)
  useEffect(() => {
    const role = localStorage.getItem('role');

    // Only host plays background music
    if (role !== 'host') {
      return;
    }

    // Unlock audio on first interaction (mobile support)
    AudioManager.unlockAudio();

    if (view === 'host' || view === 'host_mode_select') {
      // Play lobby music
      console.log('[App] Playing lobby music');
      AudioManager.playBGM('lobby');
    } else if (view === 'host_question' || view === 'host_reveal') {
      // Cross-fade to gameplay music
      console.log('[App] Cross-fading to gameplay music');
      AudioManager.playBGM('gameplay');
    } else if (view === 'host_results') {
      // Keep gameplay music for results
      // You could add a separate results track here if you want
      console.log('[App] Keeping gameplay music for results');
    } else if (view === 'home') {
      // Stop all music when returning to home
      console.log('[App] Stopping all music');
      AudioManager.stopBGM();
    }
  }, [view]);

  // Initialize socket listeners
  useEffect(() => {
    initializeSocketListeners({
      onLobbyCreated: (data) => {
        setLobbyCode(data.code);
        setView('host');
        localStorage.setItem('lobbyCode', data.code);
        localStorage.setItem('role', 'host');
        if (data.sessionId) {
          localStorage.setItem('sessionId', data.sessionId);
          setSessionId(data.sessionId);
        }
      },
      onLobbyJoined: (data) => {
        setLobbyCode(data.code);
        setPlayerId(data.sessionId);
        setDisplayName(data.name);
        setView('player');
        localStorage.setItem('lobbyCode', data.code);
        localStorage.setItem('role', 'player');
        localStorage.setItem('displayName', data.name);
        if (data.sessionId) {
          localStorage.setItem('sessionId', data.sessionId);
          setSessionId(data.sessionId);
        }
      },
      onPlayersUpdated: (data) => {
        setPlayers(data.players);
        // Update my score if I'm a player
        const me = data.players.find(p => p.id === playerId);
        if (me) {
          setMyScore(me.score);
        }
      },
      onModeSelectionStarted: () => {
        const role = localStorage.getItem('role');
        if (role === 'host') {
          setView('host_mode_select');
        } else {
          setView('player_waiting');
        }
      },
      onGameModeSelected: (data) => {
        console.log('Game mode selected:', data.mode_name);
      },
      onQuestionStarted: (data) => {
        setCurrentQuestion(data.question);
        setCurrentAnswers(data.answers);
        setQuestionIndex(data.question_index);
        setTotalQuestions(data.total_questions);
        setTimeLimit(data.time_limit);
        setTimeRemaining(data.time_limit);
        setSelectedAnswer(null);
        selectedAnswerRef.current = null;
        setCorrectAnswer(null);
        setAnswerStats([]);
        setPointsEarned(0);

        const role = localStorage.getItem('role');
        if (role === 'host') {
          setView('host_question');
        } else {
          setView('player_question');
        }

        // Start timer
        startTimer(data.time_limit);
      },
      onAnswerSubmitted: (data) => {
        setSelectedAnswer(data.answer_index);
        selectedAnswerRef.current = data.answer_index;
        console.log('Answer submitted, index:', data.answer_index);
      },
      onQuestionEnded: (data) => {
        console.log('Question ended data:', data);
        console.log('My selectedAnswer from ref:', selectedAnswerRef.current);
        console.log('My playerId:', playerId);

        setCorrectAnswer(data.correct_answer);
        setAnswerStats(data.answer_stats);

        // Calculate points earned for this player using ref
        const myAnswerIndex = selectedAnswerRef.current;
        const myAnswerData = myAnswerIndex !== null ? data.answer_stats[myAnswerIndex]?.players?.find(
          p => p.session_id === playerId
        ) : null;

        console.log('My answer index:', myAnswerIndex);
        console.log('My answer data:', myAnswerData);

        if (myAnswerData) {
          setPointsEarned(myAnswerData.points);
          console.log('Points earned:', myAnswerData.points);
        } else {
          setPointsEarned(0);
          console.log('No answer data found, setting points to 0');
        }

        const role = localStorage.getItem('role');
        if (role === 'host') {
          setView('host_reveal');
        } else {
          setView('player_reveal');
        }

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      },
      onGameEnded: (data) => {
        setFinalScores(data.final_scores);
        setWinner(data.winner);

        const role = localStorage.getItem('role');
        if (role === 'host') {
          setView('host_results');
        } else {
          setView('player_results');
        }

        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      },
      onError: (data) => {
        setError(data.message);
      },
      onLobbyLeft: () => {
        localStorage.removeItem('lobbyCode');
        localStorage.removeItem('role');
        localStorage.removeItem('displayName');
        setView('home');
        setLobbyCode('');
        setPlayers([]);
        setDisplayName('');
        setPlayerId('');
      },
      onLobbyDisbanded: (data) => {
        showToast(data.message, 'warning');
        localStorage.removeItem('lobbyCode');
        localStorage.removeItem('role');
        localStorage.removeItem('displayName');
        setView('home');
        setLobbyCode('');
        setPlayers([]);
        setDisplayName('');
        setPlayerId('');
      }
    });

    return () => {
      cleanupSocketListeners();
    };
  }, [playerId]);

  const startTimer = (duration) => {
    let remaining = duration;
    setTimeRemaining(remaining);

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(timerRef.current);
      }
    }, 1000);
  };

  const handleCreateLobby = () => {
    // Unlock audio on first interaction (mobile support)
    AudioManager.unlockAudio();
    createLobby(sessionId);
  };

  const handleJoinLobby = () => {
    // Unlock audio on first interaction (mobile support)
    AudioManager.unlockAudio();
    if (!joinCode || !displayName) {
      setError('Please enter lobby code and name');
      return;
    }
    joinLobby(joinCode, displayName, sessionId);
  };

  const handleStartGame = () => {
    startGame(lobbyCode);
  };

  const handleSelectGameMode = (mode) => {
    selectGameMode(lobbyCode, mode);
  };

  const handleSubmitAnswer = (answerIndex) => {
    if (selectedAnswer !== null) return; // Already answered
    submitAnswer(questionIndex, answerIndex);
  };

  const handleLeaveLobby = () => {
    leaveLobby();
  };

  const handleDisbandLobby = () => {
    showConfirm(
      'Disband Lobby?',
      'Are you sure you want to disband this lobby? All players will be kicked out.',
      () => {
        disbandLobby(lobbyCode);
        AudioManager.stopBGM(); // Stop music when disbanding
        localStorage.removeItem('lobbyCode');
        localStorage.removeItem('role');
        localStorage.removeItem('displayName');
        setView('home');
        setLobbyCode('');
        setPlayers([]);
        closeModal();
      },
      () => {
        closeModal();
      }
    );
  };

  const returnToLobby = () => {
    const role = localStorage.getItem('role');
    if (role === 'host') {
      setView('host');
    } else {
      setView('player');
    }
  };

  // TOAST NOTIFICATIONS COMPONENT
  const ToastNotifications = () => {
    if (toasts.length === 0) return null;

    const getToastIcon = (type) => {
      switch (type) {
        case 'success': return <CheckCircle size={20} />;
        case 'error': return <XCircle size={20} />;
        case 'warning': return <AlertTriangle size={20} />;
        default: return <Info size={20} />;
      }
    };

    return (
      <div className="toast-container">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast ${toast.type} ${toast.exiting ? 'exit' : ''}`}
          >
            <div className="toast-icon">
              {getToastIcon(toast.type)}
            </div>
            <div className="toast-message">{toast.message}</div>
          </div>
        ))}
      </div>
    );
  };

  // CONFIRMATION MODAL COMPONENT
  const ConfirmationModal = () => {
    if (!modal) return null;

    return (
      <div className="modal-overlay" onClick={(e) => {
        if (e.target === e.currentTarget) {
          modal.onCancel?.();
        }
      }}>
        <div className="modal">
          <div className="modal-header">
            <AlertTriangle size={28} style={{ color: '#ef4444' }} />
            <h3 className="modal-title">{modal.title}</h3>
          </div>
          <p className="modal-message">{modal.message}</p>
          <div className="modal-actions">
            <button onClick={modal.onCancel} className="btn-secondary">
              Cancel
            </button>
            <button onClick={modal.onConfirm} className="btn-danger">
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render toast and modal on every view
  const renderWithNotifications = (content) => {
    return (
      <>
        <ToastNotifications />
        <ConfirmationModal />
        {content}
      </>
    );
  };

  // HOME VIEW
  if (view === 'home') {
    return renderWithNotifications(
      <div className="container">
        <h1><Gamepad2 size={48} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '12px' }} />Trivia Party</h1>

        <button onClick={handleCreateLobby}>
          <Crown size={20} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
          Create Lobby (Host)
        </button>

        <div className="divider">OR</div>

        <input
          type="text"
          placeholder="Enter Lobby Code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={4}
        />

        <input
          type="text"
          placeholder="Your Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={20}
        />

        <button onClick={handleJoinLobby}>
          <Users size={20} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
          Join Lobby
        </button>

        {error && (
          <div className="error">
            <AlertCircle size={20} />
            {error}
          </div>
        )}
      </div>
    );
  }

  // HOST LOBBY VIEW
  if (view === 'host') {
    return renderWithNotifications(
      <div className="container">
        <h1><Crown size={40} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '12px' }} />Host Lobby</h1>

        <div className="lobby-code">
          <div className="lobby-code-label">Lobby Code</div>
          <div className="lobby-code-value">{lobbyCode}</div>
        </div>

        <div className="player-list">
          <h3><Users size={24} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Players ({players.length})</h3>
          {players.length === 0 && <p className="text-center text-muted">Waiting for players to join...</p>}
          {players.map((player) => (
            <div key={player.id} className="player">
              <Users size={20} />
              {player.name}
            </div>
          ))}
        </div>

        <button onClick={handleStartGame} disabled={players.length === 0}>
          <Play size={20} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
          Start Game
        </button>

        <button onClick={handleDisbandLobby} className="btn-danger">
          <X size={20} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
          Disband Lobby
        </button>
      </div>
    );
  }

  // HOST MODE SELECTION VIEW
  if (view === 'host_mode_select') {
    return renderWithNotifications(
      <div className="container">
        <h1><Target size={40} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '12px' }} />Select Game Mode</h1>

        <div className="game-modes">
          <div className="mode-card" onClick={() => handleSelectGameMode('ffa')}>
            <h2><Zap size={28} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Free For All</h2>
            <p>Every player for themselves! Answer fast to earn more points.</p>
          </div>

          <div className="mode-card disabled">
            <h2><Shield size={28} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Teams</h2>
            <p>Team up and compete together! (Coming Soon)</p>
          </div>

          <div className="mode-card disabled">
            <h2><Trophy size={28} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Survival</h2>
            <p>Last player standing wins! (Coming Soon)</p>
          </div>
        </div>
      </div>
    );
  }

  // HOST QUESTION VIEW (TV)
  if (view === 'host_question') {
    return renderWithNotifications(
      <div className="host-fullscreen">
        <button onClick={handleDisbandLobby} className="floating-button btn-danger">
          <Settings size={24} />
        </button>

        <div className="content-wrapper">
          <div className="question-header">
            <div className="question-counter">
              <Target size={24} />
              Question {questionIndex + 1}/{totalQuestions}
            </div>
            <div className={`timer-display ${timeRemaining <= 5 ? 'urgent' : ''}`}>
              <Clock size={48} />
              {timeRemaining}s
            </div>
          </div>

          <div className="question-card">
            <div className="question-text">{currentQuestion}</div>

            <div>
              {currentAnswers.map((answer, idx) => (
                <div key={idx} className="answer-option">
                  <div className="answer-label">
                    <div className="answer-letter">{String.fromCharCode(65 + idx)}</div>
                    <span>{answer}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-muted" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '18px', marginTop: '32px' }}>
            Players are answering...
          </p>
        </div>
      </div>
    );
  }

  // HOST REVEAL VIEW (TV)
  if (view === 'host_reveal') {
    return renderWithNotifications(
      <div className="host-fullscreen">
        <button onClick={handleDisbandLobby} className="floating-button btn-danger">
          <Settings size={24} />
        </button>

        <div className="content-wrapper">
          <div className="question-header">
            <div className="question-counter">
              <Check size={24} />
              Question {questionIndex + 1}/{totalQuestions} - Results
            </div>
          </div>

          <div className="question-card">
            <div className="question-text" style={{ fontSize: '28px', marginBottom: '32px' }}>{currentQuestion}</div>

            {currentAnswers && answerStats.map((stat, idx) => (
              <div
                key={idx}
                className={`answer-option ${idx === correctAnswer ? 'correct' : 'incorrect'}`}
              >
                <div className="answer-label">
                  <div className="answer-letter">{String.fromCharCode(65 + idx)}</div>
                  <span>{currentAnswers[idx]}</span>
                </div>
                <div className="player-badges">
                  {stat.players.map((player, pIdx) => (
                    <div
                      key={pIdx}
                      className={`player-badge ${idx === correctAnswer ? 'correct-answer' : ''}`}
                    >
                      {player.initial}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // HOST RESULTS VIEW
  if (view === 'host_results') {
    const playAgain = () => {
      setView('host_mode_select');
      // Reset game state
      setCurrentQuestion(null);
      setCurrentAnswers([]);
      setQuestionIndex(0);
      setTotalQuestions(0);
      setSelectedAnswer(null);
      setCorrectAnswer(null);
      setAnswerStats([]);
      setPointsEarned(0);
      setFinalScores([]);
      setWinner(null);
    };

    return renderWithNotifications(
      <div className="host-fullscreen">
        <div className="content-wrapper">
          <div style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(10px)',
            borderRadius: '20px',
            padding: '20px 40px',
            marginBottom: '24px',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
          }}>
            <h1 style={{
              color: 'white',
              textAlign: 'center',
              margin: '0',
              fontSize: '56px',
              fontWeight: '900',
              letterSpacing: '-1px',
              background: 'none',
              WebkitBackgroundClip: 'unset',
              WebkitTextFillColor: 'white',
              backgroundClip: 'unset'
            }}>
              <Trophy size={56} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '12px' }} />
              Final Results!
            </h1>
          </div>

          <div className="host-results-grid">
            {winner && (
              <div className="winner-showcase">
                <Crown size={100} style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' }} />
                <h2 style={{ textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{winner.name}</h2>
                <div className="points" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{winner.score} pts</div>
                <p style={{ fontSize: '20px', opacity: 1, marginTop: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '2px' }}>Champion!</p>
              </div>
            )}

            <div className="leaderboard-container">
              <h3 style={{ fontSize: '22px', fontWeight: '700' }}>
                <Trophy size={24} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
                Full Leaderboard
              </h3>
              <div className="leaderboard" style={{ maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
                {finalScores.map((player, idx) => (
                  <div
                    key={idx}
                    className={`leaderboard-item ${idx === 0 ? 'winner' : ''}`}
                  >
                    <div className="leaderboard-rank">
                      {idx === 0 && <Crown size={20} />}
                      #{idx + 1} {player.name}
                    </div>
                    <div className="leaderboard-score">{player.score} pts</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '24px', flexWrap: 'wrap' }}>
            <button onClick={playAgain} className="btn-success" style={{ maxWidth: '250px', minWidth: '200px', margin: '0' }}>
              <Play size={20} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
              Play Again
            </button>
            <button onClick={returnToLobby} className="btn-secondary" style={{ maxWidth: '250px', minWidth: '200px', margin: '0' }}>
              <Users size={20} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PLAYER LOBBY VIEW
  if (view === 'player') {
    return renderWithNotifications(
      <div className="container">
        <h1><Users size={40} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '12px' }} />Waiting Room</h1>

        <div className="text-center" style={{ margin: '32px 0' }}>
          <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#6366f1', marginBottom: '8px' }}>
            {displayName}
          </p>
          <p className="text-muted">Lobby: <strong style={{ color: '#6366f1' }}>{lobbyCode}</strong></p>
        </div>

        <div className="player-list">
          <h3><Users size={24} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Players ({players.length})</h3>
          {players.map((player) => (
            <div
              key={player.id}
              className={`player ${player.id === playerId ? 'current-player' : ''}`}
            >
              <Users size={20} />
              {player.name} {player.id === playerId && '(You)'}
            </div>
          ))}
        </div>

        <div className="loading-spinner" style={{ padding: '30px 0' }}>
          <Loader2 size={40} className="spinner-icon" style={{ color: '#6366f1' }} />
        </div>
        <p className="text-center text-muted">
          Waiting for host to start the game...
        </p>

        <button onClick={handleLeaveLobby} className="btn-danger">
          <X size={20} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
          Leave Lobby
        </button>
      </div>
    );
  }

  // PLAYER WAITING VIEW (Host selecting mode)
  if (view === 'player_waiting') {
    return renderWithNotifications(
      <div className="container">
        <div className="text-center" style={{ padding: '60px 0' }}>
          <div className="loading-spinner">
            <Gamepad2 size={80} className="spinner-icon" style={{ color: '#6366f1' }} />
          </div>
          <h2 style={{ fontSize: '32px', marginTop: '32px' }}>Host is selecting a game mode...</h2>
          <p className="text-muted" style={{ fontSize: '18px', marginTop: '16px' }}>Get ready!</p>
        </div>
      </div>
    );
  }

  // PLAYER QUESTION VIEW (Phone)
  if (view === 'player_question') {
    return renderWithNotifications(
      <div className="container no-scroll">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '14px' }}>
            <Users size={18} style={{ color: '#6366f1' }} />
            {displayName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', color: '#6366f1', fontSize: '14px' }}>
              <Trophy size={18} />
              {myScore}
            </div>
            <button
              onClick={handleLeaveLobby}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.2s',
                width: 'auto',
                margin: 0
              }}
              onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              <X size={20} />
            </button>
          </div>
        </div>

          <div className="text-center" style={{ margin: '20px 0' }}>
            <div className={`timer-display ${timeRemaining <= 5 ? 'urgent' : ''}`} style={{ fontSize: '48px', justifyContent: 'center' }}>
              <Clock size={40} />
              {timeRemaining}s
            </div>
            <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
              Question {questionIndex + 1}/{totalQuestions}
            </p>
          </div>

          <h3 className="text-center" style={{ margin: '20px 0', fontSize: '18px', lineHeight: '1.3', flex: '0 0 auto' }}>
            {currentQuestion}
          </h3>

          <div className="answer-buttons" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {currentAnswers.map((answer, idx) => (
              <button
                key={idx}
                onClick={() => handleSubmitAnswer(idx)}
                disabled={selectedAnswer !== null}
                className={selectedAnswer === idx ? 'selected' : ''}
              >
                <div className="answer-letter">{String.fromCharCode(65 + idx)}</div>
                <span>{answer}</span>
              </button>
            ))}
          </div>

          {selectedAnswer !== null && (
            <p className="text-center" style={{ color: '#10b981', marginTop: '16px', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flex: '0 0 auto' }}>
              <Check size={20} />
              Answer locked in!
            </p>
          )}
        </div>
    );
  }

  // PLAYER REVEAL VIEW (Phone)
  if (view === 'player_reveal') {
    const wasCorrect = selectedAnswer === correctAnswer;
    return renderWithNotifications(
      <div className="container no-scroll">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '14px' }}>
            <Users size={18} style={{ color: '#6366f1' }} />
            {displayName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', color: '#6366f1', fontSize: '14px' }}>
              <Trophy size={18} />
              {myScore}
            </div>
            <button
              onClick={handleLeaveLobby}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.2s',
                width: 'auto',
                margin: 0
              }}
              onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              <X size={20} />
            </button>
          </div>
        </div>

          <div className="text-center" style={{ flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            {wasCorrect ? (
              <>
                <div className="result-icon" style={{ margin: '0' }}>
                  <Check size={100} style={{ color: '#10b981' }} />
                </div>
                <h2 className="result-message correct" style={{ margin: '16px 0' }}>Correct!</h2>
                <p className="points-earned" style={{ margin: '8px 0' }}>+{pointsEarned} pts</p>
              </>
            ) : (
              <>
                <div className="result-icon" style={{ margin: '0' }}>
                  <X size={100} style={{ color: '#ef4444' }} />
                </div>
                <h2 className="result-message incorrect" style={{ margin: '16px 0' }}>Wrong</h2>
                <p className="text-muted" style={{ fontSize: '16px' }}>Better luck next time!</p>
              </>
            )}
          </div>

          <div style={{ flex: '0 0 auto' }}>
            <div className="loading-spinner" style={{ padding: '12px 0' }}>
              <Loader2 size={28} className="spinner-icon" style={{ color: '#6366f1' }} />
            </div>
            <p className="text-center text-muted" style={{ fontSize: '14px' }}>Next question coming up...</p>
          </div>
        </div>
    );
  }

  // PLAYER RESULTS VIEW
  if (view === 'player_results') {
    const myRank = finalScores.findIndex(p => p.session_id === playerId) + 1;
    const isWinner = myRank === 1;

    return renderWithNotifications(
      <div className="container">
        <div style={{ flex: '0 0 auto' }}>
          {isWinner ? (
            <div className="text-center">
              <div className="result-icon" style={{ margin: '20px 0 12px' }}>
                <Crown size={80} style={{ color: '#fbbf24' }} />
              </div>
              <h1 style={{ fontSize: '36px', color: '#fbbf24', fontWeight: '900', margin: '12px 0' }}>You Won!</h1>
            </div>
          ) : (
            <div className="text-center">
              <div className="result-icon" style={{ margin: '20px 0 12px' }}>
                <Trophy size={80} style={{ color: '#6366f1' }} />
              </div>
              <h1 style={{ fontSize: '32px', margin: '12px 0' }}>Game Over!</h1>
            </div>
          )}

          <div className="text-center" style={{ margin: '20px 0' }}>
            <p className="text-muted" style={{ fontSize: '16px' }}>You placed <strong style={{ color: '#6366f1' }}>#{myRank}</strong></p>
            <p className="points-earned" style={{ fontSize: '36px', margin: '8px 0' }}>{myScore} pts</p>
          </div>
        </div>

        <div className="leaderboard" style={{ flex: '1 1 auto', marginBottom: '16px' }}>
          {finalScores.map((player, idx) => (
            <div
              key={idx}
              className={`leaderboard-item ${player.session_id === playerId ? 'current-player' : ''} ${idx === 0 ? 'winner' : ''}`}
            >
              <div className="leaderboard-rank">
                {idx === 0 && <Crown size={18} />}
                #{idx + 1} {player.name}
              </div>
              <div className="leaderboard-score">{player.score} pts</div>
            </div>
          ))}
        </div>

        <button onClick={returnToLobby} className="btn-secondary" style={{ flex: '0 0 auto' }}>
          <Users size={18} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
          Return to Lobby
        </button>
      </div>
    );
  }

  return null;
}

export default App;
