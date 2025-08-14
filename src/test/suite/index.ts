import * as path from 'path';
import Mocha from 'mocha';
import { globSync } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 10000 });
  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((c, e) => {
    const relFiles: string[] = globSync('**/**.test.js', { cwd: testsRoot });
    const files = relFiles.map(f => path.resolve(testsRoot, f));
    files.forEach(f => mocha.addFile(f));
    try {
      mocha.run((failures: number) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      e(err as Error);
    }
  });
}
