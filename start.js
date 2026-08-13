// start.js —— 智能启动器
// ① 读取同目录 .env 文件（如果有）——数据库地址、管理员密码放这里
// ② 不同平台的 Node 版本不一样：
//   · Node 22.x / 23.x 需要 --experimental-sqlite 标志（本地 SQLite 用）
//   · Node 24+ 不需要该标志（传了反而可能报错）
//   · 云端部署（有 DATABASE_URL）用 Postgres，根本不用 SQLite
// 所以按版本号自动决定加不加标志，保证哪都能启动。
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 读取 .env（key=value 每行一个，已存在的环境变量优先）
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  console.log('[start] 已读取 .env 配置');
}

const major = Number(process.versions.node.split('.')[0]);
const args = [];

if (major >= 22 && major < 24) {
  args.push('--experimental-sqlite');
}

console.log('[start] Node ' + process.versions.node + (args.length ? '（带 SQLite 标志）' : ''));
const r = spawnSync(process.execPath, [...args, 'server.js'], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
