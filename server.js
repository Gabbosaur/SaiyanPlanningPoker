const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

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

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.socket.io https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; img-src 'self' data:; font-src 'self' https://cdnjs.cloudflare.com; connect-src 'self' ws: wss:; media-src 'self';");
    next();
});

// Input validation and sanitization
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
    }).trim();
}

// Rate limiting for file uploads
const uploadAttempts = new Map();
function checkUploadRate(ip) {
    const now = Date.now();
    const attempts = uploadAttempts.get(ip) || [];
    const recentAttempts = attempts.filter(time => now - time < 60000); // 1 minute window
    
    if (recentAttempts.length >= 5) { // Max 5 uploads per minute
        return false;
    }
    
    recentAttempts.push(now);
    uploadAttempts.set(ip, recentAttempts);
    return true;
}

// Increase payload size limit with validation
app.use(express.json({ 
    limit: '1mb', // Reduced from 10mb for security
    verify: (req, res, buf) => {
        if (buf.length > 1024 * 1024) { // 1MB limit
            throw new Error('Request too large');
        }
    }
}));
app.use(express.urlencoded({ 
    limit: '1mb', 
    extended: true,
    verify: (req, res, buf) => {
        if (buf.length > 1024 * 1024) {
            throw new Error('Request too large');
        }
    }
}));

// Serve static files with security
app.use(express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    index: ['index.html'],
    setHeaders: (res, filePath) => {
        // Prevent execution of uploaded files
        if (filePath.includes('/uploads/')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }
    }
}));

// Secure uploads directory
app.use('/uploads', (req, res, next) => {
    // Validate file path to prevent directory traversal
    const requestedPath = path.normalize(req.path);
    if (requestedPath.includes('..') || requestedPath.includes('~')) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}, express.static(path.join(__dirname, 'public/uploads'), {
    dotfiles: 'deny',
    setHeaders: (res) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// Configure multer for avatar uploads with security
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.resolve(__dirname, 'public/uploads'); // Use resolve to prevent traversal
        try {
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
            }
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        // Generate secure filename
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        
        // Validate file extension
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        if (!allowedExts.includes(ext)) {
            return cb(new Error('Invalid file type'));
        }
        
        cb(null, `avatar-${uniqueSuffix}${ext}`);
    }
});

// File filter for security
const fileFilter = (req, file, cb) => {
    // Check MIME type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
        return cb(new Error('Invalid file type'), false);
    }
    
    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
        return cb(new Error('File too large'), false);
    }
    
    cb(null, true);
};

const upload = multer({ 
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1
    }
});

// Handle avatar upload with security
app.post('/upload-avatar', (req, res) => {
    // Check rate limiting
    if (!checkUploadRate(req.ip)) {
        return res.status(429).json({ error: 'Too many upload attempts' });
    }
    
    // Basic CSRF protection
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken || csrfToken.length < 32) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    
    upload.single('avatar')(req, res, (err) => {
        if (err) {
            console.error('Upload error:', err.message);
            return res.status(400).json({ error: sanitizeInput(err.message) });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Validate uploaded file exists and is in correct location
        const filePath = path.resolve(__dirname, 'public/uploads', req.file.filename);
        if (!filePath.startsWith(path.resolve(__dirname, 'public/uploads'))) {
            fs.unlinkSync(filePath); // Delete potentially malicious file
            return res.status(400).json({ error: 'Invalid file path' });
        }
        
        res.json({ path: sanitizeInput(`/uploads/${req.file.filename}`) });
    });
});

