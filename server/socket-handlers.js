'use strict';

const { sanitizeInput, isValidCsrfToken } = require('./security');
const { sessions } = require('./sessions');
const { cardDecks, calculateResults } = require('./game');

const ALLOWED_EMOJIS = ['👍', '👎', '❓', '🎉', '😂', '🔥', '⚡', '💪'];

/**
 * Registers all socket.io event handlers on the given io server.
 */
function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log('=== NEW USER CONNECTED ===', socket.id);

        socket.on('test', () => {
            console.log('TEST EVENT RECEIVED');
        });

        socket.on('heartbeat', () => {
            Object.keys(sessions).forEach((sessionId) => {
                if (sessions[sessionId].users[socket.id]) {
                    sessions[sessionId].users[socket.id].lastHeartbeat = Date.now();
                }
            });
        });

        socket.on('join-session', (data) => handleJoinSession(io, socket, data));
        socket.on('disconnect', () => handleDisconnect(io, socket));
        socket.on('leave-session', (sessionId) => handleLeaveSession(socket, sessionId));
        socket.on('submit-vote', (data) => handleSubmitVote(io, socket, data));
        socket.on('reset-votes', (data) => handleResetVotes(io, socket, data));
        socket.on('change-deck', (data) => handleChangeDeck(io, data));
        socket.on('send-emoji', (data) => handleSendEmoji(io, socket, data));
        socket.on('update-avatar', (data) => handleUpdateAvatar(io, socket, data));
        socket.on('super-saiyan', (data) => handleSuperSaiyan(io, data));
        socket.on('user-collision', (data) => handleUserCollision(io, data));
        socket.on('toggle-spectator', (data) => handleToggleSpectator(io, socket, data));
    });
}

// --- helpers ---

function emitVoteCount(io, sessionId, session) {
    const connectedPlayers = Object.values(session.users)
        .filter((u) => u.isConnected && !u.isSpectator);
    const playerVotes = Object.keys(session.votes)
        .filter((uid) => session.users[uid] && !session.users[uid].isSpectator);
    io.to(sessionId).emit('vote-count-updated', {
        current: playerVotes.length,
        total: connectedPlayers.length
    });
}

// --- handlers ---

function handleJoinSession(io, socket, data) {
    console.log('JOIN SESSION RECEIVED');
    try {
        const { sessionId, user, csrfToken } = data;

        if (!isValidCsrfToken(csrfToken)) {
            socket.emit('error', { message: 'Invalid request' });
            return;
        }
        if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 50) {
            socket.emit('error', { message: 'Invalid session ID' });
            return;
        }
        if (!user || !user.name || typeof user.name !== 'string' || user.name.length > 100) {
            socket.emit('error', { message: 'Invalid user data' });
            return;
        }

        // Optional persistent ID for rejoin deduplication
        if (user.persistentId) {
            if (typeof user.persistentId !== 'string'
                || user.persistentId.length > 100
                || !/^[a-zA-Z0-9_-]+$/.test(user.persistentId)) {
                user.persistentId = null;
            }
        }

        user.name = sanitizeInput(user.name);
        if (!user.name || user.name.length < 1 || user.name.length > 50) {
            socket.emit('error', { message: 'Invalid user name' });
            return;
        }

        if (user.avatar) {
            user.avatar = sanitizeInput(user.avatar);
            if (!user.avatar.startsWith('/uploads/') || user.avatar.includes('..')) {
                user.avatar = null;
            }
        }

        if (!sessions[sessionId]) {
            sessions[sessionId] = {
                id: sessionId,
                users: {},
                votes: {},
                currentDeck: 'modifiedFibonacci',
                showVotes: false,
                gameActive: false,
                lastActivity: Date.now()
            };
            console.log('Created new session:', sessionId);
        }

        sessions[sessionId].lastActivity = Date.now();

        // Remove stale entries for the same persistent user (dedup on rejoin)
        if (user.persistentId) {
            Object.keys(sessions[sessionId].users).forEach((existingSocketId) => {
                const existing = sessions[sessionId].users[existingSocketId];
                if (existing && existing.persistentId === user.persistentId && existingSocketId !== socket.id) {
                    console.log(`Removing stale entry for ${user.persistentId} (old socket: ${existingSocketId})`);
                    if (sessions[sessionId].votes && sessions[sessionId].votes[existingSocketId]) {
                        sessions[sessionId].votes[socket.id] = sessions[sessionId].votes[existingSocketId];
                        delete sessions[sessionId].votes[existingSocketId];
                    }
                    delete sessions[sessionId].users[existingSocketId];
                    io.to(sessionId).emit('user-removed', existingSocketId);
                }
            });
        }

        sessions[sessionId].users[socket.id] = {
            ...user,
            id: socket.id,
            isConnected: true,
            isSpectator: user.isSpectator || false,
            lastHeartbeat: Date.now()
        };

        socket.join(sessionId);
        console.log(`User ${user.name} (${socket.id}) joined session ${sessionId} as ${user.isSpectator ? 'SPECTATOR' : 'PLAYER'}`);

        socket.emit('session-joined', {
            session: sessions[sessionId],
            cardDecks
        });
        socket.to(sessionId).emit('user-joined', sessions[sessionId].users[socket.id]);
    } catch (error) {
        console.error('Error in join-session:', error);
        socket.emit('error', { message: 'Failed to join session' });
    }
}

