const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Socket.IO configuration for longer sessions
    pingTimeout: 60000,        // 60 seconds
    pingInterval: 25000,       // 25 seconds
    connectTimeout: 45000,     // 45 seconds
});

// Increase payload size limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Configure multer for avatar uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `avatar-${uniqueSuffix}.${file.originalname.split('.').pop()}`);
    }
});

const upload = multer({ storage });

// Handle avatar upload
app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ path: `/uploads/${req.file.filename}` });
});

// Add this route near the other audio file handling
// Handle punch sound file specifically to prevent range request issues
app.get('/sounds/punch.mp3', (req, res) => {
    const audioPath = path.join(__dirname, 'public', 'sounds', 'punch.mp3');

    // Check if file exists
    if (!fs.existsSync(audioPath)) {
        return res.status(404).send('Punch sound file not found');
    }

    // Get file stats
    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;

    // Set proper headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Accept-Ranges', 'none'); // Disable range requests

    // Stream the file
    const readStream = fs.createReadStream(audioPath);
    readStream.pipe(res);
});

// Game sessions storage
const sessions = {};

// Card deck options
const cardDecks = {
    fibonacci: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, '?'],
    modifiedFibonacci: [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100, '?'],
    tshirt: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?']
};

// Helper functions
function calculateMode(votes) {
    const frequency = {};
    let maxFreq = 0;
    let mode = null;

    votes.forEach(vote => {
        if (vote !== '?') {
            frequency[vote] = (frequency[vote] || 0) + 1;
            if (frequency[vote] > maxFreq) {
                maxFreq = frequency[vote];
                mode = vote;
            }
        }
    });

    return mode;
}

function calculateAverage(votes) {
    const numericVotes = votes.filter(vote => vote !== '?').map(Number);
    if (numericVotes.length === 0) return null;

    const sum = numericVotes.reduce((acc, val) => acc + val, 0);
    return (sum / numericVotes.length).toFixed(2);
}

function checkConsensus(votes) {
    const validVotes = votes.filter(vote => vote !== '?');
    if (validVotes.length === 0) return false;

    const firstVote = validVotes[0];
    return validVotes.every(vote => vote === firstVote);
}

function calculateResults(votes) {
    if (votes.length === 0) {
        return {
            mode: '-',
            average: '-',
            consensus: false
        };
    }

    // Calculate mode (most frequent value)
    const frequency = {};
    votes.forEach(vote => {
        frequency[vote] = (frequency[vote] || 0) + 1;
    });

    const mode = Object.keys(frequency).reduce((a, b) =>
        frequency[a] > frequency[b] ? a : b
    );

    // Calculate average (for numeric votes)
    const numericVotes = votes.filter(vote => !isNaN(vote)).map(Number);
    const average = numericVotes.length > 0
        ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1)
        : '-';

    // Check for consensus (70% agreement)
    const consensus = frequency[mode] / votes.length >= 0.7;

    return {
        mode,
        average,
        consensus
    };
}

// Heartbeat mechanism to detect disconnected users
// More lenient heartbeat mechanism
setInterval(() => {
    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        Object.keys(session.users).forEach(userId => {
            const user = session.users[userId];
            // Only mark as disconnected if no heartbeat for 30 minutes
            if (user.isConnected && user.lastHeartbeat &&
                Date.now() - user.lastHeartbeat > 1800000) { // 30 minutes in milliseconds
                console.log(`User ${user.name} (${userId}) timed out after 30 minutes`);
                user.isConnected = false;
                io.to(sessionId).emit('user-disconnected', userId);
            }
        });
    });
}, 60000); // Check every minute instead of every 10 seconds

