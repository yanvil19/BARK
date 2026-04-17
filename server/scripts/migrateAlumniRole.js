/**
 * Migration: alumni role fix
 *
 * Before this fix, approved alumni registrations were stored with role='student'
 * and userType='alumni'. This script updates those documents so that role='alumni'
 * matches the corrected schema and approval logic.
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   cd server
 *   node scripts/migrateAlumniRole.js
 *   node scripts/migrateAlumniRole.js --dry-run   (preview only, no writes)
 */

require('dotenv').config();

const connectDB = require('../config/db');
const User = require('../models/User');

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  await connectDB();

  // Find all users that were registered as alumni but still have role='student'
  const affected = await User.find({ role: 'student', userType: 'alumni' }).select('_id name email userType role');

  if (affected.length === 0) {
    console.log('✅ No alumni users with role="student" found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${affected.length} alumni user(s) with role="student":"`);
  affected.forEach((u) => {
    console.log(`  - ${u.name} (${u.email}) | role: ${u.role} | userType: ${u.userType}`);
  });

  if (isDryRun) {
    console.log('\n⚠️  Dry-run mode — no changes written. Remove --dry-run to apply.');
    return;
  }

  const result = await User.updateMany(
    { role: 'student', userType: 'alumni' },
    { $set: { role: 'alumni' } }
  );

  console.log(`\n✅ Migration complete. Updated ${result.modifiedCount} document(s).`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
