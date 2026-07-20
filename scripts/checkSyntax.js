const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoots = ['src', 'test', 'scripts'];

const javascriptFilesIn = (relativePath) => {
  const absolutePath = path.resolve(projectRoot, relativePath);
  const entry = fs.statSync(absolutePath);

  if (entry.isFile()) {
    return absolutePath.endsWith('.js') ? [absolutePath] : [];
  }

  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((item) =>
    javascriptFilesIn(path.join(relativePath, item.name))
  );
};

const files = [
  ...sourceRoots.flatMap(javascriptFilesIn),
  path.resolve(projectRoot, 'ecosystem.config.js'),
].sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} JavaScript file(s).`);
