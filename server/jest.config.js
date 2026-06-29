module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],      // ← runs after Jest globals (beforeAll, afterAll, etc.) are available
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  detectOpenHandles: true,
};