function handleDisconnect(io, socket) {
    console.log('User disconnected:', socket.id);

    Object.keys(sessions).forEach((sessionId) => {
        const session = sessions[sessionId];
        if (session && session.users && session.users[socket.id]) {
            console.log(`Removing user ${session.users[socket.id].name} from session ${sessionId}`);

            if (session.votes && session.votes[socket.id]) {
                delete session.votes[socket.id];
            }
            delete session.users[socket.id];

            io.to(sessionId).emit('user-removed', socket.id);
            emitVoteCount(io, sessionId, session);
        }
    });
}

function handleLeaveSession(socket, sessionId) {
    console.log(`User ${socket.id} explicitly leaving session ${sessionId}`);
    if (sessions[sessionId] && sessions[sessionId].users[socket.id]) {
        delete sessions[sessionId].users[socket.id];
        if (sessions[sessionId].votes[socket.id]) {
            delete sessions[sessionId].votes[socket.id];
        }
        socket.to(sessionId).emit('user-left', socket.id);
        socket.leave(sessionId);
    }
}

function handleSubmitVote(io, socket, data) {
    try {
        const { sessionId, vote, csrfToken } = data;

        if (!isValidCsrfToken(csrfToken)) {
            socket.emit('error', { message: 'Invalid request' });
            return;
        }
        const session = sessions[sessionId];
        if (!session) {
            socket.emit('error', { message: 'Session not found' });
            return;
        }
        if (!session.users[socket.id]) {
            socket.emit('error', { message: 'User not in session' });
            return;
        }
        if (session.users[socket.id].isSpectator) {
            socket.emit('error', { message: 'Spectators cannot vote' });
            return;
        }

        const currentDeck = cardDecks[session.currentDeck];
        if (!currentDeck || !currentDeck.includes(vote)) {
            socket.emit('error', { message: 'Invalid vote value' });
            return;
        }

        if (session.showVotes) {
            socket.emit('voting-closed');
            return;
        }

        session.votes[socket.id] = vote;

        io.to(sessionId).emit('vote-updated', {
            userId: socket.id,
            vote,
            voterName: session.users[socket.id]?.name || 'Unknown'
        });

        emitVoteCount(io, sessionId, session);

        const connectedPlayers = Object.values(session.users)
            .filter((u) => u.isConnected && !u.isSpectator);
        const allPlayersVoted = connectedPlayers.length > 0
            && connectedPlayers.every((u) => session.votes[u.id]);

        if (allPlayersVoted) {
            const playerVoteValues = Object.entries(session.votes)
                .filter(([userId]) => session.users[userId] && !session.users[userId].isSpectator)
                .map(([, v]) => v)
                .filter((v) => v !== '?');
            const results = calculateResults(playerVoteValues);

            session.showVotes = true;
            session.results = results;

            io.to(sessionId).emit('voting-complete', {
                votes: session.votes,
                results
            });

            if (results.consensus) {
                io.to(sessionId).emit('celebrate-consensus');
            }
        }
    } catch (error) {
        console.error('Error in submit-vote:', error);
        socket.emit('error', { message: 'Failed to submit vote' });
    }
}

