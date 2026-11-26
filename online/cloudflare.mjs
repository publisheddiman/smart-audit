import migration from './migrations/0001_workspace.sql';
import worker from './worker.mjs';

const statements = migration.split(';').map(statement => statement.trim()).filter(Boolean);

export default {
  fetch(request, env) {
    return worker.fetch(request, {
      ...env,
      initializeDatabase: () => env.DB.batch(statements.map(statement => env.DB.prepare(statement)))
    });
  }
};
