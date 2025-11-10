import io from 'socket.io-client';

// Determine if we're in development mode
const isDev = window.location.hostname === 'localhost' && window.location.port === '3000';

// Create socket connection
export const socket = io(isDev ? 'http://localhost:5000' : undefined);

/**
 * Initialize socket event listeners
 * @param {Object} handlers - Object containing all event handler functions
 */
export function initializeSocketListeners(handlers) {
  const {
    onConnect,
    onLobbyCreated,
    onLobbyJoined,
    onPlayersUpdated,
    onModeSelectionStarted,
    onGameModeSelected,
    onQuestionStarted,
    onTimerStart,
    onAnswerSubmitted,
    onQuestionEnded,
    onGameEnded,
    onError,
    onLobbyLeft,
    onLobbyDisbanded
  } = handlers;

  // Connection event
  socket.on('connect', () => {
    console.log('Connected to server');
    if (onConnect) onConnect();
  });

  // Lobby created (host)
  socket.on('lobby_created', (data) => {
    if (onLobbyCreated) onLobbyCreated(data);
  });

  // Lobby joined (player)
  socket.on('lobby_joined', (data) => {
    if (onLobbyJoined) onLobbyJoined(data);
  });

  // Players list updated
  socket.on('players_updated', (data) => {
    if (onPlayersUpdated) onPlayersUpdated(data);
  });

  // Game mode selection started
  socket.on('mode_selection_started', () => {
    if (onModeSelectionStarted) onModeSelectionStarted();
  });

  // Game mode selected
  socket.on('game_mode_selected', (data) => {
    if (onGameModeSelected) onGameModeSelected(data);
  });

  // Question started
  socket.on('question_started', (data) => {
    if (onQuestionStarted) onQuestionStarted(data);
  });

  // Timer start (after audio completes)
  socket.on('timer_start', (data) => {
    if (onTimerStart) onTimerStart(data);
  });

  // Answer submitted confirmation
  socket.on('answer_submitted', (data) => {
    if (onAnswerSubmitted) onAnswerSubmitted(data);
  });

  // Question ended (reveal)
  socket.on('question_ended', (data) => {
    if (onQuestionEnded) onQuestionEnded(data);
  });

  // Game ended (final results)
  socket.on('game_ended', (data) => {
    if (onGameEnded) onGameEnded(data);
  });

  // Error event
  socket.on('error', (data) => {
    if (onError) onError(data);
  });

  // Lobby left
  socket.on('lobby_left', () => {
    if (onLobbyLeft) onLobbyLeft();
  });

  // Lobby disbanded by host
  socket.on('lobby_disbanded', (data) => {
    if (onLobbyDisbanded) onLobbyDisbanded(data);
  });
}

/**
 * Clean up all socket event listeners
 */
export function cleanupSocketListeners() {
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
}

/**
 * Emit create lobby event
 * @param {string} sessionId - The session ID
 */
export function createLobby(sessionId) {
  socket.emit('create_lobby', { sessionId });
}

/**
 * Emit rejoin host event
 * @param {string} code - The lobby code
 * @param {string} sessionId - The session ID
 */
export function rejoinHost(code, sessionId) {
  socket.emit('rejoin_host', { code, sessionId });
}

/**
 * Emit join lobby event
 * @param {string} code - The lobby code
 * @param {string} name - The player name
 * @param {string} sessionId - The session ID
 */
export function joinLobby(code, name, sessionId) {
  socket.emit('join_lobby', { code, name, sessionId });
}

/**
 * Emit start game event
 * @param {string} code - The lobby code
 */
export function startGame(code) {
  socket.emit('start_game', { code });
}

/**
 * Emit select game mode event
 * @param {string} code - The lobby code
 * @param {string} mode - The game mode
 */
export function selectGameMode(code, mode) {
  socket.emit('select_game_mode', { code, mode });
}

/**
 * Emit submit answer event
 * @param {number} questionIndex - The question index
 * @param {number} answerIndex - The answer index
 */
export function submitAnswer(questionIndex, answerIndex) {
  socket.emit('submit_answer', { question_index: questionIndex, answer_index: answerIndex });
}

/**
 * Emit leave lobby event
 */
export function leaveLobby() {
  socket.emit('leave_lobby', {});
}

/**
 * Emit disband lobby event
 * @param {string} code - The lobby code
 */
export function disbandLobby(code) {
  socket.emit('disband_lobby', { code });
}

/**
 * Emit audio finished event (host only)
 * @param {number} questionIndex - The question index
 */
export function notifyAudioFinished(questionIndex) {
  socket.emit('audio_finished', { question_index: questionIndex });
}

/**
 * HTTP API: Attempt to reconnect to a lobby
 * @param {string} sessionId - The session ID
 * @param {string} lobbyCode - The lobby code
 * @returns {Promise<Object>} The reconnection response
 */
export async function reconnectToLobby(sessionId, lobbyCode) {
  const apiUrl = isDev ? 'http://localhost:5000/api/reconnect' : '/api/reconnect';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, lobbyCode })
  });

  return await response.json();
}
