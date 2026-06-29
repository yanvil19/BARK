const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

/**
 * Creates a test user in the in-memory DB and returns a signed JWT.
 * @param {object} overrides - fields to override on the default user
 */
async function createUserAndToken(overrides = {}) {
  const password = overrides.password || 'TestPassword123!';
  const hashedPassword = await bcrypt.hash(password, 10);

  const userData = {
    firstName: 'Test',
    lastName: 'User',
    email: `test-${Date.now()}@example.com`,
    password: hashedPassword,
    role: 'professor',
    isVerified: true,
    ...overrides,
    // Always hash the password even if overridden
    ...(overrides.password && { password: await bcrypt.hash(overrides.password, 10) }),
  };

  const user = await User.create(userData);

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );

  return { user, token };
}

module.exports = { createUserAndToken };