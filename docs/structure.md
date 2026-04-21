# DBZ Planning Poker - Project Structure

## Directory Organization

### Root Structure
```
dbz-planning-poker/
├── server.js             # Entry point: express app, middleware, routes, listen
├── server/               # Server-side modules (see below)
├── public/               # Static client-side assets
├── tests/                # Jest test suites
├── docs/                 # Project documentation
├── package.json
└── README.md
```

### Server Modules (`server/`)
```
server/
├── security.js           # sanitizeInput, CSRF, rate limiting, CSP headers
├── uploads.js            # Multer config + /upload-avatar route
├── game.js               # Card decks + result calculation (mode/avg/consensus)
├── sessions.js           # In-memory session store + background cleanup jobs
└── socket-handlers.js    # All socket.io event handlers (join, vote, reset, etc.)
```

### Public Directory (`public/`)
```
public/
├── index.html            # Single-page entry point
├── css/                  # Stylesheets split by feature
│   ├── style.css              # Main layout + components
│   ├── card-animations.css    # Floating card effects
│   ├── card-deal.css          # Card dealing animations
│   ├── vote-glow.css          # Vote reveal glow effect
│   ├── reset-effect.css       # Reset-round flash animation
│   ├── user-transitions.css   # User join/leave (fly-in + dematerialize)
│   ├── super-saiyan.css       # DBZ transformation effects
│   ├── halloween-theme.css    # October theme
│   ├── christmas-theme.css    # December theme
│   └── monthly-themes.css     # 12-month seasonal themes
├── js/                   # Client-side modules (namespaced under window.SPP)
│   ├── utils.js               # sanitize, CSRF, persistent user ID, audio fade, notifications
│   ├── animations.js          # Reset wave, user join fly-in, user leave dematerialize
│   ├── themes.js              # Monthly/Halloween/Christmas themes + applyTheme
│   ├── music-player.js        # Music panel + playlist (standalone singleton)
│   ├── avatar-effects.js      # Collision punches, Super Saiyan, celebration overlay
│   ├── socket-listeners.js    # All socket.io client event listeners
│   ├── socket.js              # (placeholder, currently unused)
│   └── main.js                # Orchestration: DOM refs, state, login, rendering, handlers
├── images/               # Logos, consensus GIFs, patterns
├── music/                # Background music tracks
├── sounds/               # Sound effects (punch, thrust, super-saiyan, reset)
└── uploads/              # User-uploaded avatars (runtime)
```

## Architectural Patterns

### Module Loading (Client)
The client uses traditional script tags with namespace globals (`window.SPP.*`) rather than ES modules. This keeps zero build overhead while still allowing separation of concerns.

Load order (from `index.html`):
1. `socket.io.min.js` (CDN)
2. `socket.js` (placeholder)
3. `utils.js` — base utilities, no dependencies on other SPP modules
4. `animations.js`, `themes.js`, `music-player.js` — use `utils`
5. `avatar-effects.js` — uses `utils` and (optionally) `themes`
6. `socket-listeners.js` — uses `utils` and `animations`
7. `main.js` — orchestrates all the above

### Dependency Injection Pattern
Modules that need DOM refs / state accessors (e.g. `avatar-effects.js`, `socket-listeners.js`) expose a `create(deps)` or `register(socket, deps)` factory. `main.js` holds the state and passes getters/setters so the modules stay stateless and testable.

Example (`avatar-effects.js`):
```javascript
const avatarEffects = window.SPP.avatarEffects.create({
    participantsContainer,
    celebrationSound,
    isAnimating: () => isAnimating,
    setAnimating: (v) => { isAnimating = v; },
    isSoundEnabled: () => soundEnabled,
    // ...
});
```

### Real-time Communication
- Server (`server/socket-handlers.js`) owns session state and broadcasts via `io.to(sessionId).emit(...)`
- Client (`public/js/socket-listeners.js`) registers all `socket.on(...)` handlers in one place
- Background jobs in `server/sessions.js` emit `user-removed` when a user is inactive for 30 min

### Session Identity
- Each browser has a `persistentId` stored in `localStorage`, passed at `join-session`
- Server deduplicates by `persistentId` to prevent ghost duplicates on rejoin (standby/wake)
- All tabs in the same browser share the same identity (anti-abuse for voting)

### File Upload Flow
1. Client POSTs to `/upload-avatar` with CSRF header and multipart file
2. `server/uploads.js` validates MIME, extension, size, rate-limit
3. Secure filename generated with `crypto.randomBytes`
4. Response returns `/uploads/<filename>` path
5. Client emits `update-avatar` socket event → server broadcasts to session

### Background Jobs (`server/sessions.js`)
- **Heartbeat check** every 30s: removes users with no heartbeat for 30 min
- **Session cleanup** every 1h: removes sessions idle for 24 h
- Both jobs are started on server boot and stopped on SIGINT/SIGTERM
