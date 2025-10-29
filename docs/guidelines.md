# DBZ Planning Poker - Development Guidelines

## Code Quality Standards

### JavaScript Conventions
- **ES6+ Features**: Consistent use of arrow functions, destructuring, template literals, and async/await
- **Variable Declarations**: Prefer `const` for immutable values, `let` for mutable variables, avoid `var`
- **Function Definitions**: Use arrow functions for callbacks and short functions, regular functions for methods
- **Error Handling**: Comprehensive try-catch blocks with meaningful error messages and fallback behavior

### Code Structure Patterns
- **Event-Driven Architecture**: Extensive use of event listeners and Socket.IO event handlers
- **Modular Organization**: Clear separation between client-side logic (main.js) and server-side logic (server.js)
- **State Management**: Global state variables with clear naming conventions (currentSession, participants, hasVoted)
- **DOM Manipulation**: Direct DOM queries with consistent element caching patterns

### Naming Conventions
- **Variables**: camelCase with descriptive names (sessionIdInput, participantsContainer, currentDeckType)
- **Functions**: Descriptive verb-noun combinations (renderParticipants, submitVote, resetVoting)
- **CSS Classes**: BEM-like methodology with dbz- prefix for themed components
- **Event Handlers**: Clear action-based naming (setupSocketListeners, handleAvatarUpload)

### Documentation Standards
- **Inline Comments**: Explanatory comments for complex logic and business rules
- **Function Documentation**: Brief descriptions for major functions and their purposes
- **Error Logging**: Comprehensive console.log statements for debugging and monitoring
- **Code Sections**: Clear section headers using comment blocks

## Semantic Patterns

### Socket.IO Communication Patterns
```javascript
// Event emission with data validation
socket.emit('submit-vote', { sessionId, vote: value });

// Event listening with error handling
socket.on('voting-complete', (data) => {
    const { votes, results } = data;
    // Process data with null checks
});

// Broadcast patterns for multi-user updates
io.to(sessionId).emit('user-joined', newUser);
```

### DOM Manipulation Patterns
```javascript
// Element selection and caching
const element = document.getElementById('element-id');
const elements = document.querySelectorAll('.class-name');

// Dynamic content creation with security considerations
element.innerHTML = `<div class="safe-class">${sanitizedContent}</div>`;

// Event delegation and cleanup
element.addEventListener('click', handler);
```

### Error Handling Patterns
```javascript
// Server-side validation and error responses
if (!sessionId || typeof sessionId !== 'string') {
    socket.emit('error', { message: 'Invalid session ID' });
    return;
}

// Client-side error handling with user feedback
try {
    const response = await fetch('/api/endpoint');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
} catch (error) {
    console.error('Operation failed:', error);
    showNotification('Operation failed. Please try again.', 'error');
}
```

### Animation and UI Patterns
```javascript
// CSS class-based animations with cleanup
element.classList.add('animate-class');
setTimeout(() => {
    element.classList.remove('animate-class');
}, animationDuration);

// Progressive enhancement for visual effects
if (soundEnabled && audioElement) {
    audioElement.play().catch(error => {
        console.warn('Audio playback failed:', error);
    });
}
```

## Internal API Usage

### Session Management
```javascript
// Session creation and validation
if (!sessions[sessionId]) {
    sessions[sessionId] = {
        id: sessionId,
        users: {},
        votes: {},
        currentDeck: 'modifiedFibonacci',
        showVotes: false,
        lastActivity: Date.now()
    };
}

// User state tracking
sessions[sessionId].users[socket.id] = {
    ...user,
    id: socket.id,
    isConnected: true,
    lastHeartbeat: Date.now()
};
```

### File Upload Handling
```javascript
// Multer configuration for avatar uploads
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
```

### Real-time State Synchronization
```javascript
// Vote counting and completion detection
const connectedUsers = Object.values(session.users).filter(user => user.isConnected);
const votesCount = Object.keys(session.votes).length;

if (votesCount === connectedUsers.length) {
    const results = calculateResults(Object.values(session.votes));
    session.showVotes = true;
    io.to(sessionId).emit('voting-complete', { votes: session.votes, results });
}
```

## Frequently Used Code Idioms

### Sanitization and Security
```javascript
// Input sanitization
user.name = user.name.replace(/[<>\"']/g, '').trim();

// XSS prevention in dynamic content
const sanitizedAvatar = participant.avatar.replace(/[<>\"']/g, '');
const sanitizedName = participant.name.replace(/[<>\"']/g, '');
```

### Heartbeat and Connection Management
```javascript
// Client-side heartbeat
setInterval(() => {
    if (socket && socket.connected) {
        socket.emit('heartbeat');
    }
}, 30000);

// Server-side connection tracking
sessions[sessionId].users[socket.id].lastHeartbeat = Date.now();
```

### Animation Timing and Cleanup
```javascript
// Staggered animations with cleanup
cards.forEach((card, index) => {
    cardEl.style.animationDelay = `${index * 0.5}s`;
    setTimeout(() => {
        cardEl.classList.remove('card-dealing');
    }, 400 + index * 50);
});
```

### Responsive Design Patterns
```javascript
// Screen size detection and adaptation
if (window.innerWidth < 640) { // Mobile
    adjustedRadiusX *= 0.6;
    adjustedRadiusY *= 0.6;
} else if (window.innerWidth < 1024) { // Tablet
    adjustedRadiusX *= 0.8;
    adjustedRadiusY *= 0.8;
}
```

## Development Best Practices

### Performance Optimization
- **Event Debouncing**: Window resize events use debouncing with clearTimeout patterns
- **Memory Management**: Proper cleanup of intervals, timeouts, and event listeners
- **Asset Loading**: Lazy loading and error handling for audio/image resources
- **DOM Efficiency**: Batch DOM updates and minimize reflows

### Security Considerations
- **Input Validation**: Server-side validation for all user inputs with type checking
- **XSS Prevention**: Content sanitization before DOM insertion
- **File Upload Security**: File type validation and size limits for avatar uploads
- **Session Security**: Proper session cleanup and timeout mechanisms

### Error Recovery
- **Graceful Degradation**: Fallback behavior when features fail (audio, animations)
- **Reconnection Logic**: Automatic reconnection attempts with user feedback
- **State Persistence**: Session state recovery after disconnections
- **User Feedback**: Clear error messages and loading indicators