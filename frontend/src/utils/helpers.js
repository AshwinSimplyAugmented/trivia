/**
 * Utility functions for the Trivia application
 */

/**
 * Generate a UUID v4
 * @returns {string} A UUID string
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get or create a session ID from localStorage
 * @returns {string} The session ID
 */
export function getSessionId() {
  let sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = generateUUID();
    localStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
}

/**
 * Set session ID in localStorage
 * @param {string} sessionId - The session ID to store
 */
export function setSessionId(sessionId) {
  localStorage.setItem('sessionId', sessionId);
}

/**
 * Get lobby code from localStorage
 * @returns {string|null} The lobby code or null
 */
export function getLobbyCode() {
  return localStorage.getItem('lobbyCode');
}

/**
 * Set lobby code in localStorage
 * @param {string} code - The lobby code to store
 */
export function setLobbyCode(code) {
  localStorage.setItem('lobbyCode', code);
}

/**
 * Remove lobby code from localStorage
 */
export function clearLobbyCode() {
  localStorage.removeItem('lobbyCode');
}

/**
 * Get user role from localStorage
 * @returns {string|null} The role or null
 */
export function getRole() {
  return localStorage.getItem('role');
}

/**
 * Set user role in localStorage
 * @param {string} role - The role to store (host or player)
 */
export function setRole(role) {
  localStorage.setItem('role', role);
}

/**
 * Get display name from localStorage
 * @returns {string|null} The display name or null
 */
export function getDisplayName() {
  return localStorage.getItem('displayName');
}

/**
 * Set display name in localStorage
 * @param {string} name - The display name to store
 */
export function setDisplayName(name) {
  localStorage.setItem('displayName', name);
}

/**
 * Clear all session data from localStorage
 */
export function clearSession() {
  localStorage.removeItem('lobbyCode');
  localStorage.removeItem('role');
  localStorage.removeItem('displayName');
}
