'use strict';

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const { securityHeaders } = require('./server/security');
const { registerUploadRoute } = require('./server/uploads');
const { registerSocketHandlers } = require('./server/socket-handlers');
const { startBackgroundJobs, stopBackgroundJobs } = require('./server/sessions');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60_000,
    pingInterval: 25_000,
    connectTimeout: 45_000
});

// --- Middleware ---

app.use(securityHeaders);

app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        if (buf.length > 1024 * 1024) throw new Error('Request too large');
    }
}));

app.use(express.urlencoded({
    limit: '1mb',
    extended: true,
    verify: (req, res, buf) => {
        if (buf.length > 1024 * 1024) throw new Error('Request too large');
    }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    index: ['index.html'],
    setHeaders: (res, filePath) => {
        if (filePath.includes('/uploads/')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }
    }
}));

// Secure uploads directory
app.use('/uploads', (req, res, next) => {
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

// --- Routes ---

registerUploadRoute(app);

// Secure audio file serving
app.get('/sounds/:filename', (req, res) => {
    const filename = req.params.filename;

    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const allowedFiles = ['punch.mp3', 'super-saiyan.mp3'];
    if (!allowedFiles.includes(filename)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const audioPath = path.resolve(__dirname, 'public', 'sounds', filename);
    if (!audioPath.startsWith(path.resolve(__dirname, 'public', 'sounds'))) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    try {
        const stat = fs.statSync(audioPath);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'none');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        const readStream = fs.createReadStream(audioPath);
        readStream.on('error', () => res.status(500).json({ error: 'File read error' }));
        readStream.pipe(res);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Socket.io + background jobs ---

console.log('Setting up socket handlers...');
registerSocketHandlers(io);
startBackgroundJobs(io);

// --- Error handlers ---

app.use((error, req, res, next) => {
    console.error('Server error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

function shutdown() {
    console.log('\nShutting down server gracefully...');
    stopBackgroundJobs();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// --- Start ---

const PORT = process.env.PORT || 3000;
console.log('Starting server...');
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=== SERVER STARTED ON PORT ${PORT} ===`);
    console.log('Server is ready to accept connections');
});

module.exports = { app, server, io };
