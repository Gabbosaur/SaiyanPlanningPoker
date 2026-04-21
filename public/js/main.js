document.addEventListener('DOMContentLoaded', () => {
    // Utility functions extracted to utils.js
    const {
        sanitizeInput,
        getCSRFToken,
        setSafeContent,
        getPersistentUserId,
        generateSessionId,
        showNotification
    } = window.SPP.utils;

    // DOM Elements
    const loginScreen = document.getElementById('login-screen');
    const gameScreen = document.getElementById('game-screen');
    const loginForm = document.getElementById('login-form');
    const createSessionBtn = document.getElementById('create-session-btn');
    const sessionIdInput = document.getElementById('session-id');
    const usernameInput = document.getElementById('username');
    const avatarUpload = document.getElementById('avatar-upload');
    const avatarPreview = document.getElementById('avatar-preview');
    const sessionIdDisplay = document.getElementById('session-id-display');
    const participantsContainer = document.getElementById('participants-container');
    const cardsContainer = document.getElementById('cards-container');
    const voteStatus = document.getElementById('vote-status');
    const voteCounter = document.getElementById('vote-counter');
    const resultsArea = document.getElementById('results-area');
    const resultMode = document.getElementById('result-mode');
    const resultAverage = document.getElementById('result-average');
    const resultConsensus = document.getElementById('result-consensus');
    const voteChart = document.getElementById('vote-chart');
    const resetBtn = document.getElementById('reset-btn');
    const currentDeck = document.getElementById('current-deck');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const soundToggle = document.getElementById('sound-toggle');
    const themeSelector = document.getElementById('theme-selector');
    const deckSelector = document.getElementById('deck-selector');
    const saveSettings = document.getElementById('save-settings');
    const settingsAvatarUpload = document.getElementById('settings-avatar-upload');
    const settingsAvatarPreview = document.getElementById('settings-avatar-preview');
    const celebrationOverlay = document.getElementById('celebration-overlay');
    const collisionOverlay = document.getElementById('collision-overlay');
    const collisionContainer = document.getElementById('collision-container');
    const emojiPanel = document.getElementById('emoji-panel');
    const emojiContainer = document.getElementById('emoji-container');
    const punchSound = document.getElementById('punch-sound');
    
    // Punch sounds managed by avatar-effects.js module
    const creditComponent = document.getElementById('credit-component');
    const heartButton = document.getElementById('heart-button');
    const creditCard = document.getElementById('credit-card');
    const spectatorContainer = document.getElementById('spectator-container');
    const joinAsSpectatorCheckbox = document.getElementById('join-as-spectator');

    // App State
    let sessionId = '';

    let user = {
        id: '',
        persistentId: getPersistentUserId(),
        name: '',
        avatar: null
    };
    let participants = {};
    const newlyJoinedIds = new Set();
    let currentCards = [];
    let hasVoted = false;
    let soundEnabled = true;
    let currentTheme = 'monthly';
    let currentDeckType = 'modifiedFibonacci';
    let socket = null;
    let avatarFile = null;
    let heartbeatInterval = null;
    let isAnimating = false;
    let currentSession = null;
    let isSpectator = false;


    // Audio for celebration with error handling
    const celebrationSound = new Audio('/sounds/super-saiyan.mp3');

    // Avatar effects (collision, super saiyan, celebration) - extracted to avatar-effects.js
    const avatarEffects = window.SPP.avatarEffects.create({
        participantsContainer,
        collisionOverlay,
        collisionContainer,
        celebrationOverlay,
        celebrationSound,
        isAnimating: () => isAnimating,
        setAnimating: (v) => { isAnimating = v; },
        isSoundEnabled: () => soundEnabled,
        setSoundEnabled: (v) => { soundEnabled = v; }
    });

    // Credit component
    if (!creditComponent || !heartButton || !creditCard) {
        console.error('Credit component elements not found');
        return;
    }
    // Show credit card on hover
    creditComponent.addEventListener('mouseenter', () => {
        creditCard.classList.add('visible');
    });

    // Hide credit card when mouse leaves
    creditComponent.addEventListener('mouseleave', () => {
        creditCard.classList.remove('visible');
    });

    // Client-side heartbeat to keep connection alive
    setInterval(() => {
        if (socket && socket.connected && !document.hidden) {
            socket.emit('heartbeat');
        }
    }, 30000); // Send heartbeat every 30 seconds

    // Handle window resize to re-render UI state
    window.addEventListener('resize', () => {
        if (currentSession) {
            updateVoteStatus(currentSession.participants);
            renderParticipants(currentSession.participants);
            if (currentSession.votes && Object.keys(currentSession.votes).length > 0) {
                displayResults(currentSession.votes, currentSession.participants);
            }
        }
    });



    // Reset button
    let isResetOnCooldown = false;
    const RESET_COOLDOWN_MS = 1500;

    function triggerResetCooldown() {
        isResetOnCooldown = true;
        resetBtn.disabled = true;
        resetBtn.classList.add('opacity-60', 'cursor-not-allowed');
        setTimeout(() => {
            isResetOnCooldown = false;
            resetBtn.disabled = false;
            resetBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }, RESET_COOLDOWN_MS);
    }

    resetBtn.addEventListener('click', () => {
        if (isResetOnCooldown) {
            console.log('Reset on cooldown, ignoring click');
            return;
        }
        console.log('Reset button clicked, emitting reset-votes event');

        // Button pulse feedback
        resetBtn.classList.add('resetting');
        setTimeout(() => {
            resetBtn.classList.remove('resetting');
        }, 600);

        if (socket && socket.connected) {
            socket.emit('reset-votes', { sessionId, csrfToken: getCSRFToken() });
        }
    });

    // Animations moved to animations.js (window.SPP.animations)
    const playUserLeaveAnimation = window.SPP.animations.playUserLeaveAnimation;
    const playUserJoinAnimation = window.SPP.animations.playUserJoinAnimation;

    function playResetAnimation() {
        window.SPP.animations.playResetAnimation({ soundEnabled });
    }

    // Handle heart button click
    if (heartButton) {
        heartButton.addEventListener('click', function () {
            // Create floating hearts
            createFloatingHearts(this);

            // Redirect to LinkedIn after a short delay
            setTimeout(() => {
                window.open('https://linkedin.com/in/gabrieleguo', '_blank');
            }, 450);
        });

        // Add a subtle bounce effect when clicked
        heartButton.addEventListener('click', function () {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 100);
        });
    }

    // Function to create floating hearts
    function createFloatingHearts(element) {
        const rect = element.getBoundingClientRect();
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];

        for (let i = 0; i < 6; i++) {
            const heart = document.createElement('div');
            heart.className = 'fixed pointer-events-none z-40';
            heart.innerHTML = '<i class="fas fa-heart"></i>';
            heart.style.color = colors[Math.floor(Math.random() * colors.length)];
            heart.style.left = `${rect.left + rect.width / 2}px`;
            heart.style.top = `${rect.top + rect.height / 2}px`;
            heart.style.fontSize = `${Math.random() * 10 + 10}px`;
            heart.style.opacity = '1';
            heart.style.transition = 'all 1s ease-out';
            heart.style.transform = `translate(${(Math.random() - 0.5) * 100}px, ${Math.random() * -50 - 20}px) scale(${Math.random() + 0.5})`;

            document.body.appendChild(heart);

            setTimeout(() => {
                heart.style.opacity = '0';
                heart.style.transform += ` translateY(-50px)`;
            }, 100);

            setTimeout(() => {
                heart.remove();
            }, 1100);
        }
    }

    // Handle audio loading errors
    celebrationSound.addEventListener('error', (e) => {
        console.warn('Error loading celebration sound:', e);
        soundEnabled = false;
    });

    // Handle punch sound loading errors
    punchSound.addEventListener('error', (e) => {
        console.warn('Error loading punch sound:', e);
    });

    // Preload the audio files
    celebrationSound.load();
    punchSound.load();

    // generateSessionId extracted to utils.js

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        if (socket && sessionId) {
            socket.emit('leave-session', sessionId);
            socket.disconnect();
        }
    });

    // Handle login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sessionIdValue = sessionIdInput.value.trim() || generateSessionId();
        const usernameValue = usernameInput.value.trim();

        if (!usernameValue) {
            alert('Please enter your name');
            return;
        }

        sessionId = sessionIdValue;
        user.name = usernameValue;
        user.isSpectator = joinAsSpectatorCheckbox.checked;
        isSpectator = user.isSpectator;
        
        console.log('Checkbox checked:', joinAsSpectatorCheckbox.checked);
        console.log('User object being sent:', user);

        // Upload avatar if selected
        if (avatarFile) {
            try {
                const formData = new FormData();
                formData.append('avatar', avatarFile);
                const response = await fetch('/upload-avatar', {
                    method: 'POST',
                    headers: {
                        'X-CSRF-Token': getCSRFToken()
                    },
                    body: formData
                });
                const data = await response.json();
                if (data.path) {
                    user.avatar = data.path;
                }
            } catch (error) {
                console.error('Error uploading avatar:', error);
            }
        }

        // Initialize socket connection
        if (!socket) {
            socket = io();
            setupSocketListeners();
            startHeartbeat();
            
            // Test socket connection
            setTimeout(() => {
                console.log('Testing socket connection...');
                socket.emit('test');
            }, 1000);
        }

        // Join session
        console.log('Emitting join-session with:', { sessionId, user, csrfToken: getCSRFToken() });
        socket.emit('join-session', {
            sessionId,
            user,
            csrfToken: getCSRFToken()
        });
    });

    // Start heartbeat
    function startHeartbeat() {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (socket && socket.connected && !document.hidden) {
                socket.emit('heartbeat');
            }
        }, 30000);
    }

    // Page Visibility API: handle standby / AFK
    // When tab becomes hidden, heartbeats stop (due to `!document.hidden` check above).
    // Server will remove the user after INACTIVE_TIMEOUT_MS (2 min).
    // When tab becomes visible again, re-join the session to reappear on the table.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('Tab hidden - pausing heartbeat, will be removed if inactive');
            return;
        }

        console.log('Tab visible again - rejoining session');
        if (sessionId && user && user.name && socket) {
            if (!socket.connected) {
                // Reconnect socket if needed
                socket.connect();
            }
            // Send immediate heartbeat and rejoin
            socket.emit('heartbeat');
            socket.emit('join-session', {
                sessionId,
                user,
                csrfToken: getCSRFToken()
            });
        }
    });

    // Create new session
    createSessionBtn.addEventListener('click', () => {
        sessionIdInput.value = generateSessionId();
    });

    // Handle avatar upload
    avatarUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            avatarFile = file;
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = document.createElement('img');
                img.src = event.target.result;
                img.alt = 'Avatar';
                img.className = 'w-full h-full object-cover';
                avatarPreview.innerHTML = '';
                avatarPreview.appendChild(img);
            };
            reader.readAsDataURL(file);
        }
    });

    settingsAvatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file type and size
            if (!file.type.startsWith('image/')) {
                showNotification('Please select an image file', 'error');
                return;
            }
            
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                showNotification('Image file is too large. Please select a file smaller than 5MB', 'error');
                return;
            }
            
            // Upload avatar
            try {
                const formData = new FormData();
                formData.append('avatar', file);
                const response = await fetch('/upload-avatar', {
                    method: 'POST',
                    headers: {
                        'X-CSRF-Token': getCSRFToken()
                    },
                    body: formData
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                if (data.path) {
                    user.avatar = sanitizeInput(data.path);
                    const img = document.createElement('img');
                    img.src = user.avatar;
                    img.alt = 'Avatar';
                    img.className = 'w-full h-full object-cover';
                    settingsAvatarPreview.innerHTML = '';
                    settingsAvatarPreview.appendChild(img);
                    // Update avatar in the current session if already joined
                    if (socket && sessionId && socket.connected) {
                        socket.emit('update-avatar', {
                            sessionId,
                            avatarPath: data.path
                        });
                    }
                    showNotification('Avatar updated successfully!', 'success');
                } else {
                    throw new Error('No path returned from server');
                }
            } catch (error) {
                console.error('Error uploading avatar:', error);
                showNotification('Failed to upload avatar. Please try again.', 'error');
            }
        }
    });

    // Setup socket listeners - extracted to socket-listeners.js
    function setupSocketListeners() {
        window.SPP.socketListeners.register(socket, {
            loginScreen,
            gameScreen,
            sessionIdDisplay,
            currentDeckEl: currentDeck,
            voteCounter,
            voteStatus,
            getSessionId: () => sessionId,
            getUser: () => user,
            getParticipants: () => participants,
            setParticipants: (p) => { participants = p; },
            newlyJoinedIds,
            getCurrentSession: () => currentSession,
            setCurrentSession: (s) => { currentSession = s; },
            setCurrentDeckType: (t) => { currentDeckType = t; },
            setIsSpectator: (v) => { isSpectator = v; },
            isSoundEnabled: () => soundEnabled,
            loadCards,
            renderParticipants,
            updateVoteStatus,
            showResults,
            resetVoting,
            triggerResetCooldown,
            showEmojiReaction,
            triggerCelebration,
            triggerSuperSaiyan,
            animateSmoothPunchBroadcast,
            showReconnectNotification,
            updateConnectionStatus
        });
    }



    // Update vote status display
    function updateVoteStatus(participantsList) {
        const connectedParticipants = Object.values(participantsList || participants).filter(p => p.isConnected && !p.isSpectator);
        const totalConnected = connectedParticipants.length;
        const votedCount = currentSession && currentSession.votes ? Object.keys(currentSession.votes).length : 0;
        
        voteCounter.textContent = `${votedCount}/${totalConnected} votes`;
        
        if (votedCount === 0) {
            voteStatus.textContent = 'Waiting for votes...';
        } else if (votedCount === totalConnected && totalConnected > 0) {
            voteStatus.textContent = 'All votes in! Revealing results...';
        } else {
            const remaining = totalConnected - votedCount;
            voteStatus.textContent = `${remaining} more to vote...`;
        }
    }

    // Render participants around the table
    function renderParticipants() {
        participantsContainer.innerHTML = '';
        spectatorContainer.innerHTML = '';
        
        const participantIds = Object.keys(participants);
        const players = participantIds.filter(id => !participants[id].isSpectator);
        const spectators = participantIds.filter(id => participants[id].isSpectator);
        const totalParticipants = players.length;

        // Get the container dimensions
        const containerRect = participantsContainer.getBoundingClientRect();
        const centerX = containerRect.width / 2;
        const centerY = containerRect.height / 2;

        // Oval dimensions (semi-major and semi-minor axes)
        const radiusX = 220; // Horizontal radius (wider)
        const radiusY = 140; // Vertical radius (shorter)

        // Adjust oval dimensions based on number of participants
        let adjustedRadiusX = radiusX;
        let adjustedRadiusY = radiusY;

        if (totalParticipants >= 8) {
            adjustedRadiusX = radiusX + 20;
            adjustedRadiusY = radiusY + 15;
        } else if (totalParticipants >= 6) {
            adjustedRadiusX = radiusX + 10;
            adjustedRadiusY = radiusY + 8;
        }

        // Adjust radius based on screen size
        if (window.innerWidth < 640) { // Mobile
            adjustedRadiusX *= 0.6;
            adjustedRadiusY *= 0.6;
        } else if (window.innerWidth < 1024) { // Tablet
            adjustedRadiusX *= 0.8;
            adjustedRadiusY *= 0.8;
        }

        // Position players in an oval
        players.forEach((id, index) => {
            const participant = participants[id];
            // Calculate angle for even distribution
            const angle = (index / totalParticipants) * 2 * Math.PI - Math.PI / 2; // Start from top
            // Calculate position on oval
            const x = centerX + Math.cos(angle) * adjustedRadiusX;
            const y = centerY + Math.sin(angle) * adjustedRadiusY;

            const participantEl = document.createElement('div');
            participantEl.className = 'absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300';

            // Position the participant
            participantEl.style.left = `${x}px`;
            participantEl.style.top = `${y}px`;
            participantEl.setAttribute('data-user-id', id);

            // Add click event for collision animation (only for other users)
            if (id !== socket.id) {
                participantEl.style.cursor = 'pointer';
                participantEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!isAnimating) {
                        socket.emit('user-collision', {
                            sessionId,
                            attackerId: socket.id,
                            targetId: id
                        });
                        animateSmoothPunch(socket.id, id);
                    }
                });
            } else {
                // Super Saiyan mode for own user
                let clickCount = 0;
                let clickTimer = null;
                
                participantEl.addEventListener('click', () => {
                    clickCount++;
                    
                    if (clickTimer) clearTimeout(clickTimer);
                    clickTimer = setTimeout(() => {
                        clickCount = 0;
                    }, 5000);
                    
                    if (clickCount >= 20) {
                        console.log('Emitting super-saiyan event to server');
                        socket.emit('super-saiyan', { sessionId, userId: socket.id });
                        
                        clickCount = 0;
                    }
                });
            }

            let avatarContent;
            if (participant.avatar) {
                const img = document.createElement('img');
                img.src = sanitizeInput(participant.avatar);
                img.alt = sanitizeInput(participant.name);
                img.className = 'w-full h-full object-cover';
                avatarContent = img.outerHTML;
            } else {
                avatarContent = `<div class="w-full h-full bg-gray-700 flex items-center justify-center"><i class="fas fa-user text-xl text-gray-500"></i></div>`;
            }

            participantEl.innerHTML = `
            <div class="dbz-participant-card w-16 h-16 rounded-full overflow-hidden shadow-lg border-2 ${id === socket.id ? 'border-yellow-500' : 'border-gray-700'} pointer-events-auto">
                ${avatarContent}
            </div>
            <div class="text-center mt-1 text-xs font-medium participant-name pointer-events-none">${sanitizeInput(participant.name)}</div>
            <div class="vote-indicator hidden text-center mt-1 pointer-events-none">
                <div class="dbz-vote-card inline-block px-3 py-1 rounded-lg font-bold">?</div>
            </div>
        `;

            // Check if this user has voted and add the appropriate class
            if (currentSession && currentSession.votes && currentSession.votes[id]) {
                participantEl.classList.add('user-has-voted');
                const voteIndicator = participantEl.querySelector('.vote-indicator');
                if (voteIndicator) {
                    voteIndicator.classList.remove('hidden');
                    // Only show vote value if voting is complete
                    if (currentSession.showVotes) {
                        voteIndicator.querySelector('.dbz-vote-card').textContent = currentSession.votes[id];
                    } else {
                        voteIndicator.querySelector('.dbz-vote-card').textContent = '?';
                    }
                }
            }

            participantsContainer.appendChild(participantEl);

            // Play fly-in animation for newly joined users (once)
            if (newlyJoinedIds.has(id)) {
                newlyJoinedIds.delete(id);
                playUserJoinAnimation(participantEl);
            }
        });

        // Show/hide spectator area
        const spectatorArea = document.getElementById('spectator-area');
        if (spectators.length === 0) {
            spectatorArea.style.display = 'none';
        } else {
            spectatorArea.style.display = 'flex';
        }

        // Render spectators
        spectators.forEach(id => {
            const participant = participants[id];
            const spectatorEl = document.createElement('div');
            spectatorEl.className = 'spectator-avatar transition-all duration-300';
            spectatorEl.setAttribute('data-user-id', id);
            
            let avatarContent;
            if (participant.avatar) {
                const img = document.createElement('img');
                img.src = sanitizeInput(participant.avatar);
                img.alt = sanitizeInput(participant.name);
                img.className = 'w-full h-full object-cover';
                avatarContent = img.outerHTML;
            } else {
                avatarContent = `<div class="w-full h-full bg-gray-700 flex items-center justify-center"><i class="fas fa-user text-sm text-gray-500"></i></div>`;
            }
            
            spectatorEl.innerHTML = `
                <div class="w-8 h-8 rounded-full overflow-hidden border-2 ${id === socket.id ? 'border-purple-400' : 'border-gray-600'}" title="${sanitizeInput(participant.name)}">
                    ${avatarContent}
                </div>
            `;
            
            spectatorContainer.appendChild(spectatorEl);
        });

        // Add a subtle animation to the table when users join/leave
        const table = document.querySelector('.dbz-table');
        if (table) {
            table.style.transform = 'scale(1.02)';
            setTimeout(() => {
                table.style.transform = 'scale(1)';
            }, 300);
        }
    }

    // showVoteNotification (unused) removed during cleanup

    // Enhanced function to animate collision between users (local)
    // Extracted to avatar-effects.js
    function animateSmoothPunch(attackerId, targetId) {
        avatarEffects.animateSmoothPunch(attackerId, targetId);
    }

    function animateSmoothPunchBroadcast(attackerId, targetId, attackerName, targetName) {
        avatarEffects.animateSmoothPunchBroadcast(attackerId, targetId, attackerName, targetName);
    }

    function showReconnectNotification() {
        // Check if notification already exists
        const existingNotification = document.querySelector('.reconnect-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create a notification element
        const notification = document.createElement('div');
        notification.className = 'reconnect-notification fixed top-4 right-4 bg-orange-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex flex-col space-y-2';
        notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            <span>Connection lost. Attempting to reconnect...</span>
        </div>
        <div class="flex items-center justify-between">
            <span class="text-sm">Session will be preserved</span>
            <button id="manual-reconnect-btn" class="bg-white text-orange-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 transition">
                Reconnect Now
            </button>
        </div>
    `;
        document.body.appendChild(notification);

        // Add event listener to the reconnect button
        document.getElementById('manual-reconnect-btn').addEventListener('click', () => {
            if (socket) {
                socket.connect();
            }
            notification.remove();
        });

        // Auto-remove after successful reconnection
        const checkConnection = setInterval(() => {
            if (socket && socket.connected) {
                notification.remove();
                clearInterval(checkConnection);
            }
        }, 1000);
    }

    // reconnectToSession (unused - reconnection handled by socket.io auto-reconnect) removed during cleanup

    function updateConnectionStatus(status) {
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');

        if (!indicator || !text) return;

        switch (status) {
            case 'connected':
                indicator.className = 'w-2 h-2 rounded-full bg-green-500 mr-1';
                text.textContent = 'Connected';
                break;
            case 'disconnected':
                indicator.className = 'w-2 h-2 rounded-full bg-red-500 mr-1';
                text.textContent = 'Disconnected';
                break;
            case 'connecting':
                indicator.className = 'w-2 h-2 rounded-full bg-yellow-500 mr-1 animate-pulse';
                text.textContent = 'Connecting...';
                break;
        }
    }

    function startConnectionCheck() {
        setInterval(() => {
            if (socket && !socket.connected && !isReconnecting) {
                updateConnectionStatus('disconnected');
                showReconnectNotification();
            }
        }, 5000); // Check every 5 seconds
    }

    startConnectionCheck();

    // Load voting cards with dealing animation
    function loadCards(cards) {
        currentCards = cards;
        cardsContainer.innerHTML = '';
        
        if (isSpectator) {
            cardsContainer.classList.add('hidden');
            return;
        }

        cards.forEach((card, index) => {
            const cardEl = document.createElement('button');
            cardEl.className = 'dbz-card-btn rounded-lg shadow-lg transform transition-all duration-200 card-dealing';

            // Add special class for longer text values
            if (card.length > 2 || card === 'XXL' || card === 'XXXL') {
                cardEl.classList.add('long-text');
            }

            cardEl.textContent = card;
            cardEl.addEventListener('click', () => submitVote(card));
            cardEl.style.animationDelay = `${index * 0.5}s`;
            cardsContainer.appendChild(cardEl);

            // Remove animation class after animation completes
            setTimeout(() => {
                cardEl.classList.remove('card-dealing');
            }, 400 + index * 50);
        });
    }

    // Add a window resize handler to update the layout when the screen size changes
    // Update the existing window resize handler
    window.addEventListener('resize', () => {
        // Debounce the resize event
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
            // Re-render participants to adjust their positions
            if (Object.keys(participants).length > 0) {
                renderParticipants();
            }
            // Re-load cards to adjust their sizes
            if (currentCards.length > 0) {
                loadCards(currentCards);
            }

        }, 250);
    });

    window.addEventListener('beforeunload', () => {
        if (socket && sessionId) {
            // Tell the server that the user is intentionally leaving the session
            socket.emit('leave-session', sessionId);
            socket.disconnect();
        }

        // Only clean up heartbeat interval
        if (heartbeatInterval) clearInterval(heartbeatInterval);
    });

    // Submit vote (or change vote)
    function submitVote(value) {
        // Don't allow vote changes if voting is complete
        if (hasVoted && cardsContainer.classList.contains('hidden')) {
            return;
        }

        if (socket && socket.connected) {
            socket.emit('submit-vote', { sessionId, vote: value, csrfToken: getCSRFToken() });
        }

        // Only show the current user's vote, not others
        const userVoteIndicator = document.querySelector(`[data-user-id="${socket.id}"] .vote-indicator`);
        if (userVoteIndicator) {
            userVoteIndicator.classList.remove('hidden');
            userVoteIndicator.querySelector('.dbz-vote-card').textContent = value;
        }

        // Add visual feedback for the selected card
        document.querySelectorAll('.dbz-card-btn').forEach(card => {
            card.classList.remove('ring-2', 'ring-yellow-400');
            if (card.textContent === value) {
                card.classList.add('ring-2', 'ring-yellow-400');
            }
        });

        // Set flag that user has voted
        hasVoted = true;
    }

    // Show voting results
    function showResults(votes, results) {
        cardsContainer.classList.add('hidden');
        resultsArea.classList.remove('hidden');

        // Update result values
        resultMode.textContent = results.mode || '-';
        resultAverage.textContent = results.average || '-';
        resultConsensus.textContent = results.consensus ? 'YES' : 'NO';
        resultConsensus.className = results.consensus ?
            'text-2xl font-bold text-green-500' :
            'text-2xl font-bold text-red-500';

        // Show all votes with participant names
        Object.keys(votes).forEach(userId => {
            const participantEl = document.querySelector(`[data-user-id="${userId}"]`);
            if (participantEl) {
                const voteIndicator = participantEl.querySelector('.vote-indicator');
                if (voteIndicator) {
                    voteIndicator.classList.remove('hidden');
                    voteIndicator.querySelector('.dbz-vote-card').textContent = votes[userId];

                    // Add animation to reveal the vote
                    voteIndicator.classList.add('reveal-vote');
                    setTimeout(() => {
                        voteIndicator.classList.remove('reveal-vote');
                    }, 500);
                }
            }
        });

        // Create and display the bar chart
        createVoteChart(votes);
        voteStatus.textContent = 'Voting complete!';

        // Create detailed vote breakdown
        createVoteBreakdown(votes);

        // Set flag that voting is complete
        hasVoted = true;
    }

    function createVoteBreakdown(votes) {
        // Check if breakdown container already exists
        let breakdownContainer = document.getElementById('vote-breakdown');

        // If it doesn't exist, create it
        if (!breakdownContainer) {
            breakdownContainer = document.createElement('div');
            breakdownContainer.id = 'vote-breakdown';
            breakdownContainer.className = 'mt-4 w-full';

            // Insert it after the vote chart
            const voteChart = document.getElementById('vote-chart');
            if (voteChart && voteChart.parentNode) {
                voteChart.parentNode.insertBefore(breakdownContainer, voteChart.nextSibling);
            } else {
                resultsArea.appendChild(breakdownContainer);
            }
        } else {
            breakdownContainer.innerHTML = '';
        }

        // Create title
        const title = document.createElement('h3');
        title.className = 'text-lg font-semibold mb-3 text-center';
        title.textContent = 'Individual Votes';
        breakdownContainer.appendChild(title);

        // Create single-row container for votes
        const votesRow = document.createElement('div');
        votesRow.className = 'flex flex-row overflow-x-auto pb-2 space-x-2 md:space-x-3 lg:space-x-4 scrollbar-hide';

        // Sort participants by name for consistent display
        const sortedVotes = Object.entries(votes).sort((a, b) => {
            const nameA = participants[a[0]]?.name || 'Unknown';
            const nameB = participants[b[0]]?.name || 'Unknown';
            return nameA.localeCompare(nameB);
        });

        // Create static vote cards in single row
        sortedVotes.forEach(([userId, vote]) => {
            const participant = participants[userId];
            const voteCard = document.createElement('div');
            voteCard.className = 'flex-shrink-0 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700 p-2';

            // Create a compact vertical layout for each vote
            const cardContent = document.createElement('div');
            cardContent.className = 'flex flex-col items-center space-y-1';

            // Avatar section
            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'w-10 h-10 rounded-full overflow-hidden bg-gray-700 border border-gray-600 flex-shrink-0';

            if (participant?.avatar) {
                const img = document.createElement('img');
                img.src = sanitizeInput(participant.avatar);
                img.alt = sanitizeInput(participant.name);
                img.className = 'w-full h-full object-cover';
                avatarContainer.innerHTML = '';
                avatarContainer.appendChild(img);
            } else {
                avatarContainer.innerHTML = '<i class="fas fa-user text-gray-500 w-full h-full flex items-center justify-center"></i>';
            }

            // Name section (compact)
            const nameText = document.createElement('div');
            nameText.className = 'text-xs font-medium text-gray-300 text-center truncate max-w-[4rem]';
            const safeName = sanitizeInput(participant?.name || 'Unknown');
            setSafeContent(nameText, safeName);
            nameText.title = safeName;

            // Vote value section
            const voteValue = document.createElement('div');
            voteValue.className = `flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${vote === '?'
                ? 'bg-gray-700 text-gray-300'
                : 'bg-gradient-to-br from-yellow-400 to-orange-500 text-gray-900'
                }`;
            voteValue.textContent = vote;

            // Assemble the card content
            cardContent.appendChild(avatarContainer);
            cardContent.appendChild(nameText);
            cardContent.appendChild(voteValue);

            voteCard.appendChild(cardContent);
            votesRow.appendChild(voteCard);
        });

        breakdownContainer.appendChild(votesRow);

        // Add compact summary statistics
        const summaryStats = document.createElement('div');
        summaryStats.className = 'mt-4 p-3 bg-gray-800 bg-opacity-30 rounded-lg border border-gray-700';

        const totalVotes = Object.keys(votes).length;
        const connectedUsers = Object.values(participants).filter(p => p.isConnected).length;
        const questionMarks = Object.values(votes).filter(vote => vote === '?').length;

        summaryStats.innerHTML = `
        <div class="flex justify-around items-center">
            <div class="text-center">
                <div class="text-lg font-bold text-yellow-400">${totalVotes}</div>
                <div class="text-xs text-gray-300">Votes</div>
            </div>
            <div class="text-center">
                <div class="text-lg font-bold text-green-400">${connectedUsers}</div>
                <div class="text-xs text-gray-300">Players</div>
            </div>
            <div class="text-center">
                <div class="text-lg font-bold text-blue-400">${questionMarks}</div>
                <div class="text-xs text-gray-300">Uncertain</div>
            </div>
        </div>
    `;

        breakdownContainer.appendChild(summaryStats);
    }

    // Helper function to show notifications - extracted to utils.js (imported at top)

    // New function to create the vote chart
    function createVoteChart(votes) {
        // Clear previous chart
        voteChart.innerHTML = '';

        // Count votes for each value
        const voteCounts = {};
        Object.values(votes).forEach(vote => {
            if (vote !== '?') { // Exclude question marks
                voteCounts[vote] = (voteCounts[vote] || 0) + 1;
            }
        });

        // Get total number of valid votes
        const totalVotes = Object.values(votes).filter(vote => vote !== '?').length;

        // If no valid votes, show a message
        if (totalVotes === 0) {
            voteChart.innerHTML = '<div class="text-gray-400">No valid votes to display</div>';
            return;
        }

        // Sort vote values for consistent display
        const sortedVoteValues = Object.keys(voteCounts).sort((a, b) => {
            // If both are numbers, compare numerically
            if (!isNaN(a) && !isNaN(b)) {
                return parseFloat(a) - parseFloat(b);
            }
            // Otherwise, compare as strings
            return a.localeCompare(b);
        });

        // Create a bar for each vote value
        sortedVoteValues.forEach(value => {
            const count = voteCounts[value];
            const percentage = Math.round((count / totalVotes) * 100);

            // Create bar container
            const barContainer = document.createElement('div');
            barContainer.className = 'vote-bar-container';

            // Create label
            const label = document.createElement('div');
            label.className = 'vote-label';
            label.textContent = value;

            // Create bar wrapper
            const barWrapper = document.createElement('div');
            barWrapper.className = 'vote-bar-wrapper';

            // Create bar
            const bar = document.createElement('div');
            bar.className = 'vote-bar';
            bar.style.width = '0%'; // Start with 0 width for animation

            // Add vote count to the bar if there's enough space
            if (percentage > 15) { // Only show count if bar is wide enough
                bar.textContent = count;
            }

            // Create count display
            const countDisplay = document.createElement('div');
            countDisplay.className = 'vote-count';
            countDisplay.textContent = `${count} (${percentage}%)`;

            // Assemble the bar
            barWrapper.appendChild(bar);
            barContainer.appendChild(label);
            barContainer.appendChild(barWrapper);
            barContainer.appendChild(countDisplay);
            voteChart.appendChild(barContainer);

            // Animate the bar after a short delay
            setTimeout(() => {
                bar.style.width = `${percentage}%`;
            }, 100);
        });

        // Add a summary of question mark votes if any
        const questionMarkVotes = Object.values(votes).filter(vote => vote === '?').length;
        if (questionMarkVotes > 0) {
            const summaryContainer = document.createElement('div');
            summaryContainer.className = 'mt-4 text-sm text-gray-400';
            summaryContainer.textContent = `${questionMarkVotes} participant(s) voted "?"`;
            voteChart.appendChild(summaryContainer);
        }
    }

    // Reset voting
    function resetVoting() {
        hasVoted = false;
        cardsContainer.classList.remove('hidden');
        resultsArea.classList.add('hidden');

        // Clear the current session data
        if (currentSession) {
            currentSession.votes = {};
            currentSession.showVotes = false;
            currentSession.results = {};
        }

        // Clear the chart
        voteChart.innerHTML = '';

        // Reset visual indicators on cards
        document.querySelectorAll('.dbz-card-btn').forEach(card => {
            card.disabled = false;
            card.classList.remove('opacity-50', 'cursor-not-allowed', 'ring-2', 'ring-yellow-400');
        });

        // Hide all vote indicators and remove voted class
        document.querySelectorAll('.vote-indicator').forEach(indicator => {
            indicator.classList.add('hidden');
            indicator.querySelector('.dbz-vote-card').textContent = '?';
        });

        // Remove the 'has-voted' class from all participants
        document.querySelectorAll('.user-has-voted').forEach(el => {
            el.classList.remove('user-has-voted');
        });

        voteStatus.textContent = 'Waiting for votes...';
        voteCounter.textContent = '0/0 votes';
    }

    // Settings modal
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
        soundToggle.checked = soundEnabled;
        themeSelector.value = currentTheme;
        deckSelector.value = currentDeckType;

        // Update avatar preview
        if (user.avatar) {
            const img = document.createElement('img');
            img.src = sanitizeInput(user.avatar);
            img.alt = 'Avatar';
            img.className = 'w-full h-full object-cover';
            settingsAvatarPreview.innerHTML = '';
            settingsAvatarPreview.appendChild(img);
        }
    });

    closeSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    saveSettings.addEventListener('click', () => {
        soundEnabled = soundToggle.checked;
        const newTheme = themeSelector.value;
        currentTheme = newTheme;

        // Check if deck has changed
        const newDeckType = deckSelector.value;
        if (newDeckType !== currentDeckType && socket && sessionId) {
            console.log(`Deck changed from ${currentDeckType} to ${newDeckType}`);
            // Emit the change deck event to the server
            socket.emit('change-deck', { sessionId, deckType: newDeckType });
            // Update local deck type (will be confirmed when server responds)
            currentDeckType = newDeckType;
        }

        applyTheme(currentTheme);
        settingsModal.classList.add('hidden');
    });

    // Theme handling moved to themes.js
    const applyTheme = window.SPP.themes.applyTheme;

    // Celebration extracted to avatar-effects.js
    function triggerCelebration() {
        avatarEffects.triggerCelebration();
    }

    // Emoji reactions
    document.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const emoji = btn.dataset.emoji;

            // Check if shift key is pressed
            if (e.shiftKey) {
                // Get all connected users except the current user
                const connectedUsers = Object.values(participants).filter(p => p.isConnected && p.id !== socket.id);
                if (connectedUsers.length > 0) {
                    // Select a random user
                    const randomUser = connectedUsers[Math.floor(Math.random() * connectedUsers.length)];
                    console.log(`Throwing emoji ${emoji} at ${randomUser.name}`);
                    // Send emoji to the specific user
                    socket.emit('send-emoji', {
                        sessionId,
                        emoji,
                        targetUserId: randomUser.id
                    });
                }
            } else {
                // Send to everyone
                socket.emit('send-emoji', {
                    sessionId,
                    emoji
                });
            }
        });
    });

    // Show emoji reaction
    function showEmojiReaction(data) {
        const { emoji, from, to } = data;
        const emojiEl = document.createElement('div');
        emojiEl.className = 'absolute text-4xl animate-emoji';

        // Position emoji
        if (to) {
            // If targeted, position at the target participant
            const participantEl = document.querySelector(`[data-user-id="${to}"]`);
            if (participantEl) {
                const rect = participantEl.getBoundingClientRect();
                const containerRect = participantsContainer.getBoundingClientRect();
                emojiEl.style.left = `${rect.left - containerRect.left + rect.width / 2}px`;
                emojiEl.style.top = `${rect.top - containerRect.top}px`;
            } else {
                // Fallback to random position
                emojiEl.style.left = `${Math.random() * 80 + 10}%`;
                emojiEl.style.top = `${Math.random() * 80 + 10}%`;
            }
        } else {
            // Random position
            emojiEl.style.left = `${Math.random() * 80 + 10}%`;
            emojiEl.style.top = `${Math.random() * 80 + 10}%`;
        }

        emojiEl.textContent = emoji;

        // Add sender name if targeted
        if (to) {
            const nameEl = document.createElement('div');
            nameEl.className = 'text-xs text-center mt-1';
            nameEl.textContent = `from ${from.name}`;
            emojiEl.appendChild(nameEl);
        }

        emojiContainer.appendChild(emojiEl);

        // Remove after animation
        setTimeout(() => {
            emojiEl.remove();
        }, 3000);
    }

    // Add emoji panel toggle for mobile
    let emojiPanelExpanded = false;

    // Create a toggle button for mobile
    const emojiToggle = document.createElement('button');
    emojiToggle.className = 'fixed bottom-4 right-4 bg-gray-900 bg-opacity-80 rounded-full p-3 shadow-lg z-40 sm:hidden';
    emojiToggle.innerHTML = '<i class="fas fa-smile text-yellow-500"></i>';
    document.body.appendChild(emojiToggle);

    // Toggle emoji panel on mobile
    emojiToggle.addEventListener('click', () => {
        emojiPanelExpanded = !emojiPanelExpanded;
        if (emojiPanelExpanded) {
            emojiPanel.style.maxWidth = '200px';
            emojiPanel.style.maxHeight = '300px';
            emojiToggle.style.transform = 'rotate(180deg)';
        } else {
            emojiPanel.style.maxWidth = '50px';
            emojiPanel.style.maxHeight = '50px';
            emojiToggle.style.transform = 'rotate(0deg)';
        }
    });

    // Hide toggle button on larger screens
    function checkScreenSize() {
        if (window.innerWidth >= 640) {
            emojiToggle.style.display = 'none';
            emojiPanel.style.maxWidth = '';
            emojiPanel.style.maxHeight = '';
        } else {
            emojiToggle.style.display = 'block';
            if (!emojiPanelExpanded) {
                emojiPanel.style.maxWidth = '50px';
                emojiPanel.style.maxHeight = '50px';
            }
        }
    }

    // Check screen size on load and resize
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    // Music Player extracted to music-player.js (window.SPP.musicPlayer)
    // fadeOutAudio imported at top via utils destructuring
    const musicPlayer = window.SPP.musicPlayer;

    // Initialize the music player
    musicPlayer.init();

    // Card animation system
    function createFloatingCard() {
        const isHalloween = document.body.classList.contains('halloween-theme');
        if (isHalloween) return;
        
        const cards = ['0','0.5', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '∞', '☕', 'L', 'G', 'F', 'D', 'S', 'M', '✨'];
        const types = ['', 'sparkle', 'energy'];
        
        const card = document.createElement('div');
        card.className = `floating-card ${types[Math.floor(Math.random() * types.length)]}`;
        card.textContent = cards[Math.floor(Math.random() * cards.length)];
        card.style.top = `${Math.random() * 80 + 10}%`;
        
        document.body.appendChild(card);
        
        setTimeout(() => card.remove(), 8000);
    }

    // Super Saiyan effect extracted to avatar-effects.js
    function triggerSuperSaiyan(userId) {
        avatarEffects.triggerSuperSaiyan(userId);
    }

    // Start card animations with random intervals
    function scheduleNextCard() {
        setTimeout(() => {
            createFloatingCard();
            scheduleNextCard();
        }, 30000 + Math.random() * 270000);
    }
    scheduleNextCard();

    // Halloween/Christmas element schedulers moved to themes.js

    // Theme selector handler
    if (themeSelector) {
        themeSelector.addEventListener('change', function() {
            const theme = this.value;
            applyTheme(theme);
            localStorage.setItem('selectedTheme', theme);
        });
        
        // Set monthly theme as default
        const savedTheme = localStorage.getItem('selectedTheme') || 'monthly';
        themeSelector.value = savedTheme;
        applyTheme(savedTheme);
    }
});
