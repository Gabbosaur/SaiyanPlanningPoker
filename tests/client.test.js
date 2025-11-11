/**
 * @jest-environment jsdom
 */

// Mock DOM elements for client-side testing
beforeEach(() => {
  document.body.innerHTML = `
    <input id="username" />
    <input id="session-id" />
    <div id="participants-container"></div>
    <div id="cards-container"></div>
  `;
});

describe('Client-side utilities', () => {
  test('should sanitize input correctly', () => {
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
      });
    }

    expect(sanitizeInput('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(sanitizeInput("test'quote")).toBe('test&#x27;quote');
    expect(sanitizeInput('normal text')).toBe('normal text');
  });

  test('should generate CSRF token', () => {
    // Mock crypto.getRandomValues
    Object.defineProperty(global, 'crypto', {
      value: {
        getRandomValues: jest.fn().mockReturnValue(new Uint8Array(32).fill(255))
      }
    });

    function generateCSRFToken() {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    const token = generateCSRFToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  test('should create safe DOM elements', () => {
    function createSafeElement(tag, textContent = '', className = '') {
      const element = document.createElement(tag);
      if (textContent) element.textContent = textContent;
      if (className) element.className = className;
      return element;
    }

    const div = createSafeElement('div', 'test content', 'test-class');
    expect(div.tagName).toBe('DIV');
    expect(div.textContent).toBe('test content');
    expect(div.className).toBe('test-class');
  });

  test('should generate session ID', () => {
    function generateSessionId() {
      return Math.random().toString(36).substring(2, 9).toUpperCase();
    }

    const sessionId = generateSessionId();
    expect(sessionId).toHaveLength(7);
    expect(sessionId).toMatch(/^[A-Z0-9]+$/);
  });
});