/**
 * AudioManager - Centralized audio management service
 * Handles background music, sound effects, cross-fading, and volume control
 *
 * Uses Howler.js for robust cross-browser audio support
 */

import { Howl, Howler } from 'howler';
import { AUDIO_CONFIG, AUDIO_SETTINGS } from '../utils/audioConfig';

class AudioManager {
  constructor() {
    // Current background music track
    this.currentBGM = null;
    this.currentBGMName = null;

    // Volume levels (0.0 - 1.0)
    this.bgmVolume = AUDIO_SETTINGS.defaultBGMVolume;
    this.sfxVolume = AUDIO_SETTINGS.defaultSFXVolume;
    this.masterVolume = AUDIO_SETTINGS.defaultMasterVolume;

    // Mute state
    this.isMuted = false;

    // Preloaded sound instances
    this.bgmTracks = {};
    this.sfxSounds = {};

    // Audio unlock state (for mobile browsers)
    this.isUnlocked = false;

    // Active sound effects (for cleanup)
    this.activeSFX = [];
  }

  /**
   * Initialize the audio manager
   * Preloads all audio assets defined in config
   */
  init() {
    console.log('[AudioManager] Initializing...');

    // Preload BGM tracks
    Object.keys(AUDIO_CONFIG.bgm).forEach((trackName) => {
      const config = AUDIO_CONFIG.bgm[trackName];
      this.bgmTracks[trackName] = new Howl({
        src: config.src,
        loop: config.loop,
        volume: 0, // Start at 0, will fade in when played
        preload: true,
        onload: () => {
          console.log(`[AudioManager] BGM "${trackName}" loaded`);
        },
        onloaderror: (id, error) => {
          console.error(`[AudioManager] Error loading BGM "${trackName}":`, error);
        },
      });
    });

    // Preload SFX sounds
    Object.keys(AUDIO_CONFIG.sfx).forEach((soundName) => {
      const config = AUDIO_CONFIG.sfx[soundName];
      this.sfxSounds[soundName] = new Howl({
        src: config.src,
        volume: config.volume * this.sfxVolume * this.masterVolume,
        preload: true,
        onload: () => {
          console.log(`[AudioManager] SFX "${soundName}" loaded`);
        },
        onloaderror: (id, error) => {
          console.error(`[AudioManager] Error loading SFX "${soundName}":`, error);
        },
      });
    });

    console.log('[AudioManager] Initialization complete');
  }

  /**
   * Unlock audio on mobile devices
   * Call this on first user interaction (tap, click, etc.)
   */
  unlockAudio() {
    if (this.isUnlocked) return;

    console.log('[AudioManager] Unlocking audio for mobile...');

    // Resume the Howler audio context
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume();
    }