// Add this route near the other audio file handling
// Handle audio files securely
app.get('/sounds/:filename', (req, res) => {
    const filename = req.params.filename;
    
    // Validate filename to prevent path traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    
    // Only allow specific audio files
    const allowedFiles = ['punch.mp3', 'super-saiyan.mp3'];
    if (!allowedFiles.includes(filename)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    const audioPath = path.resolve(__dirname, 'public', 'sounds', filename);
    
    // Ensure path is within sounds directory
    if (!audioPath.startsWith(path.resolve(__dirname, 'public', 'sounds'))) {
        return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    try {
        const stat = fs.statSync(audioPath);
        const fileSize = stat.size;

        // Set proper headers
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Accept-Ranges', 'none');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // Stream the file
        const readStream = fs.createReadStream(audioPath);
        readStream.on('error', () => {
            res.status(500).json({ error: 'File read error' });
        });
        readStream.pipe(res);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
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
let heartbeatInterval = setInterval(() => {
    try {
        Object.keys(sessions).forEach(sessionId => {
            const session = sessions[sessionId];
            if (!session || !session.users) return;

            Object.keys(session.users).forEach(userId => {
                const user = session.users[userId];
                if (!user) return;

                // Only mark as disconnected if no heartbeat for 30 minutes
                if (user.isConnected && user.lastHeartbeat &&
                    Date.now() - user.lastHeartbeat > 1800000) { // 30 minutes in milliseconds
                    console.log(`User ${user.name} (${userId}) timed out after 30 minutes`);
                    user.isConnected = false;
                    io.to(sessionId).emit('user-disconnected', userId);
                }
            });
        });
    } catch (error) {
        console.error('Error in heartbeat mechanism:', error);
    }
}, 60000); // Check every minute instead of every 10 seconds

// Session cleanup - remove inactive sessions after 24 hours
let sessionCleanupInterval = setInterval(() => {
    try {
        const now = Date.now();
        Object.keys(sessions).forEach(sessionId => {
            const session = sessions[sessionId];
            if (!session || !session.users) return;

            // Check if session has any active users
            const hasActiveUsers = Object.values(session.users).some(user =>
                user && user.isConnected && (now - user.lastHeartbeat) < 1800000
            );

            // Remove session if no active users for 24 hours
            if (!hasActiveUsers && (now - session.lastActivity) > 86400000) { // 24 hours
                console.log(`Removing inactive session: ${sessionId}`);
                delete sessions[sessionId];
            }
        });
    } catch (error) {
        console.error('Error in session cleanup:', error);
    }
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
        try {
            const { sessionId, user, csrfToken } = data;
            
            // Validate CSRF token
            if (!csrfToken || typeof csrfToken !== 'string' || csrfToken.length < 32) {
                socket.emit('error', { message: 'Invalid request' });
                return;
            }

            // Validate input
            if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 50) {
                socket.emit('error', { message: 'Invalid session ID' });
                return;
            }

            if (!user || !user.name || typeof user.name !== 'string' || user.name.length > 100) {
                socket.emit('error', { message: 'Invalid user data' });
                return;
            }

            // Sanitize and validate user input
            user.name = sanitizeInput(user.name);
            if (!user.name || user.name.length < 1 || user.name.length > 50) {
                socket.emit('error', { message: 'Invalid user name' });
                return;
            }
            
            // Sanitize avatar path if present
            if (user.avatar) {
                user.avatar = sanitizeInput(user.avatar);
                // Validate avatar path format
                if (!user.avatar.startsWith('/uploads/') || user.avatar.includes('..')) {
                    user.avatar = null; // Remove invalid avatar
                }
            }

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
        } catch (error) {
            console.error('Error in join-session:', error);
            socket.emit('error', { message: 'Failed to join session' });
        }
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
        try {
            const { sessionId, vote, csrfToken } = data;
            
            // Validate CSRF token
            if (!csrfToken || typeof csrfToken !== 'string' || csrfToken.length < 32) {
                socket.emit('error', { message: 'Invalid request' });
                return;
            }
            const session = sessions[sessionId];

            // Validate session exists
            if (!session) {
                socket.emit('error', { message: 'Session not found' });
                return;
            }

            // Validate user is in session
            if (!session.users[socket.id]) {
                socket.emit('error', { message: 'User not in session' });
                return;
            }

            // Validate vote value
            const currentDeck = cardDecks[session.currentDeck];
            if (!currentDeck || !currentDeck.includes(vote)) {
                socket.emit('error', { message: 'Invalid vote value' });
                return;
            }

            // Don't allow vote changes if voting is complete
            if (session.showVotes) {
                socket.emit('voting-closed');
                return;
            }

            // Update or create the vote for this user
            session.votes[socket.id] = vote;

            // Broadcast the updated vote to ALL clients (not just the current user)
            io.to(sessionId).emit('vote-updated', {
                userId: socket.id,
                vote: vote,
                voterName: session.users[socket.id]?.name || 'Unknown'
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
        } catch (error) {
            console.error('Error in submit-vote:', error);
            socket.emit('error', { message: 'Failed to submit vote' });
        }
    });

    // Handle reset votes
    socket.on('reset-votes', (data) => {
        try {
            const { sessionId, csrfToken } = data;
            
            // Validate CSRF token
            if (!csrfToken || typeof csrfToken !== 'string' || csrfToken.length < 32) {
                socket.emit('error', { message: 'Invalid request' });
                return;
            }
            
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
        } catch (error) {
            console.error('Error in reset-votes:', error);
            socket.emit('error', { message: 'Failed to reset votes' });
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

    // Handle emoji reaction with validation
    socket.on('send-emoji', (data) => {
        try {
            const { sessionId, emoji, targetUserId } = data;
            
            // Validate inputs
            if (!sessionId || !emoji || typeof emoji !== 'string') {
                return; // Silently ignore invalid emoji data
            }
            
            // Validate emoji (only allow specific emojis)
            const allowedEmojis = ['👍', '👎', '❓', '🎉', '😂', '🔥', '⚡', '💪'];
            if (!allowedEmojis.includes(emoji)) {
                return; // Silently ignore invalid emojis
            }

            if (sessions[sessionId] && sessions[sessionId].users[socket.id]) {
                const fromUser = {
                    id: sessions[sessionId].users[socket.id].id,
                    name: sanitizeInput(sessions[sessionId].users[socket.id].name)
                };
                
                if (targetUserId && sessions[sessionId].users[targetUserId]) {
                    // Send to specific user
                    io.to(sessionId).emit('emoji-received', {
                        emoji,
                        from: fromUser,
                        to: sanitizeInput(targetUserId)
                    });
                } else {
                    // Broadcast to all
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
    });

    // Handle avatar update with validation
    socket.on('update-avatar', (data) => {
        try {
            const { sessionId, avatarPath } = data;
            
            // Validate inputs
            if (!sessionId || !avatarPath || typeof avatarPath !== 'string') {
                socket.emit('error', { message: 'Invalid avatar data' });
                return;
            }
            
            // Sanitize and validate avatar path
            const sanitizedPath = sanitizeInput(avatarPath);
            if (!sanitizedPath.startsWith('/uploads/') || sanitizedPath.includes('..')) {
                socket.emit('error', { message: 'Invalid avatar path' });
                return;
            }

            if (sessions[sessionId] && sessions[sessionId].users[socket.id]) {
                sessions[sessionId].users[socket.id].avatar = sanitizedPath;

                // Notify all users
                io.to(sessionId).emit('avatar-updated', {
                    userId: socket.id,
                    avatarPath: sanitizedPath
                });
            }
        } catch (error) {
            console.error('Error updating avatar:', error);
            socket.emit('error', { message: 'Failed to update avatar' });
        }
    });

    socket.on('super-saiyan', (data) => {
        const { sessionId, userId } = data;
        console.log(`Super Saiyan activated by user ${userId} in session ${sessionId}`);
        console.log(`Session exists: ${!!sessions[sessionId]}`);
        console.log(`Broadcasting to room: ${sessionId}`);
        // Broadcast to all players in the session
        io.to(sessionId).emit('super-saiyan-mode', { userId });
        console.log(`Super Saiyan mode broadcasted`);
    });


    // Add this to the Socket.io connection handling section
    // Handle collision animation
    socket.on('user-collision', (data) => {
        const { sessionId, attackerId, targetId } = data;

        if (sessions[sessionId]) {
            // Broadcast to all users in the session with sanitized names
            io.to(sessionId).emit('collision-animation', {
                attackerId: sanitizeInput(attackerId),
                targetId: sanitizeInput(targetId),
                attackerName: sanitizeInput(sessions[sessionId].users[attackerId]?.name || 'Unknown'),
                targetName: sanitizeInput(sessions[sessionId].users[targetId]?.name || 'Unknown')
            });
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\nShutting down server gracefully...');

    // Clear intervals
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    if (sessionCleanupInterval) {
        clearInterval(sessionCleanupInterval);
    }

    // Close server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server gracefully...');

    // Clear intervals
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    if (sessionCleanupInterval) {
        clearInterval(sessionCleanupInterval);
    }

    // Close server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`Server running securely on ${HOST}:${PORT}`);
});