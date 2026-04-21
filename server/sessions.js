'use strict';

// Shared in-memory session store + background cleanup tasks.

const sessions = {};

const INACTIVE_TIMEOUT_MS = 1_800_000; // 30 minutes of no heartbeat -> remove user
const HEARTBEAT_CHECK_INTERVAL_MS = 30_000;
const SESSION_CLEANUP_INTERVAL_MS = 3_600_000; // 1 hour
const SESSION_IDLE_THRESHOLD_MS = 86_400_000; // 24 hours

let heartbeatInterval = null;
let sessionCleanupInterval = null;

/**
 * Starts background jobs that remove inactive users and empty sessions.
 * @param {import('socket.io').Server} io
 */
function startBackgroundJobs(io) {
    stopBackgroundJobs();

    heartbeatInterval = setInterval(() => {
        try {
            Object.keys(sessions).forEach((sessionId) => {
                const session = sessions[sessionId];
                if (!session || !session.users) return;

                Object.keys(session.users).forEach((userId) => {
                    const user = session.users[userId];
                    if (!user) return;

                    if (user.lastHeartbeat && Date.now() - user.lastHeartbeat > INACTIVE_TIMEOUT_MS) {
                        console.log(`User ${user.name} (${userId}) removed due to inactivity`);

                        if (session.votes && Object.hasOwn(session.votes, userId)) {
                            delete session.votes[userId];
                        }
                        delete session.users[userId];

                        io.to(sessionId).emit('user-removed', userId);

                        const connectedPlayers = Object.values(session.users)
                            .filter((u) => u.isConnected && !u.isSpectator);
                        const playerVotes = Object.keys(session.votes)
                            .filter((uid) => session.users[uid] && !session.users[uid].isSpectator);

                        io.to(sessionId).emit('vote-count-updated', {
                            current: playerVotes.length,
                            total: connectedPlayers.length
                        });
                    }
                });
            });
        } catch (error) {
            console.error('Error in heartbeat mechanism:', error);
        }
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    sessionCleanupInterval = setInterval(() => {
        try {
            const now = Date.now();
            Object.keys(sessions).forEach((sessionId) => {
                const session = sessions[sessionId];
                if (!session || !session.users) return;

                const hasActiveUsers = Object.values(session.users).some((user) =>
                    user && user.isConnected && (now - user.lastHeartbeat) < INACTIVE_TIMEOUT_MS
                );

                if (!hasActiveUsers && (now - session.lastActivity) > SESSION_IDLE_THRESHOLD_MS) {
                    console.log(`Removing inactive session: ${sessionId}`);
                    delete sessions[sessionId];
                }
            });
        } catch (error) {
            console.error('Error in session cleanup:', error);
        }
    }, SESSION_CLEANUP_INTERVAL_MS);
}

function stopBackgroundJobs() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    if (sessionCleanupInterval) {
        clearInterval(sessionCleanupInterval);
        sessionCleanupInterval = null;
    }
}

module.exports = {
    sessions,
    startBackgroundJobs,
    stopBackgroundJobs,
    INACTIVE_TIMEOUT_MS
};
