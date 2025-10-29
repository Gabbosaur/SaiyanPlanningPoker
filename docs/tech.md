# DBZ Planning Poker - Technology Stack

## Programming Languages
- **JavaScript (ES6+)**: Client and server-side development
- **HTML5**: Semantic markup and structure
- **CSS3**: Styling with modern features and animations

## Backend Technologies
- **Node.js**: Runtime environment (v16+ required)
- **Express.js (^4.18.2)**: Web application framework
- **Socket.IO (^4.7.2)**: Real-time bidirectional communication
- **Multer (^1.4.5-lts.1)**: Multipart form data handling for file uploads

## Frontend Technologies
- **Vanilla JavaScript**: No framework dependencies
- **Tailwind CSS**: Utility-first CSS framework
- **WebSocket API**: Client-side real-time communication
- **File API**: Browser file handling for avatar uploads

## Development Tools
- **Nodemon (^3.0.1)**: Development server with auto-restart
- **npm**: Package management and script execution

## Build System
- **No build process**: Direct file serving for simplicity
- **Static asset serving**: Express middleware for public files

## Development Commands

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev          # Start with nodemon (auto-restart)
npm start           # Production start
```

### Server Configuration
- **Port**: 3000 (default)
- **Static Files**: Served from `/public` directory
- **File Uploads**: Stored in `/public/uploads`

## Dependencies Overview
- **express**: Web server and routing
- **socket.io**: Real-time communication
- **multer**: File upload middleware
- **nodemon**: Development auto-reload (dev only)

## Browser Compatibility
- **Modern Browsers**: Chrome, Firefox, Safari, Edge
- **WebSocket Support**: Required for real-time features
- **File API Support**: Required for avatar uploads
- **ES6+ Features**: Arrow functions, async/await, destructuring