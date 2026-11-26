import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

export function createLocalStorage(path) {
  const database = new DatabaseSync(path);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  database.exec('CREATE TABLE IF NOT EXISTS local_files (key TEXT PRIMARY KEY, bytes BLOB NOT NULL)');

  return {
    async initializeDatabase() {
      database.exec(readFileSync(new URL('./migrations/0001_workspace.sql', import.meta.url), 'utf8'));
    },
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async first() { return database.prepare(sql).get(...values) ?? null; },
              async run() { return {meta: database.prepare(sql).run(...values)}; }
            };
          },
          async first() { return database.prepare(sql).get() ?? null; }
        };
      }
    },
    FILES: {
      async put(key, bytes) {
        database.prepare('INSERT OR REPLACE INTO local_files (key, bytes) VALUES (?, ?)')
          .run(key, new Uint8Array(bytes));
      },
      async get(key) {
        return database.prepare('SELECT bytes FROM local_files WHERE key = ?').get(key)?.bytes ?? null;
      },
      async delete(key) {
        database.prepare('DELETE FROM local_files WHERE key = ?').run(key);
      }
    },
    close() { database.close(); }
  };
}
