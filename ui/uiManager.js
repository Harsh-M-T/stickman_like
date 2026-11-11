/**
 * UIManager — manages all HTML overlay screens and settings UI.
 *
 * Screens: main menu, character select, stage select, difficulty, settings,
 * instructions, pause, game over.
 * Flow: Character Select → Stage → Difficulty → Fight.
 *
 * Communicates with Game exclusively through EventBus events:
 *   Game emits → game:started, game:stopped, game:paused, game:resumed,
 *                game:roundEnd, game:matchOver, game:assetsReady
 *   UIManager emits → ui:startGame, ui:fight, ui:pauseGame, ui:resumeGame,
 *                     ui:quitToMenu, ui:rematch, ui:backToMenu
 */
export default class UIManager {
    /**
     * @param {{
     *   bus: import('../core/eventBus.js').default,
     *   audio: import('../utils/audioManager.js').default,
     *   settingsStore: import('../ui/settingsStore.js').default,
     *   characters?: import('../configs/characters/index.js').PLAYER_ROSTER,
     * }} deps
     */
    constructor({ bus, audio, settingsStore, characters } = {}) {
        this._bus = bus;
        this._audio = audio;
        this._settingsStore = settingsStore;
        this._characters = characters ?? [];

        //  Screen elements 
        this._menuScreen = document.getElementById('menuScreen');
        this._characterSelectScreen = document.getElementById('characterSelectScreen');
        this._stageSelectScreen = document.getElementById('stageSelectScreen');
        this._difficultyScreen = document.getElementById('difficultyScreen');
        this._settingsScreen = document.getElementById('settingsScreen');
        this._instructionsScreen = document.getElementById('instructionsScreen');
        this._pauseOverlay = document.getElementById('pauseOverlay');
        this._gameOverOverlay = document.getElementById('gameOverOverlay');
        this._mobileControls = document.getElementById('mobileControls');
        this._pauseButton = document.getElementById('pauseButton');

        //  Menu buttons 
        this._startButton = document.getElementById('startButton');
        this._settingsButton = document.getElementById('settingsButton');
        this._instructionsButton = document.getElementById('instructionsButton');
        this._fightButton = document.getElementById('fightButton');

        //  Character select 
        this._characterCardsContainer = document.getElementById('characterCards');
        this._randomSelectButton = document.getElementById('randomSelectButton');
        this._toStageButton = document.getElementById('toStageButton');
        this._backToMenuFromCharsButton = document.getElementById('backToMenuFromCharsButton');

        //  Stage select 
        this._stageCardsContainer = document.getElementById('stageCards');
        this._backToCharsButton = document.getElementById('backToCharsButton');

        //  Difficulty select 
        this._easyButton = document.getElementById('easyButton');
        this._normalButton = document.getElementById('normalButton');
        this._hardButton = document.getElementById('hardButton');
        this._bossButton = document.getElementById('bossButton');
        this._backToStageButton = document.getElementById('backToStageButton');

        //  Settings 
        this._settingsBackButton = document.getElementById('settingsBackButton');
        this._masterVolumeRange = document.getElementById('masterVolumeRange');
        this._musicVolumeRange = document.getElementById('musicVolumeRange');
        this._sfxVolumeRange = document.getElementById('sfxVolumeRange');
        this._muteToggle = document.getElementById('muteToggle');
        this._touchToggle = document.getElementById('touchToggle');
        this._difficultySelect = document.getElementById('difficultySelect');

        //  Instructions 
        this._instructionsBackButton = document.getElementById('instructionsBackButton');

        //  Pause overlay 
        this._resumeButton = document.getElementById('resumeButton');
        this._pauseSettingsButton = document.getElementById('pauseSettingsButton');
        this._quitButton = document.getElementById('quitButton');

        //  Game-over overlay 
        this._rematchButton = document.getElementById('rematchButton');
        this._quitToMenuButton = document.getElementById('quitToMenuButton');

        // Track first user gesture (required for audio autoplay)
        this._userInteracted = false;

        // Track which screen opened Settings (so Back returns correctly)
        this._settingsParent = null;

        // Character select state
        this._selectedCharacterId = 'player';
        this._selectedStageId = 'street';

        // Boss (Atlas) is locked until the player wins 3 CPU matches in a row
        this._bossUnlocked = false;

        this._populateFormFromSettings();

        // Loading gate — Start stays disabled until assets are ready
        this._startButton.disabled = true;

        this._bindEvents();
        this._updateMobileControlsVisibility();
    }

    //  Public API — navigation

    showMainMenu() {
        this._hideAllScreens();
        this._show(this._menuScreen);
        this._updateHUDVisibility();
        this._updateMobileControlsVisibility();
        this._audio.stopMusic();
        this._audio.playMusic('bgm_menu', { volume: 0.4, loop: true });
    }

