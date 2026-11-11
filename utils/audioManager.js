/**
 * AudioManager — Web Audio API wrapper for music and SFX.
 * Supports master/music/sfx gain chains with mute and volume control.
 * Subscribes to SettingsStore for reactive volume/mute changes.
 */
export default class AudioManager {
    /**
     * @param {{ settingsStore?: import('../ui/settingsStore.js').default }} [opts]
     */
    constructor({ settingsStore } = {}) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this._ctx = new AudioContextClass();

        // Gain chain: source → categoryGain → masterGain → destination
        this._masterGain = this._ctx.createGain();
        this._musicGain = this._ctx.createGain();
        this._sfxGain = this._ctx.createGain();

        this._masterGain.gain.value = 1.0;
        this._musicGain.gain.value = 1.0;
        this._sfxGain.gain.value = 1.0;

        this._musicGain.connect(this._masterGain);
        this._sfxGain.connect(this._masterGain);
        this._masterGain.connect(this._ctx.destination);

        /** @type {Map<string, AudioBuffer>} */
        this._buffers = new Map();

        /** @type {AudioBufferSourceNode|null} */
        this._currentMusicSource = null;

        // Subscribe to settings changes
        if (settingsStore) {
            settingsStore.onChange(s => this._applySettings(s));
            this._applySettings(settingsStore.getAll());
        }
    }

    //  Context 

    async resumeContext() {
        if (this._ctx.state === 'suspended') {
            await this._ctx.resume().catch(err =>
                console.warn('[AudioManager] resumeContext failed:', err)
            );
        }
    }

    //  Loading 

    async _loadOne(key, url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
        this._buffers.set(key, audioBuffer);
    }

    /**
     * Loads a list of audio assets. Each item may supply multiple URL fallbacks.
     * @param {{ key: string, urls: string[] }[]} list
     */
    async loadAudioList(list) {
        for (const { key, urls } of list) {
            let loaded = false;
            for (const url of urls) {
                try {
                    await this._loadOne(key, url);
                    loaded = true;
                    break;
                } catch {
                    console.warn(`[AudioManager] Could not load "${url}" for key "${key}"`);
                }
            }
            if (!loaded) {
                console.error(`[AudioManager] All URLs failed for key "${key}"`);
            }
        }
    }

    //  Playback 

    /**
     * Plays a one-shot sound effect.
     * @param {string} key
     * @param {{ volume?: number, playbackRate?: number }} [opts]
     */
    playSFX(key, { volume = 1.0, playbackRate = 1.0 } = {}) {
        const buffer = this._buffers.get(key);
        if (!buffer) {
            // Generated WebAudio fallback (no asset loaded / missing file)
            this.playTone({ type: key === 'super' ? 'sawtooth' : key === 'hit' ? 'square' : 'sine', freq: key === 'super' ? 90 : 220, freqEnd: key === 'super' ? 40 : 180, dur: key === 'super' ? 0.9 : 0.12, vol: volume });
            return;
        }

        this.resumeContext();

        const source = this._ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;

        const gain = this._ctx.createGain();
        gain.gain.value = volume;

        source.connect(gain).connect(this._sfxGain);
        source.start(0);
    }

    /**
     * Plays a synthesized tone (used as a fallback when no asset is loaded).
     * @param {{ type?: OscillatorType, freq?: number, freqEnd?: number, dur?: number, vol?: number, delay?: number }} opts
     */
    playTone({ type = 'sine', freq = 220, freqEnd = freq, dur = 0.12, vol = 1, delay = 0 } = {}) {
        this.resumeContext();
        const t0 = this._ctx.currentTime + (delay ?? 0);
        const osc = this._ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (freqEnd !== undefined && freqEnd !== freq) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
        }
        const gain = this._ctx.createGain();
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc.connect(gain).connect(this._sfxGain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    /**
     * Plays looping background music, stopping any previous track.
     * @param {string} key
     * @param {{ volume?: number, loop?: boolean }} [opts]
     */
    playMusic(key, { volume = 1.0, loop = true } = {}) {
        const buffer = this._buffers.get(key);
        if (!buffer) {
            console.warn(`[AudioManager] No buffer for music key "${key}"`);
            return;
        }

        this.resumeContext();
        this.stopMusic();

        const source = this._ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;

        const gain = this._ctx.createGain();
        gain.gain.value = volume;

        source.connect(gain).connect(this._musicGain);
        source.start(0);

        this._currentMusicSource = source;
    }

    stopMusic() {
        if (!this._currentMusicSource) return;
        try { this._currentMusicSource.stop(); } catch { /* already stopped */ }
        this._currentMusicSource.disconnect();
        this._currentMusicSource = null;
    }

    /** True when a buffer for `key` is loaded (used for SFX fallback resolution). */
    has(key) {
        return this._buffers.has(key);
    }

    //  Volume control 

    setMasterVolume(val) { this._masterGain.gain.value = Math.max(0, Math.min(1, val)); }
    setMusicVolume(val) { this._musicGain.gain.value = Math.max(0, Math.min(1, val)); }
    setSFXVolume(val) { this._sfxGain.gain.value = Math.max(0, Math.min(1, val)); }

    //  Settings subscription 

    _applySettings(s) {
        if (s.muted) {
            this.setMasterVolume(0);
        } else {
            this.setMasterVolume(s.masterVolume);
            this.setMusicVolume(s.musicVolume);
            this.setSFXVolume(s.sfxVolume);
        }
    }
}
