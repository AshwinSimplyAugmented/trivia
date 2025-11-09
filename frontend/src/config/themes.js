/**
 * Theme Configuration
 * Defines all available themes with colors, music, and assets
 */

export const THEMES = {
  standard: {
    id: 'standard',
    name: 'Standard',
    colors: {
      // Primary colors
      primary: '#6366f1',
      primaryDark: '#4f46e5',
      primaryLight: '#818cf8',

      // Secondary colors
      secondary: '#8b5cf6',
      secondaryDark: '#7c3aed',
      secondaryLight: '#a78bfa',

      // Status colors
      success: '#10b981',
      successDark: '#059669',
      danger: '#ef4444',
      dangerDark: '#dc2626',
      warning: '#f59e0b',
      warningDark: '#d97706',

      // Backgrounds
      gradientMain: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      gradientCard: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1))',
      background: '#0f172a',
      surface: 'rgba(255, 255, 255, 0.1)',

      // Text colors
      textPrimary: '#ffffff',
      textSecondary: 'rgba(255, 255, 255, 0.7)',
      textMuted: 'rgba(255, 255, 255, 0.5)',
    },
    music: {
      lobby: '/themes/standard/music/host-lobby-music.mp3',
      gameplay: '/themes/standard/music/game-music-1.mp3',
    },
    images: {
      backgroundPattern: null, // optional background pattern overlay
      logo: null, // optional custom logo
    },
  },

  christmas: {
    id: 'christmas',
    name: 'Christmas',
    colors: {
      primary: '#dc2626',        // Christmas red
      primaryDark: '#b91c1c',
      primaryLight: '#f87171',

      secondary: '#059669',      // Christmas green
      secondaryDark: '#047857',
      secondaryLight: '#34d399',

      success: '#10b981',
      successDark: '#059669',
      danger: '#dc2626',
      dangerDark: '#b91c1c',
      warning: '#f59e0b',
      warningDark: '#d97706',

      gradientMain: 'linear-gradient(135deg, #c31432 0%, #240b36 100%)',
      gradientCard: 'linear-gradient(135deg, rgba(195, 20, 50, 0.1), rgba(36, 11, 54, 0.1))',
      background: '#0a1628',
      surface: 'rgba(220, 38, 38, 0.1)',

      textPrimary: '#ffffff',
      textSecondary: 'rgba(255, 255, 255, 0.8)',
      textMuted: 'rgba(255, 255, 255, 0.6)',
    },
    music: {
      lobby: '/themes/christmas/music/lobby.mp3',
      gameplay: '/themes/christmas/music/gameplay.mp3',
    },
    images: {
      backgroundPattern: '/themes/christmas/images/snowflakes.png',
      logo: null,
    },
  },

  halloween: {
    id: 'halloween',
    name: 'Halloween',
    colors: {
      primary: '#f97316',        // Pumpkin orange
      primaryDark: '#ea580c',
      primaryLight: '#fb923c',

      secondary: '#8b5cf6',      // Spooky purple
      secondaryDark: '#7c3aed',
      secondaryLight: '#a78bfa',

      success: '#10b981',
      successDark: '#059669',
      danger: '#dc2626',
      dangerDark: '#b91c1c',
      warning: '#f59e0b',
      warningDark: '#d97706',

      gradientMain: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      gradientCard: 'linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(139, 92, 246, 0.1))',
      background: '#0a0a0f',
      surface: 'rgba(249, 115, 22, 0.1)',

      textPrimary: '#ffffff',
      textSecondary: 'rgba(255, 255, 255, 0.8)',
      textMuted: 'rgba(255, 255, 255, 0.6)',
    },
    music: {
      lobby: '/themes/halloween/music/lobby.mp3',
      gameplay: '/themes/halloween/music/gameplay.mp3',
    },
    images: {
      backgroundPattern: '/themes/halloween/images/cobwebs.png',
      logo: null,
    },
  },
};

/**
 * Get theme configuration by ID
 * @param {string} themeId - Theme identifier
 * @returns {object} Theme configuration
 */
export const getTheme = (themeId) => {
  return THEMES[themeId] || THEMES.standard;
};

/**
 * Apply theme colors to CSS variables
 * @param {object} theme - Theme configuration object
 */
export const applyTheme = (theme) => {
  const root = document.documentElement;

  Object.entries(theme.colors).forEach(([key, value]) => {
    const cssVarName = `--color-${toKebabCase(key)}`;
    root.style.setProperty(cssVarName, value);
  });

  console.log(`[Theme] Applied theme: ${theme.name}`);
};

/**
 * Convert camelCase to kebab-case
 * @param {string} str - String in camelCase
 * @returns {string} String in kebab-case
 */
const toKebabCase = (str) => {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
};
