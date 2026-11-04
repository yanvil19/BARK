const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

// Mock Brevo email service so tests do not make real HTTP calls to Brevo
jest.mock('../utils/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    instance: {
      launchTimeout: 30000,
    },
  });
  const uri = mongoServer.getUri();
  // The MongoDB driver loads its "os" adapter with a dynamic import(), which Jest's
  // CommonJS runtime does not support. Without it the handshake has no client
  // metadata and the server refuses the connection, so pass the adapter in.
  await mongoose.connect(uri, { runtimeAdapters: { os: require('os') } });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
