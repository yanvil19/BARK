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
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    password: hashedPassword,
    role: 'professor',
    isVerified: true,
    ...overrides,
    // Always hash the password even if overridden
    ...(overrides.password && { password: await bcrypt.hash(overrides.password, 10) }),
  };

  // Tell the pre-save hook the password is already hashed so it doesn't double-hash
  const user = new User(userData);
  user._passwordAlreadyHashed = true;
  await user.save();

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );

  const cookieHeader = `nu_board_token=${token}`;

  return { user, token, cookieHeader };
}

module.exports = { createUserAndToken };