// Session cleanup - remove inactive sessions after 24 hours
setInterval(() => {
    const now = Date.now();
    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        // Check if session has any active users
        const hasActiveUsers = Object.values(session.users).some(user =>
            user.isConnected && (now - user.lastHeartbeat) < 1800000
        );

        // Remove session if no active users for 24 hours
        if (!hasActiveUsers && (now - session.lastActivity) > 86400000) { // 24 hours
            console.log(`Removing inactive session: ${sessionId}`);
            delete sessions[sessionId];
        }
    });
}, 3600000); // Check every hour

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Heartbeat response
    socket.on('heartbeat', () => {
        Object.keys(sessions).forEach(sessionId => {
            if (sessions[sessionId].users[socket.id]) {
                sessions[sessionId].users[socket.id].lastHeartbeat = Date.now();
            }
        });
    });

    // Create or join a session
    socket.on('join-session', (data) => {
        const { sessionId, user } = data;

        // Initialize session if it doesn't exist
        if (!sessions[sessionId]) {
            sessions[sessionId] = {
                id: sessionId,
                users: {},
                votes: {},
                currentDeck: 'modifiedFibonacci',
                showVotes: false,
                gameActive: false,
                lastActivity: Date.now() // Track session activity
            };
            console.log('Created new session:', sessionId);
        }

        // Update session activity
        sessions[sessionId].lastActivity = Date.now();

        // Add user to session
        sessions[sessionId].users[socket.id] = {
            ...user,
            id: socket.id,
            isConnected: true,
            lastHeartbeat: Date.now()
        };

        // Join socket room
        socket.join(sessionId);
        console.log(`User ${user.name} (${socket.id}) joined session ${sessionId}`);

        // Send session data to client
        socket.emit('session-joined', {
            session: sessions[sessionId],
            cardDecks
        });

        // Notify other users
        socket.to(sessionId).emit('user-joined', sessions[sessionId].users[socket.id]);
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Find and update user in all sessions
        Object.keys(sessions).forEach(sessionId => {
            if (sessions[sessionId].users[socket.id]) {
                console.log(`Marking user ${sessions[sessionId].users[socket.id].name} as disconnected`);
                sessions[sessionId].users[socket.id].isConnected = false;
                io.to(sessionId).emit('user-disconnected', socket.id);
            }
        });
    });

    // Handle explicit user leave
    socket.on('leave-session', (sessionId) => {
        console.log(`User ${socket.id} explicitly leaving session ${sessionId}`);

        if (sessions[sessionId] && sessions[sessionId].users[socket.id]) {
            // Remove user from session
            delete sessions[sessionId].users[socket.id];

            // Remove user's vote if exists
            if (sessions[sessionId].votes[socket.id]) {
                delete sessions[sessionId].votes[socket.id];
            }

            // Notify other users
            socket.to(sessionId).emit('user-left', socket.id);

            // Leave socket room
            socket.leave(sessionId);
        }
    });

    // Handle vote submission
    socket.on('submit-vote', (data) => {
        const { sessionId, vote } = data;
        const session = sessions[sessionId];

        // Don't allow vote changes if voting is complete
        if (session.showVotes) {
            // Optionally notify the user that voting is closed
            socket.emit('voting-closed');
            return;
        }

        // Update or create the vote for this user
        session.votes[socket.id] = vote;

        // Emit the updated vote to all clients
        io.to(sessionId).emit('vote-updated', {
            userId: socket.id,
            vote: vote
        });

        // Update vote count
        const connectedUsers = Object.values(session.users).filter(user => user.isConnected);
        const votesCount = Object.keys(session.votes).length;

        io.to(sessionId).emit('vote-count-updated', {
            current: votesCount,
            total: connectedUsers.length
        });

        // Check if all connected users have voted
        if (votesCount === connectedUsers.length) {
            // Calculate results
            const voteValues = Object.values(session.votes).filter(vote => vote !== '?');
            const results = calculateResults(voteValues);

            // Mark session as showing votes
            session.showVotes = true;
            session.results = results;

            // Emit voting complete event
            io.to(sessionId).emit('voting-complete', {
                votes: session.votes,
                results: results
            });

            // Check for consensus and trigger celebration
            if (results.consensus) {
                io.to(sessionId).emit('celebrate-consensus');
            }
        }
    });

    // Handle reset votes
    socket.on('reset-votes', (sessionId) => {
        console.log('Reset votes requested for session:', sessionId);

        const session = sessions[sessionId];
        if (session) {
            // Reset session data
            session.votes = {};
            session.showVotes = false;
            session.results = {};

            console.log('Session data reset, notifying clients');

            // Notify all clients
            io.to(sessionId).emit('votes-reset');

            // Also update vote count
            const connectedUsers = Object.values(session.users).filter(user => user.isConnected);
            io.to(sessionId).emit('vote-count-updated', {
                current: 0,
                total: connectedUsers.length
            });
        } else {
            console.error('Session not found for reset:', sessionId);
        }
    });

    // Handle card deck change - FIXED
    socket.on('change-deck', (data) => {
        const { sessionId, deckType } = data;

        if (sessions[sessionId] && cardDecks[deckType]) {
            console.log(`Changing deck to ${deckType} for session ${sessionId}`);
            sessions[sessionId].currentDeck = deckType;

            // Broadcast to all users in the session
            io.to(sessionId).emit('deck-changed', {
                deckType,
                cards: cardDecks[deckType]
            });
        }
    });

    // Handle emoji reaction
    socket.on('send-emoji', (data) => {
        const { sessionId, emoji, targetUserId } = data;

        if (sessions[sessionId]) {
            if (targetUserId) {
                // Send to specific user
                io.to(sessionId).emit('emoji-received', {
                    emoji,
                    from: sessions[sessionId].users[socket.id],
                    to: targetUserId
                });
            } else {
                // Broadcast to all
                io.to(sessionId).emit('emoji-received', {
                    emoji,
                    from: sessions[sessionId].users[socket.id],
                    to: null
                });
            }
        }
    });

    // Handle avatar update
    socket.on('update-avatar', (data) => {
        const { sessionId, avatarPath } = data;

        if (sessions[sessionId] && sessions[sessionId].users[socket.id]) {
            sessions[sessionId].users[socket.id].avatar = avatarPath;

            // Notify all users
            io.to(sessionId).emit('avatar-updated', {
                userId: socket.id,
                avatarPath
            });
        }
    });

    // Add this to the Socket.io connection handling section
    // Handle collision animation
    socket.on('user-collision', (data) => {
        const { sessionId, attackerId, targetId } = data;

        if (sessions[sessionId]) {
            // Broadcast to all users in the session
            io.to(sessionId).emit('collision-animation', {
                attackerId,
                targetId,
                attackerName: sessions[sessionId].users[attackerId]?.name || 'Unknown',
                targetName: sessions[sessionId].users[targetId]?.name || 'Unknown'
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});