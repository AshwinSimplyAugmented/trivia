import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

// In dev, connect to backend on port 5000. In production, same origin.
const isDev = window.location.hostname === 'localhost' && window.location.port === '3000';
const socket = io(isDev ? 'http://localhost:5000' : undefined);

// Helper to generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Get or create session ID
function getSessionId() {
  let sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = generateUUID();
    localStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
}

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

  const timerRef = useRef(null);
  const selectedAnswerRef = useRef(null);

  // Reconnection logic on mount
  useEffect(() => {
    const attemptReconnect = async () => {
      const storedLobbyCode = localStorage.getItem('lobbyCode');
      const storedSessionId = localStorage.getItem('sessionId');

      if (storedLobbyCode && storedSessionId) {
        try {
          const apiUrl = isDev ? 'http://localhost:5000/api/reconnect' : '/api/reconnect';
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: storedSessionId,
              lobbyCode: storedLobbyCode
            })
          });

          const data = await response.json();

          if (data.success) {
            setLobbyCode(data.lobbyCode);
            setPlayers(data.players || []);

            if (data.role === 'host') {
              setView('host');
              socket.emit('rejoin_host', {
                code: data.lobbyCode,
                sessionId: storedSessionId
              });
            } else if (data.role === 'player') {
              setView('player');
              setDisplayName(data.displayName);
              setPlayerId(storedSessionId);
              socket.emit('join_lobby', {
                code: data.lobbyCode,
                name: data.displayName,
                sessionId: storedSessionId
              });
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

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('lobby_created', (data) => {
      setLobbyCode(data.code);
      setView('host');
      localStorage.setItem('lobbyCode', data.code);
      localStorage.setItem('role', 'host');
      if (data.sessionId) {
        localStorage.setItem('sessionId', data.sessionId);
        setSessionId(data.sessionId);
      }
    });

    socket.on('lobby_joined', (data) => {
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
    });

    socket.on('players_updated', (data) => {
      setPlayers(data.players);
      // Update my score if I'm a player
      const me = data.players.find(p => p.id === playerId);
      if (me) {
        setMyScore(me.score);
      }
    });

    socket.on('mode_selection_started', () => {
      const role = localStorage.getItem('role');
      if (role === 'host') {
        setView('host_mode_select');
      } else {
        setView('player_waiting');
      }
    });

    socket.on('game_mode_selected', (data) => {
      console.log('Game mode selected:', data.mode_name);
    });

    socket.on('question_started', (data) => {
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
    });

    socket.on('answer_submitted', (data) => {
      setSelectedAnswer(data.answer_index);
      selectedAnswerRef.current = data.answer_index;
      console.log('Answer submitted, index:', data.answer_index);
    });

    socket.on('question_ended', (data) => {
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
    });

    socket.on('game_ended', (data) => {
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
    });

    socket.on('error', (data) => {
      setError(data.message);
    });

    socket.on('lobby_left', () => {
      localStorage.removeItem('lobbyCode');
      localStorage.removeItem('role');
      localStorage.removeItem('displayName');
      setView('home');
      setLobbyCode('');
      setPlayers([]);
      setDisplayName('');
      setPlayerId('');
    });

    socket.on('lobby_disbanded', (data) => {
      alert(data.message);
      localStorage.removeItem('lobbyCode');
      localStorage.removeItem('role');
      localStorage.removeItem('displayName');
      setView('home');
      setLobbyCode('');
      setPlayers([]);
      setDisplayName('');
      setPlayerId('');
    });

    return () => {
      socket.off('connect');
      socket.off('lobby_created');
      socket.off('lobby_joined');
      socket.off('players_updated');
      socket.off('mode_selection_started');
      socket.off('game_mode_selected');
      socket.off('question_started');
      socket.off('answer_submitted');
      socket.off('question_ended');
      socket.off('game_ended');
      socket.off('error');
      socket.off('lobby_left');
      socket.off('lobby_disbanded');
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

  const createLobby = () => {
    socket.emit('create_lobby', { sessionId });
  };

  const joinLobby = () => {
    if (!joinCode || !displayName) {
      setError('Please enter lobby code and name');
      return;
    }
    socket.emit('join_lobby', { code: joinCode, name: displayName, sessionId });
  };

  const startGame = () => {
    socket.emit('start_game', { code: lobbyCode });
  };

  const selectGameMode = (mode) => {
    socket.emit('select_game_mode', { code: lobbyCode, mode });
  };

  const submitAnswer = (answerIndex) => {
    if (selectedAnswer !== null) return; // Already answered
    socket.emit('submit_answer', { question_index: questionIndex, answer_index: answerIndex });
  };

  const leaveLobby = () => {
    socket.emit('leave_lobby', {});
  };

  const disbandLobby = () => {
    if (window.confirm('Are you sure you want to disband this lobby? All players will be kicked out.')) {
      socket.emit('disband_lobby', { code: lobbyCode });
      localStorage.removeItem('lobbyCode');
      localStorage.removeItem('role');
      localStorage.removeItem('displayName');
      setView('home');
      setLobbyCode('');
      setPlayers([]);
    }
  };

  const returnToLobby = () => {
    const role = localStorage.getItem('role');
    if (role === 'host') {
      setView('host');
    } else {
      setView('player');
    }
  };

  // LOADING VIEW
  if (isReconnecting) {
    return (
      <div className="container">
        <h1>🎮 Trivia Party</h1>
        <p style={{ textAlign: 'center', color: '#999' }}>Reconnecting...</p>
      </div>
    );
  }

  // HOME VIEW
  if (view === 'home') {
    return (
      <div className="container">
        <h1>🎮 Trivia Party</h1>

        <button onClick={createLobby}>Create Lobby (Host)</button>

        <div style={{ margin: '30px 0', textAlign: 'center', color: '#999' }}>OR</div>

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

        <button onClick={joinLobby}>Join Lobby</button>

        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  // HOST LOBBY VIEW
  if (view === 'host') {
    return (
      <div className="container">
        <h1>Host Lobby</h1>

        <div className="lobby-code">
          <p style={{ margin: 0, fontSize: '18px' }}>Lobby Code</p>
          <h2>{lobbyCode}</h2>
        </div>

        <div className="player-list">
          <h3>Players ({players.length})</h3>
          {players.length === 0 && <p style={{ color: '#999' }}>Waiting for players...</p>}
          {players.map((player) => (
            <div key={player.id} className="player">
              {player.name}
            </div>
          ))}
        </div>

        <button onClick={startGame} disabled={players.length === 0}>
          Start Game
        </button>

        <button
          onClick={disbandLobby}
          style={{
            marginTop: '10px',
            background: '#dc3545',
            color: 'white'
          }}
        >
          Disband Lobby
        </button>
      </div>
    );
  }

  // HOST MODE SELECTION VIEW
  if (view === 'host_mode_select') {
    return (
      <div className="container">
        <h1>Select Game Mode</h1>

        <div className="game-modes">
          <div className="mode-card" onClick={() => selectGameMode('ffa')}>
            <h2>⚡ Free For All</h2>
            <p>Every player for themselves! Answer fast to earn more points.</p>
          </div>

          <div className="mode-card disabled">
            <h2>🤝 Teams (Coming Soon)</h2>
            <p>Team up and compete together!</p>
          </div>

          <div className="mode-card disabled">
            <h2>🏆 Survival (Coming Soon)</h2>
            <p>Last player standing wins!</p>
          </div>
        </div>
      </div>
    );
  }

  // HOST QUESTION VIEW (TV)
  if (view === 'host_question') {
    return (
      <>
        <button
          onClick={disbandLobby}
          className="floating-button"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#dc3545',
            color: 'white',
            padding: '12px 20px',
            fontSize: '14px',
            borderRadius: '50px',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1000
          }}
        >
          ⚙️ End Game
        </button>
        <div className="container host-view">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>Question {questionIndex + 1}/{totalQuestions}</h2>
            <div className="timer" style={{ fontSize: '32px', fontWeight: 'bold', color: timeRemaining <= 5 ? '#dc3545' : '#667eea' }}>
              {timeRemaining}s
            </div>
          </div>

        <div className="question-card">
          <h1 style={{ fontSize: '36px', marginBottom: '40px' }}>{currentQuestion}</h1>

          <div style={{ marginTop: '30px' }}>
            {currentAnswers.map((answer, idx) => (
              <div
                key={idx}
                style={{
                  background: '#f0f0f0',
                  padding: '15px',
                  margin: '10px 0',
                  borderRadius: '8px',
                  fontSize: '20px'
                }}
              >
                <span style={{ fontWeight: 'bold', color: '#667eea' }}>{String.fromCharCode(65 + idx)}.</span> {answer}
              </div>
            ))}
          </div>
        </div>

        <p style={{ textAlign: 'center', color: '#999', marginTop: '20px' }}>
          Players are answering...
        </p>
      </div>
      </>
    );
  }

  // HOST REVEAL VIEW (TV)
  if (view === 'host_reveal') {
    return (
      <>
        <button
          onClick={disbandLobby}
          className="floating-button"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#dc3545',
            color: 'white',
            padding: '12px 20px',
            fontSize: '14px',
            borderRadius: '50px',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1000
          }}
        >
          ⚙️ End Game
        </button>
        <div className="container host-view">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>Question {questionIndex + 1}/{totalQuestions} - Results</h2>
          </div>

          <div className="question-card">
            <h2 style={{ marginBottom: '30px' }}>{currentQuestion}</h2>

            {currentAnswers && answerStats.map((stat, idx) => (
              <div
                key={idx}
                className="answer-option"
                style={{
                  background: idx === correctAnswer ? '#28a745' : '#f0f0f0',
                  color: idx === correctAnswer ? 'white' : '#333',
                  padding: '15px',
                  margin: '10px 0',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + idx)}. {currentAnswers[idx]}</span>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {stat.players.map((player, pIdx) => (
                    <div
                      key={pIdx}
                      className="player-badge"
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: idx === correctAnswer ? '#fff' : '#667eea',
                        color: idx === correctAnswer ? '#28a745' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px'
                      }}
                    >
                      {player.initial}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // HOST RESULTS VIEW
  if (view === 'host_results') {
    return (
      <div className="container">
        <h1>🏆 Final Results!</h1>

        {winner && (
          <div style={{ textAlign: 'center', margin: '30px 0' }}>
            <h2 style={{ color: '#ffd700', fontSize: '48px' }}>Winner: {winner.name}</h2>
            <p style={{ fontSize: '24px' }}>{winner.score} points</p>
          </div>
        )}

        <div className="leaderboard">
          {finalScores.map((player, idx) => (
            <div
              key={idx}
              className="leaderboard-item"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '15px',
                margin: '10px 0',
                background: idx === 0 ? '#ffd700' : '#f0f0f0',
                borderRadius: '8px',
                fontWeight: idx === 0 ? 'bold' : 'normal'
              }}
            >
              <span>#{idx + 1} {player.name}</span>
              <span>{player.score} pts</span>
            </div>
          ))}
        </div>

        <button onClick={returnToLobby} style={{ marginTop: '20px' }}>Return to Lobby</button>
      </div>
    );
  }

  // PLAYER LOBBY VIEW
  if (view === 'player') {
    return (
      <div className="container">
        <h1>Waiting Room</h1>

        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>
            {displayName}
          </p>
          <p style={{ color: '#999' }}>Lobby: {lobbyCode}</p>
        </div>

        <div className="player-list">
          <h3>Players ({players.length})</h3>
          {players.map((player) => (
            <div
              key={player.id}
              className="player"
              style={player.id === playerId ? { background: '#667eea', color: 'white' } : {}}
            >
              {player.name} {player.id === playerId && '(You)'}
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', color: '#999', marginTop: '20px' }}>
          Waiting for host to start...
        </p>

        <button
          onClick={leaveLobby}
          style={{
            marginTop: '10px',
            background: '#dc3545',
            color: 'white'
          }}
        >
          Leave Lobby
        </button>
      </div>
    );
  }

  // PLAYER WAITING VIEW (Host selecting mode)
  if (view === 'player_waiting') {
    return (
      <div className="container">
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <div className="loading-spinner" style={{ fontSize: '64px', marginBottom: '20px' }}>
            🎮
          </div>
          <h2>Host is selecting a game...</h2>
          <p style={{ color: '#999' }}>Get ready!</p>
        </div>
      </div>
    );
  }

  // PLAYER QUESTION VIEW (Phone)
  if (view === 'player_question') {
    return (
      <>
        <button
          onClick={leaveLobby}
          className="floating-button"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#dc3545',
            color: 'white',
            width: '40px',
            height: '40px',
            fontSize: '20px',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0
          }}
        >
          ✕
        </button>
        <div className="container player-view">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: 'bold' }}>{displayName}</span>
            <span style={{ fontWeight: 'bold', color: '#667eea' }}>🏆 {myScore}</span>
          </div>

          <div style={{ textAlign: 'center', margin: '20px 0' }}>
            <div className="timer" style={{ fontSize: '48px', fontWeight: 'bold', color: timeRemaining <= 5 ? '#dc3545' : '#667eea' }}>
              {timeRemaining}s
            </div>
            <p style={{ fontSize: '12px', color: '#999' }}>Question {questionIndex + 1}/{totalQuestions}</p>
          </div>

          <h3 style={{ textAlign: 'center', margin: '20px 0' }}>{currentQuestion}</h3>

          <div className="answer-buttons">
            {currentAnswers.map((answer, idx) => (
              <button
                key={idx}
                onClick={() => submitAnswer(idx)}
                disabled={selectedAnswer !== null}
                style={{
                  padding: '20px',
                  margin: '10px 0',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  background: selectedAnswer === idx ? '#667eea' : '#f0f0f0',
                  color: selectedAnswer === idx ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: selectedAnswer !== null ? 'not-allowed' : 'pointer',
                  opacity: selectedAnswer !== null && selectedAnswer !== idx ? 0.5 : 1,
                  textAlign: 'left'
                }}
              >
                <span style={{ color: selectedAnswer === idx ? 'white' : '#667eea', marginRight: '10px' }}>
                  {String.fromCharCode(65 + idx)}.
                </span>
                {answer}
              </button>
            ))}
          </div>

          {selectedAnswer !== null && (
            <p style={{ textAlign: 'center', color: '#667eea', marginTop: '20px' }}>
              Answer locked in! ✓
            </p>
          )}
        </div>
      </>
    );
  }

  // PLAYER REVEAL VIEW (Phone)
  if (view === 'player_reveal') {
    const wasCorrect = selectedAnswer === correctAnswer;
    return (
      <>
        <button
          onClick={leaveLobby}
          className="floating-button"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#dc3545',
            color: 'white',
            width: '40px',
            height: '40px',
            fontSize: '20px',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0
          }}
        >
          ✕
        </button>
        <div className="container player-view">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: 'bold' }}>{displayName}</span>
            <span style={{ fontWeight: 'bold', color: '#667eea' }}>🏆 {myScore}</span>
          </div>

          <div style={{ textAlign: 'center', margin: '40px 0' }}>
            {wasCorrect ? (
              <>
                <div style={{ fontSize: '64px', marginBottom: '10px' }}>✅</div>
                <h2 style={{ color: '#28a745' }}>Correct!</h2>
                <p style={{ fontSize: '36px', fontWeight: 'bold', color: '#667eea' }}>
                  +{pointsEarned} points
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '64px', marginBottom: '10px' }}>❌</div>
                <h2 style={{ color: '#dc3545' }}>Wrong</h2>
                <p style={{ color: '#999' }}>Better luck next time!</p>
              </>
            )}
          </div>

          <p style={{ textAlign: 'center', color: '#999' }}>Next question coming up...</p>
        </div>
      </>
    );
  }

  // PLAYER RESULTS VIEW
  if (view === 'player_results') {
    const myRank = finalScores.findIndex(p => p.session_id === playerId) + 1;
    const isWinner = myRank === 1;

    return (
      <div className="container">
        {isWinner ? (
          <>
            <h1 style={{ fontSize: '64px', textAlign: 'center' }}>🏆</h1>
            <h2 style={{ textAlign: 'center', color: '#ffd700' }}>You Won!</h2>
          </>
        ) : (
          <h1 style={{ textAlign: 'center' }}>Game Over!</h1>
        )}

        <div style={{ textAlign: 'center', margin: '30px 0' }}>
          <p style={{ fontSize: '18px', color: '#999' }}>You placed #{myRank}</p>
          <p style={{ fontSize: '36px', fontWeight: 'bold', color: '#667eea' }}>{myScore} points</p>
        </div>

        <div className="leaderboard">
          {finalScores.map((player, idx) => (
            <div
              key={idx}
              className="leaderboard-item"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '15px',
                margin: '10px 0',
                background: player.session_id === playerId ? '#667eea' : '#f0f0f0',
                color: player.session_id === playerId ? 'white' : '#333',
                borderRadius: '8px',
                fontWeight: idx === 0 ? 'bold' : 'normal'
              }}
            >
              <span>#{idx + 1} {player.name}</span>
              <span>{player.score} pts</span>
            </div>
          ))}
        </div>

        <button onClick={returnToLobby} style={{ marginTop: '20px' }}>Return to Lobby</button>
      </div>
    );
  }

  return null;
}

export default App;
