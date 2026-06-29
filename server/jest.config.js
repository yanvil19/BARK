module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],      // ← setupFiles (runs before framework)
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
};