document.addEventListener('DOMContentLoaded', () => {
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
    const emojiPanel = document.getElementById('emoji-panel');
    const emojiContainer = document.getElementById('emoji-container');
    const miniGamesPanel = document.getElementById('mini-games-panel');
    const reactionGameBtn = document.getElementById('reaction-game-btn');
    const miniGameModal = document.getElementById('mini-game-modal');
    const closeMiniGame = document.getElementById('close-mini-game');
    const startReactionGame = document.getElementById('start-reaction-game');
    const reactionGameArea = document.getElementById('reaction-game-area');
    const reactionInstruction = document.getElementById('reaction-instruction');
    const reactionResult = document.getElementById('reaction-result');
    const reactionTime = document.getElementById('reaction-time');
    const punchSound = document.getElementById('punch-sound'); // New element
    const collisionOverlay = document.getElementById('collision-overlay');
    const collisionContainer = document.getElementById('collision-container');


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
    let currentTheme = 'dbz'; // Default to DBZ theme
    let currentDeckType = 'modifiedFibonacci';
    let socket = null;
    let avatarFile = null;
    let heartbeatInterval = null;
    let isAnimating = false; // Track if collision animation is in progress


    // Audio for celebration with error handling
    const celebrationSound = new Audio('/sounds/super-saiyan.mp3');

    
    // Handle audio loading errors
    celebrationSound.addEventListener('error', (e) => {
        console.warn('Error loading celebration sound:', e);
        // Disable sound if there's an error
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
        }

        // Join session
        socket.emit('join-session', {
            sessionId,
            user
        });
    });

    // Start heartbeat
    function startHeartbeat() {
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        heartbeatInterval = setInterval(() => {
            if (socket && socket.connected) {
                socket.emit('heartbeat');
            }
        }, 10000);
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
                avatarPreview.innerHTML = `<img src="${event.target.result}" alt="Avatar" class="w-full h-full object-cover">`;
            };
            reader.readAsDataURL(file);
        }
    });

    settingsAvatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            // Upload avatar
            try {
                const formData = new FormData();
                formData.append('avatar', file);

                const response = await fetch('/upload-avatar', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                if (data.path) {
                    user.avatar = data.path;
                    settingsAvatarPreview.innerHTML = `<img src="${data.path}" alt="Avatar" class="w-full h-full object-cover">`;

                    // Update avatar in the current session if already joined
                    if (socket && sessionId) {
                        socket.emit('update-avatar', {
                            sessionId,
                            avatarPath: data.path
                        });
                    }
                }
            } catch (error) {
                console.error('Error uploading avatar:', error);
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
            sessionIdDisplay.textContent = sessionId;

            // Set current deck type and display
            currentDeckType = session.currentDeck;
            currentDeck.textContent = currentDeckType === 'fibonacci' ? 'Fibonacci' :
                currentDeckType === 'modifiedFibonacci' ? 'Modified Fibonacci' : 'T-shirt Sizes';

            // Load cards
            loadCards(cardDecks[currentDeckType]);

            // Update participants
            participants = session.users;
            renderParticipants();

            // Show existing votes if any
            if (session.showVotes && session.results) {
                showResults(session.votes, session.results);
            }
        });

        socket.on('user-joined', (newUser) => {
            participants[newUser.id] = newUser;
            renderParticipants();
        });

        socket.on('user-left', (userId) => {
            if (participants[userId]) {
                delete participants[userId];
                renderParticipants();
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

        socket.on('vote-count-updated', (data) => {
            const { current, total } = data;
            voteCounter.textContent = `${current}/${total} votes`;

            if (current === total) {
                voteStatus.textContent = 'All votes in! Revealing results...';
            } else {
                voteStatus.textContent = 'Waiting for votes...';
            }
        });

        socket.on('voting-complete', (data) => {
            const { votes, results } = data;

            // Update vote counter to show the correct total
            const totalVotes = Object.keys(votes).length;
            const totalConnected = Object.values(participants).filter(p => p.isConnected).length;
            voteCounter.textContent = `${totalVotes}/${totalConnected} votes`;

            showResults(votes, results);
        });

        socket.on('votes-reset', () => {
            resetVoting();
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

        socket.on('mini-game-started', (data) => {
            if (data.gameType === 'reaction') {
                miniGameModal.classList.remove('hidden');
            }
        });

        socket.on('mini-game-result', (data) => {
            // Handle mini-game results if needed
        });

        // New listener for collision animation
        socket.on('collision-animation', (data) => {
            const { attackerId, targetId, attackerName, targetName } = data;
            animateCollisionBroadcast(attackerId, targetId, attackerName, targetName);
        });


        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            alert('Failed to connect to the server. Please try again.');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            // You might want to show a reconnection UI here
        });
    }

    // Render participants around the table
    // Render participants around the table (update to add collision event)
    function renderParticipants() {
        participantsContainer.innerHTML = '';

        const participantIds = Object.keys(participants);
        const totalParticipants = participantIds.length;

        participantIds.forEach((id, index) => {
            const participant = participants[id];
            const angle = (index / totalParticipants) * 2 * Math.PI;
            const radius = 220; // Distance from center

            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            const participantEl = document.createElement('div');
            participantEl.className = `absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${participant.isConnected ? '' : 'opacity-50'}`;
            participantEl.style.left = `calc(50% + ${x}px)`;
            participantEl.style.top = `calc(50% + ${y}px)`;
            participantEl.setAttribute('data-user-id', id);

            // Add click event for collision animation (only for other users)
            if (id !== socket.id) {
                participantEl.style.cursor = 'pointer';
                participantEl.addEventListener('click', () => {
                    if (!isAnimating) {
                        // Emit collision event to server
                        socket.emit('user-collision', {
                            sessionId,
                            attackerId: socket.id,
                            targetId: id
                        });

                        // Start local animation immediately for better responsiveness
                        animateCollision(socket.id, id);
                    }
                });
            }

            const avatarContent = participant.avatar
                ? `<img src="${participant.avatar}" alt="${participant.name}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full bg-gray-700 flex items-center justify-center"><i class="fas fa-user text-2xl text-gray-500"></i></div>`;

            participantEl.innerHTML = `
                <div class="dbz-participant-card w-20 h-20 rounded-full overflow-hidden shadow-lg border-2 ${id === socket.id ? 'border-yellow-500' : 'border-gray-700'}">
                    ${avatarContent}
                </div>
                <div class="text-center mt-2 text-sm font-medium">${participant.name}</div>
                <div class="vote-indicator hidden text-center mt-1">
                    <div class="dbz-vote-card inline-block px-3 py-1 rounded-lg font-bold">?</div>
                </div>
            `;

            participantsContainer.appendChild(participantEl);
        });
    }

    // Enhanced function to animate collision between users (local)
    function animateCollision(attackerId, targetId) {
        if (isAnimating) return;

        isAnimating = true;

        const attackerEl = document.querySelector(`[data-user-id="${attackerId}"]`);
        const targetEl = document.querySelector(`[data-user-id="${targetId}"]`);

        if (!attackerEl || !targetEl) {
            isAnimating = false;
            return;
        }

        // Get positions
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

        // Add animation class
        attackerEl.classList.add('animate-collision');

        // Play punch sound if enabled
        if (soundEnabled) {
            const playPromise = punchSound.cloneNode(true).play();

            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('Error playing punch sound:', error);
                });
            }
        }

        // Create screen flash effect
        const screenFlash = document.createElement('div');
        screenFlash.className = 'screen-flash';
        document.body.appendChild(screenFlash);

        // Remove screen flash after animation
        setTimeout(() => {
            screenFlash.remove();
        }, 200);

        // Create collision effect at target position
        setTimeout(() => {
            const effect = document.createElement('div');
            effect.className = 'collision-effect';
            effect.style.left = `${targetX - 40}px`;
            effect.style.top = `${targetY - 40}px`;
            participantsContainer.appendChild(effect);

            // Add shake animation to target
            targetEl.classList.add('animate-shake');

            // Create impact particles
            createImpactParticles(targetX, targetY);

            // Create collision text
            const collisionText = document.createElement('div');
            collisionText.className = 'collision-text';
            collisionText.textContent = 'POW!';
            collisionText.style.left = `${targetX}px`;
            collisionText.style.top = `${targetY - 40}px`;
            participantsContainer.appendChild(collisionText);

            // Remove effect after animation completes
            setTimeout(() => {
                effect.remove();
                targetEl.classList.remove('animate-shake');
                collisionText.remove();
            }, 600);
        }, 600); // Timing to match the collision animation (60% of 1s)

        // Remove animation class after animation completes
        setTimeout(() => {
            attackerEl.classList.remove('animate-collision');
            isAnimating = false;
        }, 1000);
    }

    // New function to animate collision broadcast from other users
    function animateCollisionBroadcast(attackerId, targetId, attackerName, targetName) {
        if (isAnimating) return;

        isAnimating = true;

        const attackerEl = document.querySelector(`[data-user-id="${attackerId}"]`);
        const targetEl = document.querySelector(`[data-user-id="${targetId}"]`);

        if (!attackerEl || !targetEl) {
            isAnimating = false;
            return;
        }

        // Get positions
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

        // Add animation class
        attackerEl.classList.add('animate-collision');

        // Play punch sound if enabled
        if (soundEnabled) {
            const playPromise = punchSound.cloneNode(true).play();

            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('Error playing punch sound:', error);
                });
            }
        }

        // Create screen flash effect
        const screenFlash = document.createElement('div');
        screenFlash.className = 'screen-flash';
        document.body.appendChild(screenFlash);

        // Remove screen flash after animation
        setTimeout(() => {
            screenFlash.remove();
        }, 200);

        // Show collision overlay with attacker and target names
        collisionOverlay.classList.remove('hidden');

        // Create collision text with names
        const collisionText = document.createElement('div');
        collisionText.className = 'collision-text';
        collisionText.textContent = `${attackerName} hits ${targetName}!`;
        collisionText.style.left = '50%';
        collisionText.style.top = '30%';
        collisionText.style.transform = 'translateX(-50%)';
        collisionText.style.fontSize = '1.5rem';
        collisionContainer.appendChild(collisionText);

        // Create collision effect at target position
        setTimeout(() => {
            const effect = document.createElement('div');
            effect.className = 'collision-effect';
            effect.style.left = `${targetX - 40}px`;
            effect.style.top = `${targetY - 40}px`;
            participantsContainer.appendChild(effect);

            // Add shake animation to target
            targetEl.classList.add('animate-shake');

            // Create impact particles
            createImpactParticles(targetX, targetY);

            // Create POW text
            const powText = document.createElement('div');
            powText.className = 'collision-text';
            powText.textContent = 'POW!';
            powText.style.left = `${targetX}px`;
            powText.style.top = `${targetY - 40}px`;
            participantsContainer.appendChild(powText);

            // Remove effect after animation completes
            setTimeout(() => {
                effect.remove();
                targetEl.classList.remove('animate-shake');
                powText.remove();
            }, 600);
        }, 600); // Timing to match the collision animation (60% of 1s)

        // Remove animation class and hide overlay after animation completes
        setTimeout(() => {
            attackerEl.classList.remove('animate-collision');
            collisionText.remove();
            collisionOverlay.classList.add('hidden');
            isAnimating = false;
        }, 1000);
    }

    // New function to create impact particles
    function createImpactParticles(x, y) {
        const particleCount = 12;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'impact-particle';

            // Random direction for each particle
            const angle = (i / particleCount) * Math.PI * 2;
            const distance = 50 + Math.random() * 50;
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance;

            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;

            // Random color variations
            const colors = ['#ffffff', '#ff9500', '#ff8c00', '#ffd700'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            particle.style.background = `radial-gradient(circle, ${randomColor} 0%, rgba(255,149,0,0.5) 100%)`;

            participantsContainer.appendChild(particle);

            // Remove particle after animation completes
            setTimeout(() => {
                particle.remove();
            }, 800);
        }
    }

    // New function to animate collision between users
    function animateCollision(attackerId, targetId) {
        if (isAnimating) return;

        isAnimating = true;

        const attackerEl = document.querySelector(`[data-user-id="${attackerId}"]`);
        const targetEl = document.querySelector(`[data-user-id="${targetId}"]`);

        if (!attackerEl || !targetEl) {
            isAnimating = false;
            return;
        }

        // Get positions
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

        // Add animation class
        attackerEl.classList.add('animate-collision');

        // Play punch sound if enabled
        if (soundEnabled) {
            const playPromise = punchSound.cloneNode(true).play();

            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('Error playing punch sound:', error);
                });
            }
        }

        // Create collision effect at target position
        setTimeout(() => {
            const effect = document.createElement('div');
            effect.className = 'collision-effect';
            effect.style.left = `${targetX - 30}px`;
            effect.style.top = `${targetY - 30}px`;
            participantsContainer.appendChild(effect);

            // Add shake animation to target
            targetEl.classList.add('animate-shake');

            // Remove effect after animation completes
            setTimeout(() => {
                effect.remove();
                targetEl.classList.remove('animate-shake');
            }, 500);
        }, 560); // Timing to match the collision animation (70% of 0.8s)

        // Remove animation class after animation completes
        setTimeout(() => {
            attackerEl.classList.remove('animate-collision');
            isAnimating = false;
        }, 800);
    }

    // Load voting cards
    function loadCards(cards) {
        currentCards = cards;
        cardsContainer.innerHTML = '';

        cards.forEach(card => {
            const cardEl = document.createElement('button');
            cardEl.className = 'dbz-card-btn px-6 py-8 rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105';
            cardEl.textContent = card;
            cardEl.addEventListener('click', () => submitVote(card));
            cardsContainer.appendChild(cardEl);
        });
    }

    // Submit vote
    function submitVote(value) {
        if (hasVoted) return;

        hasVoted = true;
        socket.emit('submit-vote', { sessionId, vote: value });

        // Disable all cards
        document.querySelectorAll('.dbz-card-btn').forEach(card => {
            card.disabled = true;
            card.classList.add('opacity-50', 'cursor-not-allowed');
        });

        // Show user's vote on their avatar
        const userVoteIndicator = document.querySelector(`[data-user-id="${socket.id}"] .vote-indicator`);
        if (userVoteIndicator) {
            userVoteIndicator.classList.remove('hidden');
            userVoteIndicator.querySelector('.dbz-vote-card').textContent = value;
        }
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

        // Show all votes
        Object.keys(votes).forEach(userId => {
            const participantEl = document.querySelector(`[data-user-id="${userId}"]`);
            if (participantEl) {
                const voteIndicator = participantEl.querySelector('.vote-indicator');
                if (voteIndicator) {
                    voteIndicator.classList.remove('hidden');
                    voteIndicator.querySelector('.dbz-vote-card').textContent = votes[userId];
                }
            }
        });

        // Create and display the bar chart
        createVoteChart(votes);

        voteStatus.textContent = 'Voting complete!';
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

        // Clear the chart
        voteChart.innerHTML = '';

        // Re-enable all cards
        document.querySelectorAll('.dbz-card-btn').forEach(card => {
            card.disabled = false;
            card.classList.remove('opacity-50', 'cursor-not-allowed');
        });

        // Hide all vote indicators
        document.querySelectorAll('.vote-indicator').forEach(indicator => {
            indicator.classList.add('hidden');
        });

        voteStatus.textContent = 'Waiting for votes...';
        voteCounter.textContent = '0/0 votes';
    }

    // Reset button
    resetBtn.addEventListener('click', () => {
        socket.emit('reset-votes', sessionId);
    });

    // Settings modal
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
        soundToggle.checked = soundEnabled;
        themeSelector.value = currentTheme;
        deckSelector.value = currentDeckType;

        // Update avatar preview
        if (user.avatar) {
            settingsAvatarPreview.innerHTML = `<img src="${user.avatar}" alt="Avatar" class="w-full h-full object-cover">`;
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
            // Try to play the sound, but handle any errors
            const playPromise = celebrationSound.play();

            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('Error playing celebration sound:', error);
                    // Disable sound if there's an error
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

    // Mini-games
    reactionGameBtn.addEventListener('click', () => {
        socket.emit('start-mini-game', { sessionId, gameType: 'reaction' });
    });

    closeMiniGame.addEventListener('click', () => {
        miniGameModal.classList.add('hidden');
    });

    startReactionGame.addEventListener('click', () => {
        reactionGameArea.classList.remove('bg-green-500');
        reactionGameArea.classList.add('bg-gray-800');
        reactionInstruction.textContent = 'Get ready...';
        reactionResult.classList.add('hidden');

        // Random delay before showing the target
        const delay = Math.random() * 3000 + 2000; // 2-5 seconds

        setTimeout(() => {
            reactionGameArea.classList.remove('bg-gray-800');
            reactionGameArea.classList.add('bg-yellow-500');
            reactionInstruction.textContent = 'CLICK NOW!';

            const startTime = Date.now();

            // Set up click handler
            const handleClick = () => {
                const endTime = Date.now();
                const reactionTimeMs = endTime - startTime;

                reactionGameArea.classList.remove('bg-yellow-500');
                reactionGameArea.classList.add('bg-green-500');
                reactionInstruction.textContent = 'Nice reaction!';

                reactionTime.textContent = `${reactionTimeMs}ms`;
                reactionResult.classList.remove('hidden');

                // Send result to server
                socket.emit('mini-game-result', {
                    sessionId,
                    result: reactionTimeMs
                });

                // Remove click handler
                reactionGameArea.removeEventListener('click', handleClick);
            };

            reactionGameArea.addEventListener('click', handleClick);
        }, delay);
    });
});