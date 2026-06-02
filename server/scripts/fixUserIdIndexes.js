/**
 * Rebuild user ID unique indexes so null staff/admin IDs do not collide.
 *
 * Usage:
 *   cd server
 *   node scripts/fixUserIdIndexes.js
 */

require('dotenv').config();

const connectDB = require('../config/db');
const User = require('../models/User');

async function dropIndexIfExists(collection, indexName) {
  const indexes = await collection.indexes();
  if (!indexes.some((index) => index.name === indexName)) return false;

  await collection.dropIndex(indexName);
  return true;
}

async function main() {
  await connectDB();

  const collection = User.collection;

  const droppedStudent = await dropIndexIfExists(collection, 'studentId_1');
  const droppedAlumni = await dropIndexIfExists(collection, 'alumniId_1');

  await collection.createIndex(
    { studentId: 1 },
    {
      name: 'studentId_1',
      unique: true,
      partialFilterExpression: { studentId: { $type: 'string' } },
    }
  );

  await collection.createIndex(
    { alumniId: 1 },
    {
      name: 'alumniId_1',
      unique: true,
      partialFilterExpression: { alumniId: { $type: 'string' } },
    }
  );

  console.log(`Dropped existing studentId_1 index: ${droppedStudent}`);
  console.log(`Dropped existing alumniId_1 index: ${droppedAlumni}`);
  console.log('User ID indexes rebuilt successfully.');
}

main().catch((err) => {
  console.error('Failed to rebuild user ID indexes:', err);
  process.exit(1);
});