function handleResetVotes(io, socket, data) {
    try {
        const { sessionId, csrfToken } = data;
        if (!isValidCsrfToken(csrfToken)) {
            socket.emit('error', { message: 'Invalid request' });
            return;
        }

        console.log('Reset votes requested for session:', sessionId);

        const session = sessions[sessionId];
        if (!session) {
            console.error('Session not found for reset:', sessionId);
            return;
        }

        session.votes = {};
        session.showVotes = false;
        session.results = {};

        io.to(sessionId).emit('votes-reset');

        const connectedPlayers = Object.values(session.users)
            .filter((u) => u.isConnected && !u.isSpectator);
        io.to(sessionId).emit('vote-count-updated', {
            current: 0,
            total: connectedPlayers.length
        });
    } catch (error) {
        console.error('Error in reset-votes:', error);
        socket.emit('error', { message: 'Failed to reset votes' });
    }
}

function handleChangeDeck(io, data) {
    const { sessionId, deckType } = data;
    if (sessions[sessionId] && cardDecks[deckType]) {
        console.log(`Changing deck to ${deckType} for session ${sessionId}`);
        sessions[sessionId].currentDeck = deckType;
        io.to(sessionId).emit('deck-changed', {
            deckType,
            cards: cardDecks[deckType]
        });
    }
}

function handleSendEmoji(io, socket, data) {
    try {
        const { sessionId, emoji, targetUserId } = data;
        if (!sessionId || !emoji || typeof emoji !== 'string') return;
        if (!ALLOWED_EMOJIS.includes(emoji)) return;

        if (sessions[sessionId] && sessions[sessionId].users[socket.id]) {
            const fromUser = {
                id: sessions[sessionId].users[socket.id].id,
                name: sanitizeInput(sessions[sessionId].users[socket.id].name)
            };

            if (targetUserId && sessions[sessionId].users[targetUserId]) {
                io.to(sessionId).emit('emoji-received', {
                    emoji,
                    from: fromUser,
                    to: sanitizeInput(targetUserId)
                });
            } else {
                io.to(sessionId).emit('emoji-received', {
                    emoji,
                    from: fromUser,
                    to: null
                });
            }
        }
    } catch (error) {
        console.error('Error sending emoji:', error);
    }
}

function handleUpdateAvatar(io, socket, data) {
    try {
        const { sessionId, avatarPath } = data;
        if (!sessionId || !avatarPath || typeof avatarPath !== 'string') {
            socket.emit('error', { message: 'Invalid avatar data' });
            return;
        }

        const sanitizedPath = sanitizeInput(avatarPath);
        if (!sanitizedPath.startsWith('/uploads/') || sanitizedPath.includes('..')) {
            socket.emit('error', { message: 'Invalid avatar path' });
            return;
        }

        if (sessions[sessionId] && sessions[sessionId].users[socket.id]) {
            sessions[sessionId].users[socket.id].avatar = sanitizedPath;
            io.to(sessionId).emit('avatar-updated', {
                userId: socket.id,
                avatarPath: sanitizedPath
            });
        }
    } catch (error) {
        console.error('Error updating avatar:', error);
        socket.emit('error', { message: 'Failed to update avatar' });
    }
}

function handleSuperSaiyan(io, data) {
    const { sessionId, userId } = data;
    console.log(`Super Saiyan activated by user ${userId} in session ${sessionId}`);
    io.to(sessionId).emit('super-saiyan-mode', { userId });
}

function handleUserCollision(io, data) {
    const { sessionId, attackerId, targetId } = data;
    if (sessions[sessionId]) {
        io.to(sessionId).emit('collision-animation', {
            attackerId: sanitizeInput(attackerId),
            targetId: sanitizeInput(targetId),
            attackerName: sanitizeInput(sessions[sessionId].users[attackerId]?.name || 'Unknown'),
            targetName: sanitizeInput(sessions[sessionId].users[targetId]?.name || 'Unknown')
        });
    }
}

function handleToggleSpectator(io, socket, data) {
    try {
        const { sessionId, isSpectator, csrfToken } = data;

        if (!isValidCsrfToken(csrfToken)) {
            socket.emit('error', { message: 'Invalid request' });
            return;
        }

        const session = sessions[sessionId];
        if (!session || !session.users[socket.id]) {
            socket.emit('error', { message: 'Session not found' });
            return;
        }

        session.users[socket.id].isSpectator = isSpectator;

        if (isSpectator && session.votes[socket.id]) {
            delete session.votes[socket.id];
        }

        io.to(sessionId).emit('spectator-updated', {
            userId: socket.id,
            isSpectator,
            userName: session.users[socket.id].name
        });

        emitVoteCount(io, sessionId, session);
    } catch (error) {
        console.error('Error toggling spectator:', error);
        socket.emit('error', { message: 'Failed to toggle spectator mode' });
    }
}

module.exports = { registerSocketHandlers };
