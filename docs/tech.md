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
- **MediaPipe Tasks Vision (@mediapipe/tasks-vision 0.10.14)**: On-device computer vision for the Ki Control mode, loaded from CDN as an ES module. Two models are used:
  - **Hand Landmarker** (2 hands): drives the pointer and the click gesture
  - **Pose Landmarker** (lite): drives the Genkidama arm-raise detection. Required because raising your arms pushes the hands out of a laptop webcam's frame, where the hand model sees nothing — shoulders and elbows stay visible.
- **getUserMedia**: Webcam capture. All inference runs locally in WASM/WebGL; no video or landmark data is sent to the server for the pointer.

## Testing
- **Jest (^29.7.0)** with **jest-environment-jsdom** for client-side units
- **Supertest (^6.3.3)** for HTTP assertions
- **socket.io-client (^4.7.2)** for real-time integration tests

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
npm start            # Production start
```

### Tests
```bash
npm test             # Run the full suite once
npm run test:watch   # Watch mode
```

### Server Configuration
- **Port**: 3000 (default, override with `PORT`)
- **Static Files**: Served from `/public` directory
- **File Uploads**: Stored in `/public/uploads`

### Environment Variables
- `PORT`: HTTP port (default `3000`)
- `SPP_GENKIDAMA_SOLO=1`: Lets a single user trigger the Genkidama ritual. Intended for local testing only, since the ritual normally requires at least two participants.

```bash
SPP_GENKIDAMA_SOLO=1 npm start   # solo-testable Genkidama
```

## Content Security Policy
`server/security.js` sets a restrictive CSP. The webcam features need several
allowances, so keep these in mind when changing it:
- `script-src`: `'wasm-unsafe-eval'` and `blob:` for the MediaPipe WASM runtime and its workers
- `worker-src`: `blob:`
- `connect-src`: `https://cdn.jsdelivr.net` (WASM binaries) and `https://storage.googleapis.com` (model files)
- `media-src`: `blob:` for the webcam stream

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
- **Dynamic `import()`**: Required to load the MediaPipe ES module
- **Webcam + WASM**: Required only for Ki Control, and only over HTTPS or `localhost`. The rest of the app works without them.