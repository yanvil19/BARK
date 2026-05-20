require('dotenv').config();

const connectDB = require('../config/db');
const User = require('../models/User');

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  const email = getArg('email') || process.env.SEED_ADMIN_EMAIL;
  const password = getArg('password') || process.env.SEED_ADMIN_PASSWORD;
  const name = getArg('name') || process.env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.error('Missing seed credentials. Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before running this script.');
    process.exit(1);
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set (check server/.env)');
  }

  await connectDB();

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Super admin already exists: ${existing.email} (${existing.role})`);
    return;
  }

  const user = await User.create({
    name,
    email,
    password,
    role: 'super_admin',
    department: null,
    program: null,
  });

  console.log(`Seeded super_admin: ${user.email} (id=${user._id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
