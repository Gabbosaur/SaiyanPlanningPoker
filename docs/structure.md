# DBZ Planning Poker - Project Structure

## Directory Organization

### Root Structure
```
dbz-planning-poker/
├── server.js              # Main Node.js server with Socket.IO
├── package.json           # Dependencies and scripts
├── README.md             # Project documentation
└── public/               # Static client-side assets
```

### Public Directory Structure
```
public/
├── index.html            # Main application entry point
├── css/                  # Styling and animations
│   ├── style.css         # Main application styles
│   ├── card-animations.css    # Card interaction animations
│   ├── card-deal.css     # Card dealing animations
│   ├── halloween-theme.css    # Seasonal theme styles
│   ├── super-saiyan.css  # DBZ transformation effects
│   └── vote-glow.css     # Vote reveal animations
├── js/                   # Client-side JavaScript
│   ├── main.js           # Core application logic
│   └── socket.js         # WebSocket client management
├── images/               # Static images and graphics
├── music/                # Background audio files
├── sounds/               # Sound effects
└── uploads/              # User-uploaded avatars
```

## Core Components

### Server Architecture
- **Express Server**: Serves static files and handles HTTP requests
- **Socket.IO Integration**: Real-time bidirectional communication
- **Multer Middleware**: File upload handling for avatars
- **Session Management**: In-memory session storage and user tracking

### Client Architecture
- **Single Page Application**: Vanilla JavaScript with DOM manipulation
- **WebSocket Client**: Real-time communication with server
- **State Management**: Local state for sessions, users, and votes
- **UI Components**: Modular card system, participant management, and notifications

## Architectural Patterns

### Real-time Communication
- Event-driven architecture using Socket.IO
- Client-server synchronization for votes and session state
- Broadcast patterns for multi-user updates

### File Management
- Static file serving through Express
- Dynamic avatar uploads with validation
- Asset organization by type (CSS, JS, images, audio)

### Responsive Design
- Mobile-first approach with Tailwind CSS
- Flexible grid layouts for different screen sizes
- Progressive enhancement for advanced features