    this.isUnlocked = true;
    console.log('[AudioManager] Audio unlocked');
  }

  /**
   * Play background music with optional cross-fade
   * @param {string} trackName - Name of the track from AUDIO_CONFIG.bgm
   * @param {number} fadeTime - Cross-fade duration in ms (default from config)
   */
  playBGM(trackName, fadeTime = AUDIO_SETTINGS.crossFadeDuration) {
    // Unlock audio on first play attempt (mobile)
    this.unlockAudio();

    // Don't restart if already playing this track
    if (this.currentBGMName === trackName && this.currentBGM && this.currentBGM.playing()) {
      console.log(`[AudioManager] BGM "${trackName}" already playing`);
      return;
    }

    const newTrack = this.bgmTracks[trackName];
    if (!newTrack) {
      console.error(`[AudioManager] BGM track "${trackName}" not found`);
      return;
    }

    console.log(`[AudioManager] Playing BGM: ${trackName}`);

    // If there's a current track, cross-fade
    if (this.currentBGM && this.currentBGM.playing()) {
      console.log(`[AudioManager] Cross-fading from "${this.currentBGMName}" to "${trackName}"`);

      const oldTrack = this.currentBGM;
      const targetVolume = this.bgmVolume * this.masterVolume;

      // Fade out old track
      oldTrack.fade(oldTrack.volume(), 0, fadeTime);

      // Stop old track after fade completes
      setTimeout(() => {
        oldTrack.stop();
        console.log(`[AudioManager] Stopped old track: ${this.currentBGMName}`);
      }, fadeTime);

      // Start new track at volume 0 and fade in
      newTrack.volume(0);
      newTrack.play();
      newTrack.fade(0, targetVolume, fadeTime);
    } else {
      // No current track, just start playing with fade in
      const targetVolume = this.bgmVolume * this.masterVolume;
      newTrack.volume(0);
      newTrack.play();
      newTrack.fade(0, targetVolume, AUDIO_SETTINGS.fadeInDuration);
    }

    this.currentBGM = newTrack;
    this.currentBGMName = trackName;
  }

  /**
   * Stop current background music
   * @param {number} fadeTime - Fade out duration in ms
   */
  stopBGM(fadeTime = AUDIO_SETTINGS.fadeOutDuration) {
    if (!this.currentBGM || !this.currentBGM.playing()) {
      return;
    }

    console.log(`[AudioManager] Stopping BGM: ${this.currentBGMName}`);

    const track = this.currentBGM;
    track.fade(track.volume(), 0, fadeTime);

    setTimeout(() => {
      track.stop();
      this.currentBGM = null;
      this.currentBGMName = null;
    }, fadeTime);
  }

  /**
   * Play a sound effect
   * @param {string} soundName - Name of the sound from AUDIO_CONFIG.sfx
   * @param {number} volumeMultiplier - Optional volume multiplier (0.0 - 1.0)
   */
  playSFX(soundName, volumeMultiplier = 1.0) {
    // Unlock audio on first play attempt (mobile)
    this.unlockAudio();

    const sound = this.sfxSounds[soundName];
    if (!sound) {
      console.error(`[AudioManager] SFX "${soundName}" not found`);
      return;
    }

    // Calculate effective volume
    const effectiveVolume = this.sfxVolume * this.masterVolume * volumeMultiplier;
    sound.volume(effectiveVolume);

    // Play the sound
    const soundId = sound.play();
    console.log(`[AudioManager] Playing SFX: ${soundName}`);

    // Track active sound effects
    this.activeSFX.push({ sound, soundId });

    // Clean up when sound ends
    sound.once('end', () => {
      this.activeSFX = this.activeSFX.filter(
        (sfx) => !(sfx.sound === sound && sfx.soundId === soundId)
      );
    });

    return soundId;
  }

  /**
   * Stop all currently playing sound effects
   */
  stopAllSFX() {
    console.log('[AudioManager] Stopping all SFX');
    this.activeSFX.forEach(({ sound, soundId }) => {
      sound.stop(soundId);
    });
    this.activeSFX = [];
  }

  /**
   * Set background music volume
   * @param {number} volume - Volume level (0.0 - 1.0)
   */
  setBGMVolume(volume) {
    this.bgmVolume = Math.max(0, Math.min(1, volume));

    // Update current BGM if playing
    if (this.currentBGM && this.currentBGM.playing()) {
      this.currentBGM.volume(this.bgmVolume * this.masterVolume);
    }

    console.log(`[AudioManager] BGM volume set to ${this.bgmVolume}`);
  }

  /**
   * Set sound effects volume
   * @param {number} volume - Volume level (0.0 - 1.0)
   */
  setSFXVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));

    // Update all preloaded SFX volumes
    Object.values(this.sfxSounds).forEach((sound) => {
      sound.volume(this.sfxVolume * this.masterVolume);
    });

    console.log(`[AudioManager] SFX volume set to ${this.sfxVolume}`);
  }

  /**
   * Set master volume (affects both BGM and SFX)
   * @param {number} volume - Volume level (0.0 - 1.0)
   */
  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));

    // Update all volumes
    this.setBGMVolume(this.bgmVolume);
    this.setSFXVolume(this.sfxVolume);

    console.log(`[AudioManager] Master volume set to ${this.masterVolume}`);
  }

  /**
   * Mute all audio
   */
  mute() {
    if (this.isMuted) return;

    Howler.mute(true);
    this.isMuted = true;
    console.log('[AudioManager] Audio muted');
  }

  /**
   * Unmute all audio
   */
  unmute() {
    if (!this.isMuted) return;

    Howler.mute(false);
    this.isMuted = false;
    console.log('[AudioManager] Audio unmuted');
  }

  /**
   * Toggle mute state
   */
  toggleMute() {
    if (this.isMuted) {
      this.unmute();
    } else {
      this.mute();
    }
  }

  /**
   * Get current mute state
   * @returns {boolean} True if muted
   */
  getMuteState() {
    return this.isMuted;
  }

  /**
   * Clean up all audio resources
   */
  cleanup() {
    console.log('[AudioManager] Cleaning up...');

    // Stop and unload all BGM
    Object.values(this.bgmTracks).forEach((track) => {
      track.stop();
      track.unload();
    });

    // Stop and unload all SFX
    Object.values(this.sfxSounds).forEach((sound) => {
      sound.stop();
      sound.unload();
    });

    this.currentBGM = null;
    this.currentBGMName = null;
    this.activeSFX = [];
  }
}

// Export singleton instance
const audioManager = new AudioManager();
export default audioManager;
