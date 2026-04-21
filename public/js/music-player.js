// music-player.js - Music player panel with DBZ OST playlist
// Exposes window.SPP.musicPlayer (singleton)
(function () {
    'use strict';

    const { createSafeElement, setSafeContent, sanitizeInput } = window.SPP.utils;

    const musicPlayer = {
        songs: [
            { title: "Level Up", src: "/music/Level Up.mp3", duration: "3:27" },
            { title: "Cha-La Head-Cha-La (variations)", src: "/music/CHA-LA HEAD-CHA-LA(Variations).mp3", duration: "1:30" },
            { title: "Skill Shop", src: "/music/Skill Shop.mp3", duration: "4:05" },
            { title: "Dragon Arena", src: "/music/Dragon Arena.mp3", duration: "6:02" },
            { title: "Team Saiyan (EN)", src: "/music/Team Saiyan EN.mp3", duration: "2:42" },
            { title: "DB GT Opening (MJ Style)", src: "/music/Dragon Ball GT Opening (DBGT) - Michael Jackson Style.mp3", duration: "3:28" },
            { title: "Makafushigi Adventure (MJ Style)", src: "/music/Makafushigi Adventure (DBZ) - Michael Jackson Style.mp3", duration: "3:41" },
        ],
        currentSongIndex: -1,
        audio: new Audio(),
        isPlaying: false,
        volume: 0.5,

        init() {
            this.playerToggle = document.getElementById('music-player-toggle');
            this.playerPanel = document.getElementById('music-player-panel');
            this.playerClose = document.getElementById('music-player-close');
            this.playPauseBtn = document.getElementById('play-pause-btn');
            this.prevBtn = document.getElementById('prev-song-btn');
            this.nextBtn = document.getElementById('next-song-btn');
            this.volumeSlider = document.getElementById('volume-slider');
            this.progressBar = document.getElementById('progress-bar');
            this.currentTimeEl = document.getElementById('current-time');
            this.totalTimeEl = document.getElementById('total-time');
            this.currentSongNameEl = document.getElementById('current-song-name');
            this.playlistEl = document.getElementById('playlist');

            if (!this.playerToggle || !this.playerPanel || !this.playerClose ||
                !this.playPauseBtn || !this.prevBtn || !this.nextBtn ||
                !this.volumeSlider || !this.progressBar || !this.currentTimeEl ||
                !this.totalTimeEl || !this.currentSongNameEl || !this.playlistEl) {
                console.error('Music player: One or more required DOM elements not found');
                return;
            }

            this.audio.volume = this.volume;
            this.volumeSlider.value = this.volume * 100;

            this.createPlaylist();
            this.setupEventListeners();
            this.setupAudioEventListeners();
        },

        positionPanel() {
            const buttonRect = this.playerToggle.getBoundingClientRect();
            const panelWidth = 320;
            const panelHeight = 400;
            const gap = 8;

            const buttonCenterX = buttonRect.left + (buttonRect.width / 2);
            let panelLeft = buttonCenterX - (panelWidth / 2);

            if (panelLeft < gap) {
                panelLeft = gap;
            } else if (panelLeft + panelWidth > window.innerWidth - gap) {
                panelLeft = window.innerWidth - panelWidth - gap;
            }

            let panelTop = buttonRect.bottom + gap;
            let transformOrigin = 'top center';

            if (panelTop + panelHeight > window.innerHeight - gap) {
                panelTop = buttonRect.top - panelHeight - gap;
                transformOrigin = 'bottom center';

                if (panelTop < gap) {
                    panelTop = gap;
                    transformOrigin = 'top center';
                }
            }

            this.playerPanel.style.position = 'fixed';
            this.playerPanel.style.top = `${panelTop}px`;
            this.playerPanel.style.left = `${panelLeft}px`;
            this.playerPanel.style.right = 'auto';
            this.playerPanel.style.transformOrigin = transformOrigin;
        },

        setupEventListeners() {
            this.playerToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playerToggle.classList.add('button-animate');
                setTimeout(() => this.playerToggle.classList.remove('button-animate'), 200);

                const isHidden = this.playerPanel.classList.contains('hidden');

                if (isHidden) {
                    this.positionPanel();
                    this.playerPanel.classList.remove('hidden');
                    this.playerPanel.classList.add('panel-animate');
                    setTimeout(() => this.playerPanel.classList.remove('panel-animate'), 300);
                } else {
                    this.playerPanel.classList.add('hidden');
                }
            });

            this.playerClose.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playerPanel.classList.add('hidden');
            });

            this.playPauseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePlayPause();
            });

            this.prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playPreviousSong();
            });

            this.nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playNextSong();
            });

            this.volumeSlider.addEventListener('input', (e) => {
                e.stopPropagation();
                this.setVolume(e.target.value / 100);
            });

            document.addEventListener('click', (e) => {
                if (!this.playerPanel.classList.contains('hidden') &&
                    !this.playerPanel.contains(e.target) &&
                    !this.playerToggle.contains(e.target)) {
                    this.playerPanel.classList.add('hidden');
                }
            });

            window.addEventListener('resize', () => {
                if (!this.playerPanel.classList.contains('hidden')) {
                    this.positionPanel();
                }
            });

            this.playerPanel.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        },

        setupAudioEventListeners() {
            this.audio.addEventListener('timeupdate', () => {
                if (this.audio.duration) {
                    const progress = (this.audio.currentTime / this.audio.duration) * 100;
                    this.progressBar.style.width = `${progress}%`;
                    this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
                }
            });

            this.audio.addEventListener('ended', () => {
                this.playNextSong();
            });

            this.audio.addEventListener('loadedmetadata', () => {
                this.totalTimeEl.textContent = this.formatTime(this.audio.duration);
            });

            this.audio.addEventListener('error', (e) => {
                console.error('Audio error:', e);
                this.isPlaying = false;
                this.updatePlayPauseButton();

                if (this.currentSongIndex !== -1) {
                    const song = this.songs[this.currentSongIndex];
                    this.showErrorMessage(`Error playing: ${song.title}`);
                }
            });
        },

        createPlaylist() {
            this.playlistEl.innerHTML = '';

            this.songs.forEach((song, index) => {
                const playlistItem = document.createElement('div');
                playlistItem.className = 'playlist-item';
                playlistItem.dataset.index = index;

                const titleDiv = createSafeElement('div', song.title, 'playlist-item-title');
                const durationDiv = createSafeElement('div', song.duration, 'playlist-item-duration');
                playlistItem.appendChild(titleDiv);
                playlistItem.appendChild(durationDiv);

                playlistItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.playSong(index);
                });

                this.playlistEl.appendChild(playlistItem);
            });
        },

        showErrorMessage(message) {
            const errorEl = document.createElement('div');
            errorEl.className = 'music-player-error absolute top-2 left-0 right-0 bg-red-600 text-white text-center py-1 px-2 rounded text-sm z-50';
            setSafeContent(errorEl, sanitizeInput(message));
            this.playerPanel.appendChild(errorEl);

            setTimeout(() => errorEl.remove(), 3000);
        },

        playSong(index) {
            if (index < 0 || index >= this.songs.length) {
                console.error('Invalid song index:', index);
                return;
            }

            this.currentSongIndex = index;
            const song = this.songs[index];

            const titleSpan = createSafeElement('span', song.title);
            const loadingSpan = createSafeElement('span', '', 'loading-indicator');
            this.currentSongNameEl.innerHTML = '';
            this.currentSongNameEl.appendChild(titleSpan);
            this.currentSongNameEl.appendChild(document.createTextNode(' '));
            this.currentSongNameEl.appendChild(loadingSpan);
            this.updatePlaylistActiveItem();

            this.progressBar.style.width = '0%';
            this.currentTimeEl.textContent = '0:00';

            this.audio.src = song.src;
            this.audio.load();

            const removeLoadingIndicator = () => {
                setSafeContent(this.currentSongNameEl, song.title);
            };

            this.audio.addEventListener('play', removeLoadingIndicator, { once: true });
            this.audio.addEventListener('error', removeLoadingIndicator, { once: true });

            this.audio.onerror = () => {
                console.error('Error loading audio file:', song.src);
                this.isPlaying = false;
                this.updatePlayPauseButton();
                this.showErrorMessage(`Error loading: ${song.title}`);
            };

            const playPromise = this.audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.isPlaying = true;
                    this.updatePlayPauseButton();
                }).catch((error) => {
                    console.error('Error playing song:', error);
                    this.isPlaying = false;
                    this.updatePlayPauseButton();
                    this.showErrorMessage(`Playback error: ${song.title}`);
                });
            }
        },

        togglePlayPause() {
            if (this.currentSongIndex === -1) {
                this.playSong(0);
                return;
            }

            if (this.isPlaying) {
                this.audio.pause();
                this.isPlaying = false;
            } else {
                const playPromise = this.audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        this.isPlaying = true;
                    }).catch((error) => {
                        console.error('Error resuming playback:', error);
                        this.isPlaying = false;
                    });
                }
            }

            this.updatePlayPauseButton();
        },

        playPreviousSong() {
            if (this.currentSongIndex <= 0) {
                this.playSong(this.songs.length - 1);
            } else {
                this.playSong(this.currentSongIndex - 1);
            }
        },

        playNextSong() {
            if (this.currentSongIndex === -1) {
                this.playSong(0);
            } else if (this.currentSongIndex >= this.songs.length - 1) {
                this.playSong(0);
            } else {
                this.playSong(this.currentSongIndex + 1);
            }
        },

        setVolume(volume) {
            this.volume = volume;
            this.audio.volume = volume;
            this.volumeSlider.value = volume * 100;
        },

        updatePlayPauseButton() {
            this.playPauseBtn.innerHTML = this.isPlaying
                ? '<i class="fas fa-pause"></i>'
                : '<i class="fas fa-play"></i>';
        },

        updatePlaylistActiveItem() {
            const items = this.playlistEl.querySelectorAll('.playlist-item');
            items.forEach((item, index) => {
                if (index === this.currentSongIndex) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        },

        formatTime(seconds) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60);
            return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
        }
    };

    window.SPP = window.SPP || {};
    window.SPP.musicPlayer = musicPlayer;
})();