    showCharacterSelect() {
        this._hideAllScreens();
        this._show(this._characterSelectScreen);
        this._renderCharacterCards();
        this._updateHUDVisibility();
        this._updateMobileControlsVisibility();
    }

    showStageSelect() {
        this._hideAllScreens();
        this._show(this._stageSelectScreen);
        this._updateHUDVisibility();
        this._updateMobileControlsVisibility();
    }

    showDifficulty() {
        this._hideAllScreens();
        this._show(this._difficultyScreen);
        this._updateBossLock();
        this._updateHUDVisibility();
        this._updateMobileControlsVisibility();
    }

    /** Grey out the Boss card until the unlock event fires. */
    _updateBossLock() {
        if (!this._bossButton) return;
        this._bossButton.disabled = !this._bossUnlocked;
        this._bossButton.classList.toggle('locked', !this._bossUnlocked);
        const desc = this._bossButton.querySelector('.diff-desc');
        if (desc) {
            desc.textContent = this._bossUnlocked
                ? 'Atlas — the Colossus. Survive.'
                : 'Atlas — locked. Win 3 matches in a row.';
        }
    }

    showGameOverOverlay() {
        this._show(this._gameOverOverlay);
        this._updateHUDVisibility();
        this._updateMobileControlsVisibility();
    }

    hideGameOverOverlay() {
        this._hide(this._gameOverOverlay);
    }

    //  Settings helpers

    _showSettings(parent) {
        this._settingsParent = parent;
        if (parent === 'pause') {
            this._bus.emit('ui:pauseGame');
        }
        this._hideAllScreens();
        this._show(this._settingsScreen);
    }

    _onSettingsBack() {
        this._hide(this._settingsScreen);
        if (this._settingsParent === 'menu') this._show(this._menuScreen);
        if (this._settingsParent === 'pause') this._show(this._pauseOverlay);
        this._settingsParent = null;
    }

    //  Event binding

