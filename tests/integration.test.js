const request = require('supertest');
const express = require('express');
const path = require('path');

// Create a minimal test server
const app = express();
app.use(express.static(path.join(__dirname, '../public')));

describe('Integration Tests', () => {
  test('should serve index.html', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
  });

  test('should serve CSS files', async () => {
    const response = await request(app).get('/css/style.css');
    expect(response.status).toBe(200);
    expect(response.type).toBe('text/css');
  });

  test('should serve JavaScript files', async () => {
    const response = await request(app).get('/js/main.js');
    expect(response.status).toBe(200);
    expect(response.type).toBe('application/javascript');
  });

  test('should return 404 for non-existent files', async () => {
    const response = await request(app).get('/nonexistent.js');
    expect(response.status).toBe(404);
  });
});