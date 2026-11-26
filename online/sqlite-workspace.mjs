export function sqliteWorkspace(db, initialize) {
  const first = (query, ...values) => values.length ? db.prepare(query).bind(...values).first() : db.prepare(query).first();
  const run = (query, ...values) => db.prepare(query).bind(...values).run();
  return {
    async countAttempts(client, time) {
      const count = () => first(
        'INSERT INTO login_attempts (client, attempts, expires_at) VALUES (?, 1, ?) ' +
        'ON CONFLICT(client) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END, ' +
        'expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts',
        client, time + 600, time, time
      );
      let row;
      try {
        row = await count();
      } catch (error) {
        if (!initialize || !String(error.message).includes('no such table')) throw error;
        await initialize();
        row = await count();
      }
      return row.attempts;
    },
    async clearAttempts(client, time) {
      await run('DELETE FROM login_attempts WHERE client = ? OR expires_at <= ?', client, time);
    },
    async read() {
      const row = await first('SELECT revision, payload FROM workspace WHERE id = 1');
      return row ? {revision: row.revision, data: JSON.parse(row.payload)} : null;
    },
    async write(revision, data) {
      const result = await run(
        'UPDATE workspace SET revision = revision + 1, payload = ? WHERE id = 1 AND revision = ?',
        JSON.stringify(data), revision
      );
      return result.meta.changes === 1;
    },
    async referencesFile(id) {
      return !!await first(
        "SELECT 1 AS present FROM workspace, json_tree(workspace.payload) WHERE json_tree.key = 'id' AND json_tree.value = ? LIMIT 1", id
      );
    }
  };
}