    _bindEvents() {
        // First-gesture listener for audio
        document.addEventListener('click', () => {
            if (this._userInteracted) return;
            this._userInteracted = true;
            if (!this._menuScreen?.classList.contains('hidden')) {
                this._audio.resumeContext().then(() =>
                    this._audio.playMusic('bgm_menu', { volume: 0.4, loop: true })
                );
            }
        });

        // Hover sound on all buttons
        document.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                if (!this._userInteracted) return;
                this._audio.playSFX('hover');
            });
        });

        //  Main menu 
        this._startButton?.addEventListener('click', () => {
            this._audio.stopMusic();
            this._hideAllScreens();
            this.showCharacterSelect();
        });

        this._settingsButton?.addEventListener('click', () => {
            this._showSettings('menu');
        });

        this._instructionsButton?.addEventListener('click', () => {
            this._hideAllScreens();
            this._show(this._instructionsScreen);
        });

        //  Character select → stage → difficulty → fight
        if (this._toStageButton) {
            this._toStageButton.addEventListener('click', () => {
                this._audio.playSFX('select');
                this.showStageSelect();
            });
        }

        //  Stage select — pick a card, then auto-advance to difficulty
        document.querySelectorAll('#stageCards .stage-card').forEach(card => {
            card.addEventListener('click', () => {
                this._selectedStageId = card.dataset.stage ?? 'street';
                document.querySelectorAll('#stageCards .stage-card').forEach(c =>
                    c.classList.toggle('selected', c === card));
                this._audio.playSFX('select');
                this.showDifficulty();
            });
        });

        if (this._fightButton) {
            this._fightButton.addEventListener('click', () => {
                this._bus.emit('ui:fight', {
                    characterId: this._selectedCharacterId,
                    stageId: this._selectedStageId,
                    difficulty: this._settingsStore.difficulty,
                });
            });
        }

        if (this._randomSelectButton) {
            this._randomSelectButton.addEventListener('click', () => {
                const roster = this._characters;
                if (!roster.length) return;
                this._selectedCharacterId = roster[Math.floor(Math.random() * roster.length)].id;
                this._updateRandomButtonLabel();
            });
        }

        if (this._backToMenuFromCharsButton) {
            this._backToMenuFromCharsButton.addEventListener('click', () => {
                this._bus.emit('ui:quitToMenu');
            });
        }

        if (this._backToCharsButton) {
            this._backToCharsButton.addEventListener('click', () => {
                this.showCharacterSelect();
            });
        }

        if (this._backToStageButton) {
            this._backToStageButton.addEventListener('click', () => {
                this.showStageSelect();
            });
        }

        if (this._easyButton) {
            this._easyButton.addEventListener('click', () => {
                this._settingsStore.update({ difficulty: 'easy' });
                this._bus.emit('ui:fight', {
                    characterId: this._selectedCharacterId,
                    stageId: this._selectedStageId,
                    difficulty: 'easy',
                });
            });
        }

        if (this._normalButton) {
            this._normalButton.addEventListener('click', () => {
                this._settingsStore.update({ difficulty: 'normal' });
                this._bus.emit('ui:fight', {
                    characterId: this._selectedCharacterId,
                    stageId: this._selectedStageId,
                    difficulty: 'normal',
                });
            });
        }

        if (this._hardButton) {
            this._hardButton.addEventListener('click', () => {
                this._settingsStore.update({ difficulty: 'hard' });
                this._bus.emit('ui:fight', {
                    characterId: this._selectedCharacterId,
                    stageId: this._selectedStageId,
                    difficulty: 'hard',
                });
            });
        }

        if (this._bossButton) {
            this._bossButton.addEventListener('click', () => {
                this._settingsStore.update({ difficulty: 'boss' });
                this._bus.emit('ui:fight', {
                    characterId: this._selectedCharacterId,
                    stageId: this._selectedStageId,
                    difficulty: 'boss',
                });
            });
        }

        //  Settings 
        this._settingsBackButton?.addEventListener('click', () => this._onSettingsBack());

        this._masterVolumeRange?.addEventListener('input', e =>
            this._settingsStore.update({ masterVolume: parseFloat(e.target.value) }));
        this._musicVolumeRange?.addEventListener('input', e =>
            this._settingsStore.update({ musicVolume: parseFloat(e.target.value) }));
        this._sfxVolumeRange?.addEventListener('input', e =>
            this._settingsStore.update({ sfxVolume: parseFloat(e.target.value) }));
        this._muteToggle?.addEventListener('change', e =>
            this._settingsStore.update({ muted: e.target.checked }));
        this._touchToggle?.addEventListener('change', e => {
            this._settingsStore.update({ touchMode: e.target.value });
            this._updateMobileControlsVisibility();
        });
        this._difficultySelect?.addEventListener('change', e =>
            this._settingsStore.update({ difficulty: e.target.value }));

        //  Instructions 
        this._instructionsBackButton?.addEventListener('click', () => {
            this._hideAllScreens();
            this._show(this._menuScreen);
        });

        //  Pause overlay 
        this._pauseButton?.addEventListener('click', () => {
            this._bus.emit('ui:pauseGame');
            this._show(this._pauseOverlay);
            this._updateMobileControlsVisibility();
        });

        this._resumeButton?.addEventListener('click', () => {
            this._hide(this._pauseOverlay);
            this._bus.emit('ui:resumeGame');
            this._updateMobileControlsVisibility();
        });

        this._pauseSettingsButton?.addEventListener('click', () => {
            this._showSettings('pause');
        });

        this._quitButton?.addEventListener('click', () => {
            this._hide(this._pauseOverlay);
            this._bus.emit('ui:quitToMenu');
        });

        //  Game-over overlay 
        this._rematchButton?.addEventListener('click', () => {
            this.hideGameOverOverlay();
            this._bus.emit('ui:rematch');
            this._updateHUDVisibility();
            this._updateMobileControlsVisibility();
        });

        this._quitToMenuButton?.addEventListener('click', () => {
            this.hideGameOverOverlay();
            this._bus.emit('ui:quitToMenu');
        });

        //  Keyboard shortcuts 
        window.addEventListener('keydown', e => {
            if (e.code !== 'Escape') return;

            if (this._isVisible(this._settingsScreen)) {
                this._onSettingsBack();
            } else if (this._isVisible(this._instructionsScreen)) {
                this._hideAllScreens();
                this._show(this._menuScreen);
            } else if (this._pauseButton && !this._pauseButton.classList.contains('hidden')) {
                // In-game: pause
                this._bus.emit('ui:pauseGame');
                this._show(this._pauseOverlay);
                this._updateMobileControlsVisibility();
            } else if (this._isVisible(this._pauseOverlay)) {
                this._hide(this._pauseOverlay);
                this._bus.emit('ui:resumeGame');
                this._updateMobileControlsVisibility();
            }
        });

        //  Subscribe to game events 
        this._bus.on('game:assetsReady', () => {
            this._startButton.disabled = false;
        });
        this._bus.on('game:started', () => {
            // The fight renders on the canvas underneath — clear any menu
            // overlay (e.g. the difficulty screen) that is still visible.
            this._hideAllScreens();
            this._updateHUDVisibility();
            this._updateMobileControlsVisibility();
        });
        this._bus.on('game:stopped', () => {
            this.showMainMenu();
        });
        this._bus.on('game:paused', () => {
            this._show(this._pauseOverlay);
            this._updateMobileControlsVisibility();
        });
        this._bus.on('game:resumed', () => {
            this._hide(this._pauseOverlay);
            this._updateMobileControlsVisibility();
        });
        this._bus.on('game:roundEnd', () => {
            // handled by Game; UI shows game-over when the match is over
        });
        this._bus.on('game:matchOver', () => {
            this.showGameOverOverlay();
        });
        this._bus.on('game:bossUnlocked', () => {
            this._bossUnlocked = true;
            this._updateBossLock();
        });
    }

    //  Character select rendering

    _renderCharacterCards() {
        const container = this._characterCardsContainer;
        if (!container) return;
        container.innerHTML = '';
        for (const c of this._characters) {
            const card = document.createElement('button');
            card.className = 'character-card';
            card.dataset.characterId = c.id;
            card.innerHTML = `
                <div class="character-portrait" style="background: radial-gradient(circle, ${c.spriteColor ?? '#c084fc'}33, transparent 70%); border-color: ${c.spriteColor ?? '#c084fc'}"></div>
                <div class="character-name">${c.displayName}</div>
                <div class="character-hp">${Math.round(c.physics.maxHealth)} HP</div>
            `;
            card.addEventListener('click', () => {
                this._selectedCharacterId = c.id;
                this._updateRandomButtonLabel();
                // Highlight the picked card (visual confirmation)
                container.querySelectorAll('.character-card').forEach(el =>
                    el.classList.toggle('selected', el === card));
                this._audio.playSFX('select');
            });
            container.appendChild(card);
        }
    }

    _updateRandomButtonLabel() {
        const btn = this._randomSelectButton;
        if (btn) btn.textContent = `Random Select (${this._selectedCharacterId})`;
        // Keep the card highlight in sync with a random pick
        this._characterCardsContainer?.querySelectorAll('.character-card').forEach(el =>
            el.classList.toggle('selected', el.dataset.characterId === this._selectedCharacterId));
    }

    //  Settings — form ↔ store sync

    _populateFormFromSettings() {
        const s = this._settingsStore;
        if (this._masterVolumeRange) this._masterVolumeRange.value = s.masterVolume;
        if (this._musicVolumeRange) this._musicVolumeRange.value = s.musicVolume;
        if (this._sfxVolumeRange) this._sfxVolumeRange.value = s.sfxVolume;
        if (this._muteToggle) this._muteToggle.checked = s.muted;
        if (this._touchToggle) this._touchToggle.value = s.touchMode;
        if (this._difficultySelect) this._difficultySelect.value = s.difficulty;
    }

    //  Visibility helpers

    _show(el) { el?.classList.remove('hidden'); }
    _hide(el) { el?.classList.add('hidden'); }
    _isVisible(el) { return !!el && !el.classList.contains('hidden'); }

    _hideAllScreens() {
        [
            this._menuScreen,
            this._characterSelectScreen,
            this._stageSelectScreen,
            this._difficultyScreen,
            this._settingsScreen,
            this._instructionsScreen,
            this._pauseOverlay,
            this._gameOverOverlay,
        ].forEach(el => this._hide(el));
    }

    _updateHUDVisibility() {
        const menuVisible = this._menuScreen && !this._menuScreen.classList.contains('hidden');
        const settingsVisible = this._settingsScreen && !this._settingsScreen.classList.contains('hidden');
        const instructionsVisible = this._instructionsScreen && !this._instructionsScreen.classList.contains('hidden');
        const charSelVisible = this._characterSelectScreen && !this._characterSelectScreen.classList.contains('hidden');
        const stageSelVisible = this._stageSelectScreen && !this._stageSelectScreen.classList.contains('hidden');
        const difficultyVisible = this._difficultyScreen && !this._difficultyScreen.classList.contains('hidden');
        const inOverlay = menuVisible || settingsVisible || instructionsVisible || charSelVisible || stageSelVisible || difficultyVisible;

        if (inOverlay || this._isVisible(this._gameOverOverlay) || this._isVisible(this._pauseOverlay)) {
            this._hide(this._pauseButton);
        } else {
            this._show(this._pauseButton);
        }
    }

    _updateMobileControlsVisibility() {
        const mode = this._touchToggle?.value ?? 'auto';
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const wantShow = mode === 'on' || (mode === 'auto' && isTouch);
        const canShow = wantShow
            && !this._isVisible(this._menuScreen)
            && !this._isVisible(this._settingsScreen)
            && !this._isVisible(this._instructionsScreen)
            && !this._isVisible(this._pauseOverlay)
            && !this._isVisible(this._gameOverOverlay);

        canShow ? this._show(this._mobileControls) : this._hide(this._mobileControls);
    }
}
