document.addEventListener('DOMContentLoaded', () => {
    // Input sanitization utility
    function sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.replace(/[<>"'&]/g, function(match) {
            const map = {
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#x27;',
                '&': '&amp;'
            };
            return map[match];
        });
    }

    // CSRF token generation and validation
    let csrfToken = null;
    function generateCSRFToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function getCSRFToken() {
        if (!csrfToken) {
            csrfToken = generateCSRFToken();
            sessionStorage.setItem('csrfToken', csrfToken);
        }
        return csrfToken;
    }

    // Initialize CSRF token
    csrfToken = sessionStorage.getItem('csrfToken') || generateCSRFToken();
    sessionStorage.setItem('csrfToken', csrfToken);

    // Safe DOM content setter
    function setSafeContent(element, content) {
        if (!element) return;
        element.textContent = content; // Always use textContent to prevent XSS
    }

    // Safe HTML creation with sanitization
    function createSafeElement(tag, textContent = '', className = '') {
        const element = document.createElement(tag);
        if (textContent) element.textContent = sanitizeInput(textContent);
        if (className) element.className = className;
        return element;
    }

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
    const miniGameModal = document.getElementById('mini-game-modal');
    const punchSound = document.getElementById('punch-sound');
    const creditComponent = document.getElementById('credit-component');
    const heartButton = document.getElementById('heart-button');
    const creditCard = document.getElementById('credit-card');
    const spectatorContainer = document.getElementById('spectator-container');
    const joinAsSpectatorCheckbox = document.getElementById('join-as-spectator');

    // App State
    let sessionId = '';
    let user = {
        id: '',
        name: '',
        avatar: null
    };
    let participants = {};
    let currentCards = [];
    let hasVoted = false;
    let soundEnabled = true;
    let currentTheme = 'dbz';
    let currentDeckType = 'modifiedFibonacci';
    let socket = null;
    let avatarFile = null;
    let heartbeatInterval = null;
    let isAnimating = false;
    let currentSession = null;
    let isSpectator = false;


    // Audio for celebration with error handling
    const celebrationSound = new Audio('/sounds/super-saiyan.mp3');

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
        if (socket && socket.connected) {
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
    resetBtn.addEventListener('click', () => {
        console.log('Reset button clicked, emitting reset-votes event');

        // Add visual feedback
        resetBtn.classList.add('animate-pulse');
        setTimeout(() => {
            resetBtn.classList.remove('animate-pulse');
        }, 1000);

        if (socket && socket.connected) {
            socket.emit('reset-votes', { sessionId, csrfToken: getCSRFToken() });
        }
    });

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

    // Generate a random session ID
    function generateSessionId() {
        return Math.random().toString(36).substring(2, 9).toUpperCase();
    }

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
            if (socket && socket.connected) {
                socket.emit('heartbeat');
            }
        }, 30000);
    }

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

    // Setup socket listeners
    function setupSocketListeners() {
        socket.on('session-joined', (data) => {
            const { session, cardDecks } = data;
            // Update UI
            loginScreen.classList.add('hidden');
            gameScreen.classList.remove('hidden');
            setSafeContent(sessionIdDisplay, sanitizeInput(sessionId));

            // Store the current session globally
            currentSession = session;

            // Set current deck type and display
            currentDeckType = session.currentDeck;
            currentDeck.textContent = currentDeckType === 'fibonacci' ? 'Fibonacci' :
                currentDeckType === 'modifiedFibonacci' ? 'Modified Fibonacci' : 'T-shirt Sizes';

            // Load cards
            loadCards(cardDecks[currentDeckType]);

            // Update participants
            participants = session.users;
            isSpectator = session.users[socket.id]?.isSpectator || false;
            renderParticipants();
            updateVoteStatus(participants);

            // Show existing votes if any
            if (session.showVotes && session.results) {
                showResults(session.votes, session.results);
            }
        });

        socket.on('user-joined', (newUser) => {
            participants[newUser.id] = newUser;
            if (currentSession) {
                currentSession.participants = participants;
            }
            renderParticipants();
            updateVoteStatus(participants);
        });



        socket.on('user-left', (userId) => {
            if (participants[userId]) {
                delete participants[userId];
                if (currentSession) {
                    currentSession.participants = participants;
                }
                renderParticipants();
                updateVoteStatus(participants);
            }
        });

        socket.on('user-disconnected', (userId) => {
            if (participants[userId]) {
                participants[userId].isConnected = false;
                renderParticipants();
            }
        });

        socket.on('avatar-updated', (data) => {
            const { userId, avatarPath } = data;
            if (participants[userId]) {
                participants[userId].avatar = avatarPath;
                renderParticipants();
            }
        });

        // Add this to your setupSocketListeners function
        socket.on('all-votes-in', () => {
            voteStatus.textContent = 'All votes in! Revealing results...';
        });

        // Update the vote-updated event handler
        socket.on('vote-updated', (data) => {
            const { userId, vote, voterName } = data;

            // Update current session state
            if (currentSession) {
                if (!currentSession.votes) currentSession.votes = {};
                currentSession.votes[userId] = vote;
            }

            // Find the participant element
            const participantEl = document.querySelector(`[data-user-id="${userId}"]`);
            if (participantEl) {
                const voteIndicator = participantEl.querySelector('.vote-indicator');
                if (voteIndicator) {
                    // Show the vote indicator but hide the vote value
                    voteIndicator.classList.remove('hidden');
                    voteIndicator.querySelector('.dbz-vote-card').textContent = '?';

                    // Add a visual indicator that this user has voted
                    participantEl.classList.add('user-has-voted');
                }
            }

            // Update vote status
            updateVoteStatus(participants);

            // Update card selection visual for the current user
            if (userId === socket.id) {
                document.querySelectorAll('.dbz-card-btn').forEach(card => {
                    card.classList.remove('ring-2', 'ring-yellow-400');
                    if (card.textContent === vote) {
                        card.classList.add('ring-2', 'ring-yellow-400');
                    }
                });
            }
        });

        // Update the voting-complete event handler
        socket.on('voting-complete', (data) => {
            const { votes, results } = data;

            // Update the current session state
            if (currentSession) {
                currentSession.votes = votes;
                currentSession.showVotes = true;
                currentSession.results = results;
            }

            // Update vote counter to show the correct total
            const totalVotes = Object.keys(votes).length;
            const totalConnected = Object.values(participants).filter(p => p.isConnected).length;
            voteCounter.textContent = `${totalVotes}/${totalConnected} votes`;

            // Show all vote values now that voting is complete
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

            // Show results (which will reveal all votes)
            showResults(votes, results);

            // Disable all cards to prevent further voting
            document.querySelectorAll('.dbz-card-btn').forEach(card => {
                card.disabled = true;
                card.classList.add('opacity-50', 'cursor-not-allowed');
            });
        });

        // Update the votes-reset event handler
        socket.on('votes-reset', () => {
            console.log('Received votes-reset event from server');
            resetVoting();

            // Update the current session state
            if (currentSession) {
                currentSession.votes = {};
                currentSession.showVotes = false;
                currentSession.results = {};
            }

            // Show a notification that voting has been reset
            showNotification('Voting has been reset! You can now vote again.', 'success');
        });

        socket.on('vote-count-updated', (data) => {
            const { current, total } = data;
            voteCounter.textContent = `${current}/${total} votes`;

            // Update status text with more context
            if (current === 0) {
                voteStatus.textContent = 'Waiting for votes...';
            } else if (current === total) {
                voteStatus.textContent = 'All votes in! Revealing results...';
            } else {
                const remaining = total - current;
                voteStatus.textContent = `${remaining} more to vote...`;
            }
        });

        socket.on('voting-complete', (data) => {
            const { votes, results } = data;

            // Update vote counter to show the correct total
            const totalVotes = Object.keys(votes).length;
            const totalConnected = Object.values(participants).filter(p => p.isConnected).length;
            voteCounter.textContent = `${totalVotes}/${totalConnected} votes`;

            // Show all vote values now that voting is complete
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

            // Show results (which will reveal all votes)
            showResults(votes, results);

            // Disable all cards to prevent further voting
            document.querySelectorAll('.dbz-card-btn').forEach(card => {
                card.disabled = true;
                card.classList.add('opacity-50', 'cursor-not-allowed');
            });
        });

        socket.on('voting-closed', () => {
            // Show a notification that voting is closed
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
            notification.textContent = 'Voting is closed! Please wait for the next round.';
            document.body.appendChild(notification);

            // Remove notification after 3 seconds
            setTimeout(() => {
                notification.remove();
            }, 3000);
        });

        socket.on('votes-reset', () => {
            console.log('Received votes-reset event from server');
            resetVoting();

            // Show a notification that voting has been reset
            showNotification('Voting has been reset! You can now vote again.', 'success');
        });

        socket.on('deck-changed', (data) => {
            const { deckType, cards } = data;
            console.log(`Deck changed to ${deckType}`);
            // Update current deck type and display
            currentDeckType = deckType;
            currentDeck.textContent = deckType === 'fibonacci' ? 'Fibonacci' :
                deckType === 'modifiedFibonacci' ? 'Modified Fibonacci' : 'T-shirt Sizes';
            // Load new cards
            loadCards(cards);
            resetVoting();
        });

        socket.on('emoji-received', (data) => {
            showEmojiReaction(data);
        });

        socket.on('celebrate-consensus', () => {
            triggerCelebration();
        });

        socket.on('collision-animation', (data) => {
            const { attackerId, targetId, attackerName, targetName } = data;
            animateSmoothPunchBroadcast(attackerId, targetId, attackerName, targetName);
        });

        socket.on('super-saiyan-mode', (data) => {
            console.log('Received super-saiyan-mode from server:', data);
            const { userId } = data;
            triggerSuperSaiyan(userId);
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            updateConnectionStatus('disconnected');
            showNotification('Failed to connect to the server. Please try again.', 'error');
        });

        socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);

            // Only show reconnection notification for unexpected disconnections
            if (reason !== 'io client disconnect') {
                showReconnectNotification();

                // Attempt to reconnect automatically after 5 seconds
                setTimeout(() => {
                    if (!socket.connected) {
                        console.log('Attempting to reconnect...');
                        socket.connect();
                    }
                }, 5000);
            }
        });

        // Handle reconnection success
        socket.on('connect', () => {
            console.log('Reconnected to server');

            // Hide any reconnection notification
            const notification = document.querySelector('.reconnect-notification');
            if (notification) {
                notification.remove();
            }

            // Rejoin the session if we have one
            if (sessionId && user.name) {
                console.log('Rejoining session:', sessionId);
                console.log('Rejoining with user:', user);
                socket.emit('join-session', {
                    sessionId,
                    user,
                    csrfToken: getCSRFToken()
                });
            }
        });

        socket.on('reconnect', () => {
            updateConnectionStatus('connected');
        });

        socket.on('reconnect_attempt', () => {
            updateConnectionStatus('connecting');
        });

        socket.on('reconnect_failed', () => {
            updateConnectionStatus('disconnected');
        });

        // Handle server errors
        socket.on('error', (data) => {
            console.error('Server error:', data.message);
            showNotification(data.message || 'An error occurred', 'error');
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
            participantEl.className = `absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${participant.isConnected ? '' : 'opacity-50'}`;

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
                <div class="w-8 h-8 rounded-full overflow-hidden border-2 ${id === socket.id ? 'border-purple-400' : 'border-gray-600'} ${participant.isConnected ? '' : 'opacity-50'}" title="${sanitizeInput(participant.name)}">
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

    function showVoteNotification(voterName) {
        // Create a subtle notification
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-800 bg-opacity-90 text-white px-3 py-2 rounded-lg shadow-lg z-40 transition-all duration-300';
        notification.textContent = `${voterName} has voted`;

        document.body.appendChild(notification);

        // Remove after 2 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translate(-50%, 10px)';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 2000);
    }

    // Enhanced function to animate collision between users (local)
    function animateSmoothPunch(attackerId, targetId) {
        if (isAnimating) return;
        isAnimating = true;

        const attackerEl = document.querySelector(`[data-user-id="${attackerId}"]`);
        const targetEl = document.querySelector(`[data-user-id="${targetId}"]`);

        if (!attackerEl || !targetEl) {
            isAnimating = false;
            return;
        }

        // Get positions relative to the container
        const containerRect = participantsContainer.getBoundingClientRect();
        const attackerRect = attackerEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        // Calculate positions relative to container
        const startX = attackerRect.left - containerRect.left + attackerRect.width / 2;
        const startY = attackerRect.top - containerRect.top + attackerRect.height / 2;
        const targetX = targetRect.left - containerRect.left + targetRect.width / 2;
        const targetY = targetRect.top - containerRect.top + targetRect.height / 2;

        // Set CSS variables for animation
        attackerEl.style.setProperty('--start-x', '0px');
        attackerEl.style.setProperty('--start-y', '0px');
        attackerEl.style.setProperty('--target-x', `${targetX - startX}px`);
        attackerEl.style.setProperty('--target-y', `${targetY - startY}px`);

        // Create motion trail effect
        createMotionTrail(startX, startY, targetX, targetY);

        // Add smooth animation class
        attackerEl.classList.add('animate-smooth-punch');

        // Play punch sound with slight delay for impact timing
        if (soundEnabled && punchSound) {
            setTimeout(() => {
                try {
                    const punchSoundClone = punchSound.cloneNode(true);
                    const playPromise = punchSoundClone.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.warn('Error playing punch sound:', error);
                        });
                    }
                } catch (error) {
                    console.warn('Error creating punch sound clone:', error);
                }
            }, 600); // Time to reach the target (50% of 1.2s)
        }

        // Create quick screen flash effect
        const screenFlash = document.createElement('div');
        screenFlash.className = 'quick-flash';
        document.body.appendChild(screenFlash);

        // Remove screen flash after animation
        setTimeout(() => {
            screenFlash.remove();
        }, 400);

        // Create impact burst at target position
        setTimeout(() => {
            const effect = document.createElement('div');
            effect.className = 'impact-burst';
            effect.style.left = `${targetX - 50}px`;
            effect.style.top = `${targetY - 50}px`;
            participantsContainer.appendChild(effect);

            // Add impact shake to target
            targetEl.classList.add('animate-impact-shake');

            // Create enhanced impact particles
            createImpactParticles(targetX, targetY);

            // Create punch text
            const punchText = document.createElement('div');
            punchText.className = 'punch-text';
            punchText.textContent = 'POW!';
            punchText.style.left = `${targetX}px`;
            punchText.style.top = `${targetY - 50}px`;
            participantsContainer.appendChild(punchText);

            // Remove effect after animation completes
            setTimeout(() => {
                effect.remove();
                targetEl.classList.remove('animate-impact-shake');
                punchText.remove();
            }, 800);
        }, 600); // Timing to match the collision animation (50% of 1.2s)

        // Remove animation class after animation completes
        setTimeout(() => {
            attackerEl.classList.remove('animate-smooth-punch');
            isAnimating = false;
        }, 1200);
    }

    // New function to animate collision broadcast from other users
    function animateSmoothPunchBroadcast(attackerId, targetId, attackerName, targetName) {
        if (isAnimating) return;
        isAnimating = true;

        const attackerEl = document.querySelector(`[data-user-id="${attackerId}"]`);
        const targetEl = document.querySelector(`[data-user-id="${targetId}"]`);

        if (!attackerEl || !targetEl) {
            isAnimating = false;
            return;
        }

        // Get positions relative to the container
        const containerRect = participantsContainer.getBoundingClientRect();
        const attackerRect = attackerEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        // Calculate positions relative to container
        const startX = attackerRect.left - containerRect.left + attackerRect.width / 2;
        const startY = attackerRect.top - containerRect.top + attackerRect.height / 2;
        const targetX = targetRect.left - containerRect.left + targetRect.width / 2;
        const targetY = targetRect.top - containerRect.top + targetRect.height / 2;

        // Set CSS variables for animation
        attackerEl.style.setProperty('--start-x', '0px');
        attackerEl.style.setProperty('--start-y', '0px');
        attackerEl.style.setProperty('--target-x', `${targetX - startX}px`);
        attackerEl.style.setProperty('--target-y', `${targetY - startY}px`);

        // Create motion trail effect
        createMotionTrail(startX, startY, targetX, targetY);

        // Add smooth animation class
        attackerEl.classList.add('animate-smooth-punch');

        // Play punch sound with slight delay for impact timing
        if (soundEnabled && punchSound) {
            setTimeout(() => {
                try {
                    const punchSoundClone = punchSound.cloneNode(true);
                    const playPromise = punchSoundClone.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.warn('Error playing punch sound:', error);
                        });
                    }
                } catch (error) {
                    console.warn('Error creating punch sound clone:', error);
                }
            }, 600); // Time to reach the target (50% of 1.2s)
        }

        // Create quick screen flash effect
        const screenFlash = document.createElement('div');
        screenFlash.className = 'quick-flash';
        document.body.appendChild(screenFlash);

        // Remove screen flash after animation
        setTimeout(() => {
            screenFlash.remove();
        }, 400);

        // Show collision overlay with attacker and target names
        collisionOverlay.classList.remove('hidden');

        // Create collision text with names
        const collisionText = document.createElement('div');
        collisionText.className = 'punch-text';
        setSafeContent(collisionText, `${sanitizeInput(attackerName)} hits ${sanitizeInput(targetName)}!`);
        collisionText.style.left = '50%';
        collisionText.style.top = '30%';
        collisionText.style.transform = 'translateX(-50%)';
        collisionText.style.fontSize = '1.8rem';
        collisionText.style.animationDelay = '0.2s';
        collisionContainer.appendChild(collisionText);

        // Create impact burst at target position
        setTimeout(() => {
            const effect = document.createElement('div');
            effect.className = 'impact-burst';
            effect.style.left = `${targetX - 50}px`;
            effect.style.top = `${targetY - 50}px`;
            participantsContainer.appendChild(effect);

            // Add impact shake to target
            targetEl.classList.add('animate-impact-shake');

            // Create enhanced impact particles
            createImpactParticles(targetX, targetY);

            // Create POW text
            const powText = document.createElement('div');
            powText.className = 'punch-text';
            powText.textContent = 'POW!';
            powText.style.left = `${targetX}px`;
            powText.style.top = `${targetY - 50}px`;
            participantsContainer.appendChild(powText);

            // Remove effect after animation completes
            setTimeout(() => {
                effect.remove();
                targetEl.classList.remove('animate-impact-shake');
                powText.remove();
            }, 800);
        }, 600); // Timing to match the collision animation (50% of 1.2s)

        // Remove animation class and hide overlay after animation completes
        setTimeout(() => {
            attackerEl.classList.remove('animate-smooth-punch');
            collisionText.remove();
            collisionOverlay.classList.add('hidden');
            isAnimating = false;
        }, 1200);
    }

    function createImpactParticles(x, y) {
        const particleCount = 15;

        // Create a container for particles to ensure proper positioning
        const particleContainer = document.createElement('div');
        particleContainer.style.position = 'absolute';
        particleContainer.style.left = '0';
        particleContainer.style.top = '0';
        particleContainer.style.width = '100%';
        particleContainer.style.height = '100%';
        particleContainer.style.pointerEvents = 'none';
        particleContainer.style.zIndex = '102';
        participantsContainer.appendChild(particleContainer);

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'impact-particle';

            // Random direction for each particle with more variation
            const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const distance = 40 + Math.random() * 80;
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance;

            // Set CSS variables for animation
            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);

            // Random size variation
            const size = 4 + Math.random() * 4;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;

            // Random color variations
            const colors = ['#ffffff', '#ffeb3b', '#ff9800', '#ff5722'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            particle.style.background = `radial-gradient(circle, ${randomColor} 0%, rgba(255,149,0,0.5) 100%)`;

            // Position particle at the impact point, centered
            particle.style.left = `${x - size / 2}px`;  // Subtract half the width to center
            particle.style.top = `${y - size / 2}px`;   // Subtract half the height to center

            // Random animation delay for more natural effect
            particle.style.animationDelay = `${Math.random() * 0.1}s`;
            particleContainer.appendChild(particle);

            // Remove particle after animation completes
            setTimeout(() => {
                particle.remove();
            }, 800 + Math.random() * 100);
        }

        // Remove the container after all particles are gone
        setTimeout(() => {
            particleContainer.remove();
        }, 1000);
    }

    function createMotionTrail(startX, startY, targetX, targetY) {
        const trailCount = 5;

        // Create a container for trail effects to ensure proper positioning
        const trailContainer = document.createElement('div');
        trailContainer.style.position = 'absolute';
        trailContainer.style.left = '0';
        trailContainer.style.top = '0';
        trailContainer.style.width = '100%';
        trailContainer.style.height = '100%';
        trailContainer.style.pointerEvents = 'none';
        trailContainer.style.zIndex = '99';
        participantsContainer.appendChild(trailContainer);

        for (let i = 0; i < trailCount; i++) {
            const trail = document.createElement('div');
            trail.className = 'motion-trail';

            // Calculate position along the path
            const progress = (i + 1) / (trailCount + 1);
            const x = startX + (targetX - startX) * progress;
            const y = startY + (targetY - startY) * progress;

            // Set CSS variables for animation
            trail.style.setProperty('--tx', `${targetX - startX}px`);
            trail.style.setProperty('--ty', `${targetY - startY}px`);

            // Position trail at the calculated point, centered
            trail.style.left = `${x - 40}px`;  // Subtract half the width (80px) to center
            trail.style.top = `${y - 40}px`;   // Subtract half the height (80px) to center

            trail.style.animationDelay = `${i * 0.08}s`;
            trailContainer.appendChild(trail);

            // Remove trail after animation completes
            setTimeout(() => {
                trail.remove();
            }, 500 + i * 80);
        }

        // Remove the container after all trails are gone
        setTimeout(() => {
            trailContainer.remove();
        }, 900);
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

    function reconnectToSession() {
        if (isReconnecting) return;

        isReconnecting = true;

        // Show a loading indicator
        const reconnectBtn = document.getElementById('reconnect-btn');
        if (reconnectBtn) {
            reconnectBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Connecting...';
            reconnectBtn.disabled = true;
        }

        // Create a new socket connection
        socket = io();

        // Set up socket listeners again
        setupSocketListeners();

        // Join the session again
        socket.emit('join-session', {
            sessionId,
            user,
            csrfToken: getCSRFToken()
        });

        // Start heartbeat again
        startHeartbeat();

        // Reset reconnection flag after a delay
        setTimeout(() => {
            isReconnecting = false;
        }, 5000);
    }

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

    // Helper function to show notifications
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-1 right-4 px-4 py-2 rounded-lg shadow-lg z-50 ${type === 'success' ? 'bg-green-500' :
            type === 'error' ? 'bg-red-500' : 'bg-blue-500'
            } text-white`;
        setSafeContent(notification, sanitizeInput(message));
        document.body.appendChild(notification);

        // Remove notification after 1.5 seconds
        setTimeout(() => {
            notification.remove();
        }, 1500);
    }

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
        themeSelector.value = 'halloween'; // Set to match default theme
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
        currentTheme = themeSelector.value;

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

    // Apply theme - Updated to remove light mode
    function applyTheme(theme) {
        document.body.className = '';
        switch (theme) {
            case 'dbz':
                document.body.classList.add('dbz-bg', 'min-h-screen', 'text-white', 'overflow-hidden');
                break;
            case 'halloween':
                document.body.classList.add('dbz-bg', 'min-h-screen', 'text-white', 'overflow-hidden', 'halloween-theme');
                scheduleHalloweenElements();
                break;
            case 'dark':
                document.body.classList.add('bg-gray-900', 'min-h-screen', 'text-white', 'overflow-hidden', 'dark-mode');
                break;
        }
    }

    // Update triggerCelebration function for the new animation with image error handling
    function triggerCelebration() {
        // Show celebration overlay
        celebrationOverlay.classList.remove('hidden');

        // Handle image loading with fallback
        const superSaiyanImg = document.getElementById('super-saiyan-img');
        const superSaiyanFallback = document.getElementById('super-saiyan-fallback');

        // Try to load the image
        superSaiyanImg.onload = function () {
            // Image loaded successfully, show it and hide fallback
            superSaiyanImg.classList.remove('hidden');
            superSaiyanFallback.classList.add('hidden');
        };

        superSaiyanImg.onerror = function () {
            // Image failed to load, show fallback
            superSaiyanImg.classList.add('hidden');
            superSaiyanFallback.classList.remove('hidden');
            console.warn('Super Saiyan image failed to load, using fallback');
        };

        // Force reload the image to trigger onerror if needed
        superSaiyanImg.src = '/images/ssj.gif?' + new Date().getTime();

        // Play sound if enabled
        if (soundEnabled) {
            // Reset the audio to the beginning and set volume to 1
            celebrationSound.currentTime = 0;
            celebrationSound.volume = 1;

            // Try to play the sound
            const playPromise = celebrationSound.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('Celebration sound started');
                    // Setup the fade out for the last second
                    fadeOutAudio(celebrationSound, 1000);
                }).catch(error => {
                    console.warn('Error playing celebration sound:', error);
                    soundEnabled = false;
                });
            }
        }

        // Hide celebration after animation completes
        setTimeout(() => {
            celebrationOverlay.classList.add('hidden');
        }, 5000);
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

    // Music Player Implementation - Fixed Version

    function fadeOutAudio(audio, fadeDuration = 1000) {
        if (!audio || audio.paused) return;

        // Calculate when to start fading (1 second before the end)
        const fadeStartTime = audio.duration - 1;
        const currentTime = audio.currentTime;

        // If we're already past the fade start time, start immediately
        if (currentTime >= fadeStartTime) {
            startFadeOut(audio, fadeDuration);
        } else {
            // Otherwise, set a timeout to start fading at the right time
            const timeUntilFade = (fadeStartTime - currentTime) * 1000;
            setTimeout(() => {
                startFadeOut(audio, fadeDuration);
            }, timeUntilFade);
        }
    }

    function startFadeOut(audio, duration) {
        const steps = 30; // Number of steps for smoother fade
        const stepDuration = duration / steps;
        const initialVolume = audio.volume;
        let currentStep = 0;

        const fadeInterval = setInterval(() => {
            currentStep++;
            // Calculate new volume using linear interpolation
            const newVolume = initialVolume * (1 - currentStep / steps);
            audio.volume = Math.max(0, newVolume); // Ensure volume doesn't go negative

            if (currentStep >= steps) {
                clearInterval(fadeInterval);
            }
        }, stepDuration);
    }

    const musicPlayer = {
        songs: [
            { title: "Level Up", src: "/music/Level Up.mp3", duration: "3:27" },
            { title: "Cha-La Head-Cha-La (variations)", src: "/music/CHA-LA HEAD-CHA-LA(Variations).mp3", duration: "1:30" },
            { title: "Skill Shop", src: "/music/Skill Shop.mp3", duration: "4:05" },
            { title: "Dragon Arena", src: "/music/Dragon Arena.mp3", duration: "6:02" },
            { title: "Team Saiyan (EN)", src: "/music/Team Saiyan EN.mp3", duration: "2:42" },
        ],
        currentSongIndex: -1,
        audio: new Audio(),
        isPlaying: false,
        volume: 0.5,

        init() {
            // Set up UI elements
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

            // Check if all elements exist
            if (!this.playerToggle || !this.playerPanel || !this.playerClose ||
                !this.playPauseBtn || !this.prevBtn || !this.nextBtn ||
                !this.volumeSlider || !this.progressBar || !this.currentTimeEl ||
                !this.totalTimeEl || !this.currentSongNameEl || !this.playlistEl) {
                console.error('Music player: One or more required DOM elements not found');
                return;
            }

            // Set initial volume
            this.audio.volume = this.volume;
            this.volumeSlider.value = this.volume * 100;

            // Create playlist UI
            this.createPlaylist();

            // Set up event listeners
            this.setupEventListeners();

            // Set up audio event listeners
            this.setupAudioEventListeners();

            // Initial positioning will be done when panel is first opened
        },

        positionPanel() {
            // Get the button's position
            const buttonRect = this.playerToggle.getBoundingClientRect();
            const panelWidth = 320;
            const panelHeight = 400; // Approximate panel height
            const gap = 8;

            // Calculate horizontal position (centered on button)
            const buttonCenterX = buttonRect.left + (buttonRect.width / 2);
            let panelLeft = buttonCenterX - (panelWidth / 2);

            // Adjust if panel goes off-screen horizontally
            if (panelLeft < gap) {
                panelLeft = gap;
            } else if (panelLeft + panelWidth > window.innerWidth - gap) {
                panelLeft = window.innerWidth - panelWidth - gap;
            }

            // Calculate vertical position (prefer below, but above if no space)
            let panelTop = buttonRect.bottom + gap;
            let transformOrigin = 'top center';

            // Check if there's enough space below
            if (panelTop + panelHeight > window.innerHeight - gap) {
                // Not enough space below, position above
                panelTop = buttonRect.top - panelHeight - gap;
                transformOrigin = 'bottom center';
                
                // If still not enough space above, position at top of screen
                if (panelTop < gap) {
                    panelTop = gap;
                    transformOrigin = 'top center';
                }
            }

            // Apply positioning
            this.playerPanel.style.position = 'fixed';
            this.playerPanel.style.top = `${panelTop}px`;
            this.playerPanel.style.left = `${panelLeft}px`;
            this.playerPanel.style.right = 'auto';
            this.playerPanel.style.transformOrigin = transformOrigin;
        },

        setupEventListeners() {
            // Toggle music player panel
            this.playerToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.playerToggle.classList.add('button-animate');
                setTimeout(() => this.playerToggle.classList.remove('button-animate'), 200);
                
                const isHidden = this.playerPanel.classList.contains('hidden');
                
                if (isHidden) {
                    // Position panel near button before showing
                    this.positionPanel();
                    this.playerPanel.classList.remove('hidden');
                    this.playerPanel.classList.add('panel-animate');
                    setTimeout(() => this.playerPanel.classList.remove('panel-animate'), 300);
                } else {
                    this.playerPanel.classList.add('hidden');
                }
            });

            // Close music player panel
            this.playerClose.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event from bubbling
                this.playerPanel.classList.add('hidden');
            });

            // Play/Pause button
            this.playPauseBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event from bubbling
                this.togglePlayPause();
            });

            // Previous song button
            this.prevBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event from bubbling
                this.playPreviousSong();
            });

            // Next song button
            this.nextBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event from bubbling
                this.playNextSong();
            });

            // Volume slider
            this.volumeSlider.addEventListener('input', (e) => {
                e.stopPropagation(); // Prevent event from bubbling
                this.setVolume(e.target.value / 100);
            });



            // Close the panel when clicking outside
            document.addEventListener('click', (e) => {
                if (!this.playerPanel.classList.contains('hidden') &&
                    !this.playerPanel.contains(e.target) &&
                    !this.playerToggle.contains(e.target)) {
                    this.playerPanel.classList.add('hidden');
                }
            });

            // Reposition panel on window resize
            window.addEventListener('resize', () => {
                if (!this.playerPanel.classList.contains('hidden')) {
                    this.positionPanel();
                }
            });

            // Prevent clicks inside the panel from bubbling up
            this.playerPanel.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent clicks inside the panel from reaching the document
            });
        },

        setupAudioEventListeners() {
            // Update progress bar as song plays
            this.audio.addEventListener('timeupdate', () => {
                if (this.audio.duration) {
                    const progress = (this.audio.currentTime / this.audio.duration) * 100;
                    this.progressBar.style.width = `${progress}%`;
                    this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
                }
            });

            // When song ends, play next song
            this.audio.addEventListener('ended', () => {
                this.playNextSong();
            });

            // When metadata is loaded, update total time
            this.audio.addEventListener('loadedmetadata', () => {
                this.totalTimeEl.textContent = this.formatTime(this.audio.duration);
            });

            // Handle audio errors
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

                // Add click event listener with stopPropagation
                playlistItem.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent event from bubbling
                    this.playSong(index);
                });

                this.playlistEl.appendChild(playlistItem);
            });
        },

        showErrorMessage(message) {
            // Create a temporary error message
            const errorEl = document.createElement('div');
            errorEl.className = 'music-player-error absolute top-2 left-0 right-0 bg-red-600 text-white text-center py-1 px-2 rounded text-sm z-50';
            setSafeContent(errorEl, sanitizeInput(message));
            this.playerPanel.appendChild(errorEl);

            // Remove after 3 seconds
            setTimeout(() => {
                errorEl.remove();
            }, 3000);
        },

        playSong(index) {
            console.log(`Playing song at index: ${index}`);
            if (index < 0 || index >= this.songs.length) {
                console.error('Invalid song index:', index);
                return;
            }

            this.currentSongIndex = index;
            const song = this.songs[index];
            console.log(`Selected song:`, song);

            // Update UI with loading indicator
            const titleSpan = createSafeElement('span', song.title);
            const loadingSpan = createSafeElement('span', '', 'loading-indicator');
            this.currentSongNameEl.innerHTML = '';
            this.currentSongNameEl.appendChild(titleSpan);
            this.currentSongNameEl.appendChild(document.createTextNode(' '));
            this.currentSongNameEl.appendChild(loadingSpan);
            this.updatePlaylistActiveItem();

            // Reset progress bar
            this.progressBar.style.width = '0%';
            this.currentTimeEl.textContent = '0:00';

            // Load and play the song
            this.audio.src = song.src;
            console.log(`Loading audio from: ${song.src}`);
            this.audio.load();

            // Remove loading indicator when playback starts or fails
            const removeLoadingIndicator = () => {
                setSafeContent(this.currentSongNameEl, song.title);
            };

            // Set up one-time event listeners for loading indicator
            this.audio.addEventListener('play', removeLoadingIndicator, { once: true });
            this.audio.addEventListener('error', removeLoadingIndicator, { once: true });

            // Set up error handling
            this.audio.onerror = () => {
                console.error('Error loading audio file:', song.src);
                this.isPlaying = false;
                this.updatePlayPauseButton();

                // Show error message to user
                this.showErrorMessage(`Error loading: ${song.title}`);
            };

            const playPromise = this.audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('Playback started successfully');
                    this.isPlaying = true;
                    this.updatePlayPauseButton();
                }).catch(error => {
                    console.error('Error playing song:', error);
                    this.isPlaying = false;
                    this.updatePlayPauseButton();

                    // Show error message to user
                    this.showErrorMessage(`Playback error: ${song.title}`);
                });
            }
        },

        togglePlayPause() {
            console.log('Toggle play/pause. Current state:', this.isPlaying);
            if (this.currentSongIndex === -1) {
                console.log('No song selected, playing first song');
                this.playSong(0);
                return;
            }

            if (this.isPlaying) {
                console.log('Pausing playback');
                this.audio.pause();
                this.isPlaying = false;
            } else {
                console.log('Resuming playback');
                const playPromise = this.audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('Playback resumed successfully');
                        this.isPlaying = true;
                    }).catch(error => {
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
                this.playSong(0); // Loop back to first song
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
            if (this.isPlaying) {
                this.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                this.playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        },

        // Halloween special effects
        triggerHalloweenEffect() {
            if (!document.body.classList.contains('halloween-theme')) return;
            
            // Create spooky particles
            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    const particle = document.createElement('div');
                    particle.className = 'halloween-particle halloween-spark';
                    particle.style.left = Math.random() * window.innerWidth + 'px';
                    particle.style.top = Math.random() * window.innerHeight + 'px';
                    document.body.appendChild(particle);
                    
                    setTimeout(() => particle.remove(), 3000);
                }, i * 200);
            }
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

    // Animate the message panel when page loads
    const messagePanel = document.getElementById('mini-games-panel');
    if (messagePanel) {
        // Add a small delay before starting the animation
        setTimeout(() => {
            messagePanel.classList.add('animate-in');
        }, 500);
    }

    // Add click effect to the message
    if (messagePanel) {
        messagePanel.addEventListener('click', function (e) {
            e.preventDefault(); // Prevent default link behavior

            // Create ripple effect
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');

            // Calculate ripple position
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            // Set ripple styles
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';

            // Add ripple to the element
            this.appendChild(ripple);

            // Remove ripple after animation completes
            setTimeout(() => {
                ripple.remove();
            }, 600);

            // Add a small delay before redirecting for better UX
            setTimeout(() => {
                // Add a fade-out effect
                this.style.transition = 'all 0.3s ease';
                this.style.opacity = '0';
                this.style.transform = 'translateX(-20px)';

                // Redirect after fade-out
                setTimeout(() => {
                    window.open('https://linkedin.com/in/gabbosaur', '_blank');

                    // Reset the panel for next time
                    setTimeout(() => {
                        this.style.transition = '';
                        this.style.opacity = '';
                        this.style.transform = '';
                        this.classList.remove('animate-in');
                    }, 1000);
                }, 300);
            }, 200);
        });
    }

    // Add this function to your main.js
    function animateMessagePanel() {
        const messagePanel = document.getElementById('mini-games-panel');
        if (messagePanel) {
            // Reset any existing animation
            messagePanel.classList.remove('animate-in');

            // Force a reflow to reset the animation
            void messagePanel.offsetWidth;

            // Start the animation
            messagePanel.classList.add('animate-in');
        }
    }

    // Add cleanup function for better memory management
    function cleanup() {
        // Stop all intervals
        stopHeartbeat();
        stopConnectionCheck();
        
        // Disconnect socket
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        
        // Clear any remaining timeouts
        if (window.resizeTimer) {
            clearTimeout(window.resizeTimer);
        }
        
        // Reset state
        isAnimating = false;
        isReconnecting = false;
        hasVoted = false;
        participants = {};
        currentCards = [];
        currentSession = null;
    }

    // You can call this function whenever you want to re-animate the panel
    // For example, after the user returns from LinkedIn:
    window.addEventListener('focus', () => {
        // Check if the panel is visible
        const messagePanel = document.getElementById('mini-games-panel');
        if (messagePanel && !messagePanel.classList.contains('hidden')) {
            animateMessagePanel();
        }
    });

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

    // Halloween animation system
    function createHalloweenElement() {
        const isHalloween = document.body.classList.contains('halloween-theme');
        if (!isHalloween) return;

        const elements = [
            { emoji: '🦇', class: 'halloween-bat' },
            { emoji: '🎃', class: 'halloween-pumpkin' },
            { emoji: '👻', class: 'halloween-ghost' },
            { emoji: '🕷️', class: 'halloween-spider' }
        ];
        
        const element = elements[Math.floor(Math.random() * elements.length)];
        const halloweenEl = document.createElement('div');
        
        // For spiders, randomly choose between two animations
        if (element.class === 'halloween-spider') {
            const spiderClass = Math.random() < 0.5 ? 'halloween-spider' : 'halloween-spider-up';
            halloweenEl.className = `halloween-floating ${spiderClass}`;
        } else {
            halloweenEl.className = `halloween-floating ${element.class}`;
        }
        
        halloweenEl.textContent = element.emoji;
        if (element.class === 'halloween-spider') {
            halloweenEl.style.top = '0px';
            halloweenEl.style.left = `${Math.random() * 80 + 10}%`;
        } else {
            halloweenEl.style.top = `${Math.random() * 80 + 10}%`;
            halloweenEl.style.left = '-50px';
        }
        
        document.body.appendChild(halloweenEl);
        
        const animationDuration = element.class === 'halloween-bat' ? 12000 : 
                                 element.class === 'halloween-pumpkin' ? 18000 : 
                                 element.class === 'halloween-ghost' ? 14000 : 8000;
        setTimeout(() => halloweenEl.remove(), animationDuration);
    }

    // Halloween theme toggle
    function toggleHalloweenTheme(enable) {
        if (enable) {
            document.body.classList.add('halloween-theme');
            // Start Halloween animations
            scheduleHalloweenElements();
        } else {
            document.body.classList.remove('halloween-theme');
        }
    }

    // Super Saiyan effect function
    function triggerSuperSaiyan(userId) {
        console.log(`Triggering Super Saiyan for user: ${userId}`);
        const participantEl = document.querySelector(`[data-user-id="${userId}"]`);
        if (participantEl) {
            console.log('Found participant element');
            const avatar = participantEl.querySelector('.dbz-participant-card');
            if (avatar) {
                console.log('Found avatar element, adding super-saiyan-mode class');
                avatar.classList.add('super-saiyan-mode');
                
                // Add Halloween glow if Halloween theme is active
                if (document.body.classList.contains('halloween-theme')) {
                    avatar.classList.add('halloween-glow');
                    musicPlayer.triggerHalloweenEffect();
                }
                
                console.log('Avatar classes:', avatar.className);
                
                if (soundEnabled) {
                    celebrationSound.currentTime = 0;
                    celebrationSound.volume = 1;
                    celebrationSound.play().catch(e => console.warn('Sound error:', e));
                    
                    // Fade out sound starting at 2 seconds
                    setTimeout(() => {
                        fadeOutAudio(celebrationSound, 1000);
                    }, 2000);
                }
                
                setTimeout(() => {
                    console.log('Removing super-saiyan-mode class');
                    avatar.classList.remove('super-saiyan-mode', 'halloween-glow');
                }, 5000);
            } else {
                console.log('Avatar element not found');
            }
        } else {
            console.log('Participant element not found for userId:', userId);
        }
    }

    // Start card animations with random intervals
    function scheduleNextCard() {
        setTimeout(() => {
            createFloatingCard();
            scheduleNextCard();
        }, 30000 + Math.random() * 270000);
    }
    scheduleNextCard();

    // Halloween element scheduler
    function scheduleHalloweenElements() {
        const isHalloween = document.body.classList.contains('halloween-theme');
        if (!isHalloween) return;
        
        setTimeout(() => {
            createHalloweenElement();
            scheduleHalloweenElements();
        }, 5000 + Math.random() * 10000);
    }

    // Theme selector handler
    if (themeSelector) {
        themeSelector.addEventListener('change', function() {
            const theme = this.value;
            
            // Remove all theme classes
            document.body.classList.remove('halloween-theme');
            
            // Apply selected theme
            if (theme === 'halloween') {
                toggleHalloweenTheme(true);
            }
            
            // Save theme preference
            localStorage.setItem('selectedTheme', theme);
        });
        
        // Clear any existing theme and set default
        localStorage.removeItem('selectedTheme');
        const savedTheme = 'halloween';
        themeSelector.value = savedTheme;
        applyTheme(savedTheme);
    }
});