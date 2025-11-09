/**
 * Audio Configuration
 * Defines all audio assets and their settings for the trivia game
 */

export const AUDIO_CONFIG = {
  // Background Music Tracks
  bgm: {
    lobby: {
      src: ['/music/host-lobby-music.mp3'],
      loop: true,
      volume: 0.4, // BGM should be quieter than SFX
    },
    gameplay: {
      src: ['/music/game-music-1.mp3'],
      loop: true,
      volume: 0.4,
    },
  },

  // Sound Effects
  sfx: {
    // Add sound effects here when you have them
    // Example:
    // buttonClick: {
    //   src: ['/music/sfx/button-click.mp3'],
    //   volume: 0.8,
    // },
    // correct: {
    //   src: ['/music/sfx/correct.mp3'],
    //   volume: 0.8,
    // },
  },
};

// Audio Settings
export const AUDIO_SETTINGS = {
  // Cross-fade duration in milliseconds
  crossFadeDuration: 2000,

  // Default volumes (0.0 - 1.0)
  defaultBGMVolume: 0.4,
  defaultSFXVolume: 0.8,
  defaultMasterVolume: 1.0,

  // Fade settings
  fadeOutDuration: 1000,
  fadeInDuration: 1000,
};
