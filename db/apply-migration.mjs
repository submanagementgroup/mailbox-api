#!/usr/bin/env node
import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: '.env.local' });

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'email_platform',
};

console.log(`Connecting to database: ${config.host}:${config.port}/${config.database}`);

async function applyMigration() {
  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log('✓ Connected to database');

    // Read migration SQL
    const migrationSQL = fs.readFileSync('db/migrations/add_used_mb_column.sql', 'utf8');

    // Execute migration
    console.log('Applying migration...');
    await connection.query(migrationSQL);

    console.log('✓ Migration applied successfully!');
    console.log('  Added used_mb column to mailboxes table');

    // Verify column was added
    const [columns] = await connection.query('SHOW COLUMNS FROM mailboxes LIKE "used_mb"');
    if (columns.length > 0) {
      console.log('✓ Verified: used_mb column exists');
    }

  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('✓ Column already exists - no migration needed');
    } else {
      console.error('✗ Migration failed:', error.message);
      process.exit(1);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

applyMigration();
