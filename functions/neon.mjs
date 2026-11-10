import { neon } from '@neondatabase/serverless';

const TABLES = new Set(['users', 'sessions', 'documents', 'shares']);
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function identifier(value) {
  if (!IDENTIFIER.test(value)) throw new Error('invalid_identifier');
  return `"${value}"`;
}

function columns(value) {
  if (value === '*' || value === undefined) return '*';
  const names = String(value).split(',').map(name => name.trim());
  if (!names.length || names.some(name => !IDENTIFIER.test(name))) throw new Error('invalid_columns');
  return names.map(identifier).join(', ');
}

function parameter(value) {
  return value && typeof value === 'object' ? JSON.stringify(value) : value;
}

function createQuery(sql, tableName) {
  if (!TABLES.has(tableName)) throw new Error('invalid_table');

  const filters = [];
  const ordering = [];
  let selected = '*';
  let limitValue = null;
  let mode = 'read';
  let values = null;
  let conflictColumns = null;

  const query = {
    select(value) { selected = columns(value); return query; },
    eq(key, value) { filters.push({ key, operator: '=', value }); return query; },
    in(key, value) { filters.push({ key, operator: 'in', value }); return query; },
    order(key, options = {}) { ordering.push({ key, ascending: options.ascending !== false }); return query; },
    limit(value) { limitValue = value; return query; },
    insert(value) { mode = 'insert'; values = value; return query; },
    insertIfAbsent(value, options) {
      mode = 'insert'; values = value;
      conflictColumns = String(options?.onConflict ?? '').split(',').map(name => name.trim());
      return query;
    },
    update(value) { mode = 'update'; values = value; return query; },
    delete() { mode = 'delete'; return query; },
    then(onFulfilled, onRejected) { return execute().then(onFulfilled, onRejected); },
  };

  function whereClause(params) {
    if (!filters.length) return '';
    const parts = filters.map(filter => {
      const key = identifier(filter.key);
      if (filter.operator === 'in') {
        const list = Array.isArray(filter.value) ? filter.value : [];
        if (!list.length) return 'FALSE';
        const placeholders = list.map(value => { params.push(parameter(value)); return `$${params.length}`; });
        return `${key} IN (${placeholders.join(', ')})`;
      }
      params.push(parameter(filter.value));
      return `${key} = $${params.length}`;
    });
    return ` WHERE ${parts.join(' AND ')}`;
  }

  function returningClause() {
    return ` RETURNING ${selected}`;
  }

  function build() {
    const params = [];
    const table = `app.${identifier(tableName)}`;
    let text;

    if (mode === 'insert') {
      const keys = Object.keys(values ?? {});
      if (!keys.length) throw new Error('invalid_insert');
      const names = keys.map(identifier);
      const placeholders = keys.map(key => {
        params.push(parameter(values[key]));
        return `$${params.length}`;
      });
      const conflict = conflictColumns?.length
        ? ` ON CONFLICT (${conflictColumns.map(identifier).join(', ')}) DO NOTHING`
        : '';
      text = `INSERT INTO ${table} (${names.join(', ')}) VALUES (${placeholders.join(', ')})${conflict}${returningClause()}`;
    } else if (mode === 'update') {
      const keys = Object.keys(values ?? {});
      if (!keys.length) throw new Error('invalid_update');
      const assignments = keys.map(key => {
        params.push(parameter(values[key]));
        return `${identifier(key)} = $${params.length}`;
      });
      text = `UPDATE ${table} SET ${assignments.join(', ')}${whereClause(params)}${returningClause()}`;
    } else if (mode === 'delete') {
      text = `DELETE FROM ${table}${whereClause(params)}${returningClause()}`;
    } else {
      text = `SELECT ${selected} FROM ${table}${whereClause(params)}`;
      if (ordering.length) {
        text += ` ORDER BY ${ordering.map(({ key, ascending }) => `${identifier(key)} ${ascending ? 'ASC' : 'DESC'}`).join(', ')}`;
      }
      if (limitValue !== null) {
        params.push(limitValue);
        text += ` LIMIT $${params.length}`;
      }
    }
    return { text, params };
  }

  async function execute() {
    try {
      const { text, params } = build();
      const result = await sql.query(text, params);
      return { data: Array.isArray(result) ? result : result.rows ?? [], error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  return query;
}

export function createNeonDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const sql = neon(connectionString);
  return { from: table => createQuery(sql, table) };
}
