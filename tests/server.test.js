const request = require('supertest');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

// Mock server setup for testing
let server, io, clientSocket, serverSocket;

beforeAll((done) => {
  const httpServer = createServer();
  io = new Server(httpServer);
  httpServer.listen(() => {
    const port = httpServer.address().port;
    clientSocket = new Client(`http://localhost:${port}`);
    io.on('connection', (socket) => {
      serverSocket = socket;
    });
    clientSocket.on('connect', done);
  });
});

afterAll(() => {
  io.close();
  clientSocket.close();
});

describe('Socket.IO Events', () => {
  test('should handle join-session with CSRF token', (done) => {
    const sessionData = {
      sessionId: 'TEST123',
      user: { name: 'TestUser' },
      csrfToken: 'a'.repeat(32) // Valid CSRF token
    };

    serverSocket.on('join-session', (data) => {
      expect(data.sessionId).toBe('TEST123');
      expect(data.user.name).toBe('TestUser');
      expect(data.csrfToken).toBe('a'.repeat(32));
      done();
    });

    clientSocket.emit('join-session', sessionData);
  });

  test('should handle vote submission', (done) => {
    const voteData = {
      sessionId: 'TEST123',
      vote: '5',
      csrfToken: 'a'.repeat(32)
    };

    serverSocket.on('submit-vote', (data) => {
      expect(data.vote).toBe('5');
      expect(data.csrfToken).toBe('a'.repeat(32));
      done();
    });

    clientSocket.emit('submit-vote', voteData);
  });
});

describe('Game Logic', () => {
  test('should calculate mode correctly', () => {
    const votes = ['5', '5', '8', '5'];
    const frequency = {};
    votes.forEach(vote => {
      frequency[vote] = (frequency[vote] || 0) + 1;
    });
    const mode = Object.keys(frequency).reduce((a, b) => 
      frequency[a] > frequency[b] ? a : b
    );
    expect(mode).toBe('5');
  });

  test('should calculate average correctly', () => {
    const votes = [1, 2, 3, 5, 8];
    const average = votes.reduce((a, b) => a + b, 0) / votes.length;
    expect(average).toBe(3.8);
  });

  test('should detect consensus', () => {
    const votes = ['5', '5', '5', '5'];
    const firstVote = votes[0];
    const consensus = votes.every(vote => vote === firstVote);
    expect(consensus).toBe(true);
  });
});