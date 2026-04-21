module.exports = {
    testEnvironment: 'node',
    testTimeout: 10000,
    collectCoverageFrom: [
        'server.js',
        'server/**/*.js',
        'public/js/*.js'
    ],
    testMatch: [
        '**/tests/**/*.test.js'
    ]
};
