// PM2 process file: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'chat',
    script: 'src/index.js',
    cwd: __dirname,          // so --env-file=.env is found
    node_args: '--env-file=.env --max-old-space-size=2048',
    instances: 1,            // ONE process: online users live in this process's memory
    exec_mode: 'fork',
    max_memory_restart: '3G',
    kill_timeout: 5000,
    time: true,
    env: { NODE_ENV: 'production' },
  }],
};
