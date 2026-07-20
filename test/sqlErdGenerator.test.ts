import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  generateSqlErd,
  parseSqlSchema,
  SqlSchemaParseError,
} from '../src/sqlErdGenerator';

void test('SQL CREATE TABLE columns and inline keys generate an ER diagram', () => {
  const sql = [
    '-- A fake CREATE TABLE ignored(value text);',
    'CREATE TABLE IF NOT EXISTS "app"."User Account" (',
    '  "user.id" BIGINT PRIMARY KEY,',
    '  email VARCHAR(255) NOT NULL',
    ');',
    '/* Orders belong to users. */',
    'CREATE TABLE orders (',
    '  id INTEGER,',
    '  user_id BIGINT NOT NULL REFERENCES "app"."User Account" ("user.id"),',
    '  CONSTRAINT orders_pk PRIMARY KEY (id)',
    ');',
  ].join('\n');

  const schema = parseSqlSchema(sql);
  assert.deepEqual(schema.tables.map((table) => table.name), ['app.User Account', 'orders']);
  assert.deepEqual(
    schema.tables[0]?.columns.map((column) => [column.name, column.type, column.primaryKey]),
    [
      ['user.id', 'BIGINT', true],
      ['email', 'VARCHAR(255)', false],
    ],
  );
  assert.deepEqual(schema.tables[1]?.foreignKeys, [
    {
      columns: ['user_id'],
      referencedColumns: ['user.id'],
      referencedTable: 'app.User Account',
    },
  ]);

  const mermaid = generateSqlErd(sql);
  assert.match(mermaid, /^erDiagram\n/u);
  assert.match(mermaid, /app_User_Account\["app\.User Account"\] \{/u);
  assert.match(mermaid, /BIGINT user_id FK/u);
  assert.match(mermaid, /BIGINT user_id PK "user\.id"/u);
  assert.match(mermaid, /INTEGER id PK/u);
  assert.match(mermaid, /app_User_Account \|\|--o\{ orders : "user_id to user\.id"/u);
});

void test('table-level composite primary and foreign keys support quoted identifiers', () => {
  const schema = parseSqlSchema(`
    # MySQL-style line comment
    CREATE TABLE [catalog].[Product] (
      [tenant id] integer,
      [product id] integer,
      PRIMARY KEY ([tenant id], [product id])
    );
    CREATE TABLE \`Order Item\` (
      id bigint PRIMARY KEY,
      tenant_id integer,
      product_id integer,
      CONSTRAINT \`fk product\` FOREIGN KEY (tenant_id, product_id)
        REFERENCES [catalog].[Product] ([tenant id], [product id])
    );
  `);
  assert.equal(schema.tables[0]?.columns.every((column) => column.primaryKey), true);
  assert.deepEqual(schema.tables[1]?.foreignKeys[0], {
    columns: ['tenant_id', 'product_id'],
    referencedColumns: ['tenant id', 'product id'],
    referencedTable: 'catalog.Product',
  });

  const mermaid = generateSqlErd(`
    CREATE TABLE parents (id integer PRIMARY KEY);
    CREATE TABLE children (parent_id integer REFERENCES parents(id));
  `);
  assert.match(mermaid, /parents o\|--o\{ children/u);
});

void test('unsupported or inconsistent SQL reports focused parser errors', () => {
  assert.throws(
    () => parseSqlSchema('SELECT 1;'),
    (error: unknown) => error instanceof SqlSchemaParseError && /No supported CREATE TABLE/u.test(error.message),
  );
  assert.throws(
    () => parseSqlSchema('CREATE TABLE child (id int, FOREIGN KEY (missing) REFERENCES parent(id));'),
    /unknown column missing/u,
  );
  assert.throws(
    () => parseSqlSchema('CREATE TABLE broken (id int'),
    /unclosed column list/u,
  );
});
