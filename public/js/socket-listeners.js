// socket-listeners.js - Registers all socket.io event listeners.
// Dependencies (state getters/setters, DOM refs, helper callbacks) are
// injected via register(socket, deps) so this module stays stateless.
(function () {
    'use strict';

    const { sanitizeInput, setSafeContent, getCSRFToken, showNotification, showToast } = window.SPP.utils;
    const { playUserLeaveAnimation, playResetAnimation } = window.SPP.animations;

    /**
     * @typedef {Object} SocketListenersDeps
     * @property {HTMLElement} loginScreen
     * @property {HTMLElement} gameScreen
     * @property {HTMLElement} sessionIdDisplay
     * @property {HTMLElement} currentDeckEl
     * @property {HTMLElement} voteCounter
     * @property {HTMLElement} voteStatus
     *
     * @property {() => string} getSessionId
     * @property {() => object} getUser
     * @property {() => object} getParticipants
     * @property {(p: object) => void} setParticipants
     * @property {Set<string>} newlyJoinedIds
     * @property {() => object|null} getCurrentSession
     * @property {(s: object|null) => void} setCurrentSession
     * @property {(t: string) => void} setCurrentDeckType
     * @property {(v: boolean) => void} setIsSpectator
     *
     * @property {(cards: any[]) => void} loadCards
     * @property {() => void} renderParticipants
     * @property {(participants?: object) => void} updateVoteStatus
     * @property {(votes: object, results: object) => void} showResults
     * @property {() => void} resetVoting
     * @property {() => void} triggerResetCooldown
     * @property {(data: object) => void} showEmojiReaction
     * @property {() => void} triggerCelebration
     * @property {(userId: string) => void} triggerSuperSaiyan
     * @property {(attackerId: string, targetId: string, attackerName: string, targetName: string) => void} animateSmoothPunchBroadcast
     * @property {() => void} showReconnectNotification
     * @property {(status: string) => void} updateConnectionStatus
     */

    /**
     * Registers all socket.io listeners on the provided socket.
     * @param {import('socket.io-client').Socket} socket
     * @param {SocketListenersDeps} deps
     */
    function register(socket, deps) {
        const {
            loginScreen,
            gameScreen,
            sessionIdDisplay,
            currentDeckEl,
            voteCounter,
            voteStatus,
            getSessionId,
            getUser,
            getParticipants,
            setParticipants,
            newlyJoinedIds,
            getCurrentSession,
            setCurrentSession,
            setCurrentDeckType,
            setIsSpectator,
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
        } = deps;

        const deckLabel = (deckType) => deckType === 'fibonacci' ? 'Fibonacci'
            : deckType === 'modifiedFibonacci' ? 'Modified Fibonacci'
            : 'T-shirt Sizes';

        /**
         * Applies the table glow based on the current consensus streak.
         * No visible effect below 3. Beyond 6 caps at "streak-max".
         */
        function applyConsensusStreakGlow(streak) {
            const table = document.querySelector('.dbz-table');
            if (!table) return;
            // Strip previous streak classes
            ['streak-3', 'streak-4', 'streak-5', 'streak-6', 'streak-max']
                .forEach((c) => table.classList.remove(c));
            if (streak >= 7) table.classList.add('streak-max');
            else if (streak === 6) table.classList.add('streak-6');
            else if (streak === 5) table.classList.add('streak-5');
            else if (streak === 4) table.classList.add('streak-4');
            else if (streak === 3) table.classList.add('streak-3');
        }

        socket.on('session-joined', (data) => {
            const { session, cardDecks } = data;
            loginScreen.classList.add('hidden');
            gameScreen.classList.remove('hidden');
            setSafeContent(sessionIdDisplay, sanitizeInput(getSessionId()));

            setCurrentSession(session);
            setCurrentDeckType(session.currentDeck);
            currentDeckEl.textContent = deckLabel(session.currentDeck);

            loadCards(cardDecks[session.currentDeck]);

            setParticipants(session.users);
            setIsSpectator(session.users[socket.id]?.isSpectator || false);
            renderParticipants();
            updateVoteStatus(session.users);

            if (window.SPP.roundTimer) {
                window.SPP.roundTimer.start(session.roundStartedAt);
            }

            // Sync consensus streak glow
            applyConsensusStreakGlow(session.consensusStreak || 0);

            if (session.showVotes && session.results) {
                showResults(session.votes, session.results);
            }
        });

        socket.on('user-joined', (newUser) => {
            const participants = getParticipants();
            const isNewArrival = !participants[newUser.id];
            participants[newUser.id] = newUser;

            const currentSession = getCurrentSession();
            if (currentSession) {
                currentSession.participants = participants;
            }
            if (isNewArrival) {
                newlyJoinedIds.add(newUser.id);
            }
            renderParticipants();
            updateVoteStatus(participants);
        });

        socket.on('user-left', (userId) => {
            const participants = getParticipants();
            if (participants[userId]) {
                delete participants[userId];
                const currentSession = getCurrentSession();
                if (currentSession) {
                    currentSession.participants = participants;
                }
                renderParticipants();
                updateVoteStatus(participants);
            }
        });

        socket.on('user-disconnected', (userId) => {
            const participants = getParticipants();
            if (participants[userId]) {
                participants[userId].isConnected = false;
                renderParticipants();
            }
        });

        socket.on('user-removed', (userId) => {
            const participants = getParticipants();
            if (participants[userId]) {
                const soundEnabled = deps.isSoundEnabled ? deps.isSoundEnabled() : false;
                playUserLeaveAnimation(userId, () => {
                    delete participants[userId];
                    const currentSession = getCurrentSession();
                    if (currentSession && currentSession.users) {
                        delete currentSession.users[userId];
                    }
                    if (currentSession && currentSession.votes) {
                        delete currentSession.votes[userId];
                    }
                    renderParticipants();
                    updateVoteStatus();
                }, { soundEnabled });
            }
        });

        socket.on('avatar-updated', (data) => {
            const { userId, avatarPath } = data;
            const participants = getParticipants();
            if (participants[userId]) {
                participants[userId].avatar = avatarPath;
                renderParticipants();
            }
        });

        socket.on('all-votes-in', () => {
            voteStatus.textContent = 'All votes in! Revealing results...';
        });

        socket.on('vote-updated', (data) => {
            const { userId, vote } = data;

            const currentSession = getCurrentSession();
            if (currentSession) {
                if (!currentSession.votes) currentSession.votes = {};
                currentSession.votes[userId] = vote;
            }

            const participantEl = document.querySelector(`[data-user-id="${userId}"]`);
            if (participantEl) {
                const voteIndicator = participantEl.querySelector('.vote-indicator');
                if (voteIndicator) {
                    voteIndicator.classList.remove('hidden');
                    voteIndicator.querySelector('.dbz-vote-card').textContent = '?';
                    participantEl.classList.add('user-has-voted');
                }
            }

            updateVoteStatus(getParticipants());

            if (userId === socket.id) {
                document.querySelectorAll('.dbz-card-btn').forEach((card) => {
                    card.classList.remove('ring-2', 'ring-yellow-400');
                    if (card.textContent === vote) {
                        card.classList.add('ring-2', 'ring-yellow-400');
                    }
                });
            }
        });

        socket.on('voting-complete', (data) => {
            const { votes, results, consensusStreak, allZero } = data;

            const currentSession = getCurrentSession();
            if (currentSession) {
                currentSession.votes = votes;
                currentSession.showVotes = true;
                currentSession.results = results;
            }

            const participants = getParticipants();
            const totalVotes = Object.keys(votes).length;
            const totalConnected = Object.values(participants).filter((p) => p.isConnected).length;
            voteCounter.textContent = `${totalVotes}/${totalConnected} votes`;

            Object.keys(votes).forEach((userId) => {
                const participantEl = document.querySelector(`[data-user-id="${userId}"]`);
                if (!participantEl) return;
                const voteIndicator = participantEl.querySelector('.vote-indicator');
                if (!voteIndicator) return;

                voteIndicator.classList.remove('hidden');
                voteIndicator.querySelector('.dbz-vote-card').textContent = votes[userId];
                voteIndicator.classList.add('reveal-vote');
                setTimeout(() => voteIndicator.classList.remove('reveal-vote'), 500);
            });

            showResults(votes, results);

            // Update table glow based on consensus streak (kicks in at 3+)
            applyConsensusStreakGlow(consensusStreak || 0);

            // All-zero easter egg
            if (allZero) {
                showToast({
                    title: 'Wow, così faciiile!',
                    body: 'All zeros — Krillin approves 👊',
                    variant: 'info',
                    icon: 'fas fa-fist-raised'
                });
            }

            document.querySelectorAll('.dbz-card-btn').forEach((card) => {
                card.disabled = true;
                card.classList.add('opacity-50', 'cursor-not-allowed');
            });
        });

        socket.on('votes-reset', (data) => {
            triggerResetCooldown();
            playResetAnimation({ soundEnabled: deps.isSoundEnabled ? deps.isSoundEnabled() : false });
            resetVoting();

            if (window.SPP.roundTimer) {
                window.SPP.roundTimer.start(data && data.roundStartedAt);
            }

            const currentSession = getCurrentSession();
            if (currentSession) {
                currentSession.votes = {};
                currentSession.showVotes = false;
                currentSession.results = {};
                if (data && data.roundStartedAt) {
                    currentSession.roundStartedAt = data.roundStartedAt;
                }
            }

            showToast({
                title: 'Round reset!',
                body: 'Power up and vote again',
                variant: 'success',
                icon: 'fas fa-redo'
            });
        });

        socket.on('vote-count-updated', (data) => {
            const { current, total } = data;
            voteCounter.textContent = `${current}/${total} votes`;

            if (current === 0) {
                voteStatus.textContent = 'Waiting for votes...';
            } else if (current === total) {
                voteStatus.textContent = 'All votes in! Revealing results...';
            } else {
                const remaining = total - current;
                voteStatus.textContent = `${remaining} more to vote...`;
            }
        });

        socket.on('voting-closed', () => {
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
            notification.textContent = 'Voting is closed! Please wait for the next round.';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
        });

        socket.on('deck-changed', (data) => {
            const { deckType, cards } = data;
            setCurrentDeckType(deckType);
            currentDeckEl.textContent = deckLabel(deckType);
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
            if (reason !== 'io client disconnect') {
                showReconnectNotification();
                setTimeout(() => {
                    if (!socket.connected) {
                        console.log('Attempting to reconnect...');
                        socket.connect();
                    }
                }, 5000);
            }
        });

        // Prevent duplicate join-session on initial connect (the login form already emits).
        // Only rejoin on *reconnects*.
        let hasJoinedOnce = false;
        socket.on('connect', () => {
            console.log('Socket connected');

            const notification = document.querySelector('.reconnect-notification');
            if (notification) notification.remove();

            if (!hasJoinedOnce) {
                hasJoinedOnce = true;
                return;
            }

            const sessionId = getSessionId();
            const user = getUser();
            if (sessionId && user.name) {
                console.log('Rejoining session:', sessionId);
                socket.emit('join-session', {
                    sessionId,
                    user,
                    csrfToken: getCSRFToken()
                });
            }
        });

        socket.on('reconnect', () => updateConnectionStatus('connected'));
        socket.on('reconnect_attempt', () => updateConnectionStatus('connecting'));
        socket.on('reconnect_failed', () => updateConnectionStatus('disconnected'));

        socket.on('error', (data) => {
            console.error('Server error:', data.message);
            showNotification(data.message || 'An error occurred', 'error');
        });
    }

    window.SPP = window.SPP || {};
    window.SPP.socketListeners = { register };
})();
