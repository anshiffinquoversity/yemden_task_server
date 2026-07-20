module.exports = {
  apps: [
    {
      name: 'worqi-api',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
