'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { sanitizeInput, checkUploadRate } = require('./security');

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.resolve(__dirname, '..', 'public/uploads');
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
        const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();

        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return cb(new Error('Invalid file type'));
        }

        cb(null, `avatar-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
        return cb(new Error('Invalid file type'), false);
    }
    if (file.size > MAX_FILE_SIZE) {
        return cb(new Error('File too large'), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 }
});

/**
 * Registers the /upload-avatar POST route on the given express app.
 */
function registerUploadRoute(app) {
    app.post('/upload-avatar', (req, res) => {
        if (!checkUploadRate(req.ip)) {
            return res.status(429).json({ error: 'Too many upload attempts' });
        }

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

            const uploadsRoot = path.resolve(__dirname, '..', 'public/uploads');
            const filePath = path.resolve(uploadsRoot, req.file.filename);
            if (!filePath.startsWith(uploadsRoot)) {
                try { fs.unlinkSync(filePath); } catch { /* ignore */ }
                return res.status(400).json({ error: 'Invalid file path' });
            }

            res.json({ path: sanitizeInput(`/uploads/${req.file.filename}`) });
        });
    });
}

module.exports = { registerUploadRoute };
