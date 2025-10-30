#!/usr/bin/env node
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
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

async function applyMigrations() {
  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log('✓ Connected to database\n');

    // Get all migration files
    const migrationsDir = 'db/migrations';
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Apply in order

    console.log(`Found ${files.length} migration file(s):\n`);

    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      console.log(`Applying: ${file}...`);

      try {
        // Read and execute migration
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Split by semicolon and execute each statement
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
          await connection.query(statement);
        }

        console.log(`  ✓ ${file} completed\n`);
      } catch (error) {
        // Handle duplicate/already exists errors gracefully
        if (error.code === 'ER_TABLE_EXISTS_ERROR' ||
            error.code === 'ER_DUP_FIELDNAME' ||
            error.code === 'ER_DUP_KEYNAME') {
          console.log(`  ⚠ ${file} already applied (skipped)\n`);
        } else {
          console.error(`  ✗ ${file} failed:`, error.message);
          throw error;
        }
      }
    }

    console.log('\n✓ All migrations completed successfully!');

  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

applyMigrations();
