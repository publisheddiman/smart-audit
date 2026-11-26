const schema = [
  'SELECT pg_advisory_xact_lock(61495270)',
  'CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK (id = 1), revision BIGINT NOT NULL, payload JSONB NOT NULL)',
  `INSERT INTO workspace (id, revision, payload) VALUES (1, 0, '{"companies":[],"regs":null}') ON CONFLICT (id) DO NOTHING`
];

export function postgresWorkspace(sql) {
  async function query(text, params = []) {
    try {
      return await sql.query(text, params);
    } catch (error) {
      if (error.code !== '42P01') throw error;
      await sql.transaction(schema.map(statement => sql.query(statement, [])));
      return sql.query(text, params);
    }
  }

  return {
    async read() {
      const [row] = await query('SELECT revision, payload FROM workspace WHERE id = 1');
      return row ? {revision: Number(row.revision), data: row.payload} : null;
    },
    async write(revision, data) {
      const rows = await query(
        'UPDATE workspace SET revision = revision + 1, payload = $1::jsonb WHERE id = 1 AND revision = $2 RETURNING revision',
        [JSON.stringify(data), revision]
      );
      return rows.length === 1;
    },
    async referencesFile(id) {
      const [row] = await query(
        `SELECT jsonb_path_exists(payload, '$.**.id ? (@ == $fileId)', jsonb_build_object('fileId', $1::text)) AS present
         FROM workspace WHERE id = 1`,
        [id]
      );
      return row?.present === true;
    }
  };
}
