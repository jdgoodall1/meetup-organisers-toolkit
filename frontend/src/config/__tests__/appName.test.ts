/** @jest-environment node */
import * as fs from 'fs';
import * as path from 'path';

// Validates: Requirements 12.1, 12.4
const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC_DIR = path.join(FRONTEND_ROOT, 'src');
const APP_CONFIG = path.join(SRC_DIR, 'config', 'app.ts');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : walk(full);
    }
    return [full];
  });

const isTestFile = (file: string) => /\.(test|spec)\.[tj]sx?$/.test(file);

// Reads the real value straight from the config file so this test is independent of any mock.
const realAppName = (): string => {
  const match = /APP_NAME\s*=\s*(['"`])(.+?)\1/.exec(fs.readFileSync(APP_CONFIG, 'utf8'));
  if (!match) throw new Error('APP_NAME literal not found in src/config/app.ts');
  return match[2];
};

describe('APP_NAME is the single source of the product name', () => {
  const name = realAppName();

  it('has a non-empty product name', () => {
    expect(name.trim().length).toBeGreaterThan(0);
  });

  it('appears literally only in src/config/app.ts', () => {
    const candidates = [
      ...walk(SRC_DIR).filter((f) => /\.(ts|tsx|css)$/.test(f) && !isTestFile(f)),
      path.join(FRONTEND_ROOT, 'index.html'),
      path.join(FRONTEND_ROOT, 'vite.config.ts'),
      ...(fs.existsSync(path.join(FRONTEND_ROOT, 'public')) ? walk(path.join(FRONTEND_ROOT, 'public')) : []),
    ].filter((f) => f !== APP_CONFIG && !/\.(svg|png|ico|jpg|jpeg|gif|webp)$/i.test(f));

    const needle = name.toLowerCase();
    const offenders = candidates
      .filter((f) => fs.readFileSync(f, 'utf8').toLowerCase().includes(needle))
      .map((f) => path.relative(FRONTEND_ROOT, f));

    expect(offenders).toEqual([]);
  });

  it('sets the page title from APP_NAME rather than hard-coding it', () => {
    const html = fs.readFileSync(path.join(FRONTEND_ROOT, 'index.html'), 'utf8');
    const vite = fs.readFileSync(path.join(FRONTEND_ROOT, 'vite.config.ts'), 'utf8');

    expect(vite).toMatch(/import\s*{\s*APP_NAME\s*}\s*from\s*['"]\.\/src\/config\/app['"]/);
    expect(vite).toContain('transformIndexHtml');
    expect(html.toLowerCase()).not.toContain(name.toLowerCase());
    expect(html).toContain('%APP_NAME%');
  });
});
