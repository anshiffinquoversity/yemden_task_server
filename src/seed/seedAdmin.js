const mongoose = require('mongoose');
const { connectDatabase } = require('../config/db');
const { env } = require('../config/env');
const User = require('../models/User');

const seedAdmin = async () => {
  await connectDatabase();

  const existingAdmin = await User.findOne({ email: env.ADMIN_EMAIL.toLowerCase() });

  if (existingAdmin) {
    existingAdmin.name = env.ADMIN_NAME;
    existingAdmin.role = 'admin';
    existingAdmin.status = 'active';
    existingAdmin.mustChangePassword = false;

    if (env.ADMIN_PASSWORD) {
      existingAdmin.password = env.ADMIN_PASSWORD;
    }

    await existingAdmin.save();
    console.log(`Admin user updated: ${existingAdmin.email}`);
  } else {
    await User.create({
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      role: 'admin',
      status: 'active',
      mustChangePassword: false,
    });

    console.log(`Admin user created: ${env.ADMIN_EMAIL}`);
  }

  await mongoose.connection.close();
};

seedAdmin().catch(async (error) => {
  console.error('Admin seed failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
