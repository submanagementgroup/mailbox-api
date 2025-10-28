import mysql from 'mysql2/promise';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DatabaseConfig } from '../utils/types';

/**
 * Database connection management
 */

let pool: mysql.Pool | null = null;
let dbConfig: DatabaseConfig | null = null;

/**
 * Fetch database credentials from AWS Secrets Manager
 */
async function getDatabaseCredentials(): Promise<DatabaseConfig> {
  if (dbConfig) {
    return dbConfig;
  }

  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable not set');
  }

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ca-central-1' });

  try {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretArn })
    );

    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }

    const secret = JSON.parse(response.SecretString);

    dbConfig = {
      host: process.env.DB_HOST || secret.host,
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'email_platform',
      user: secret.username,
      password: secret.password,
    };

    return dbConfig;
  } catch (error) {
    console.error('Failed to fetch database credentials:', error);
    throw error;
  }
}

/**
 * Get or create database connection pool
 */
export async function getPool(): Promise<mysql.Pool> {
  if (pool) {
    return pool;
  }

  const config = await getDatabaseCredentials();

  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 30000,
    timezone: '+00:00', // UTC
  });

  console.log('Database connection pool created');

  return pool;
}

/**
 * Execute a query with automatic connection management
 */
export async function query<T = any>(sql: string, params?: any[]): Promise<[T[], mysql.FieldPacket[]]> {
  const pool = await getPool();
  return pool.query<T[]>(sql, params);
}

/**
 * Execute a query and return only the rows
 */
export async function queryRows<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await query<T>(sql, params);
  return rows;
}

/**
 * Execute a query and return the first row
 */
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await queryRows<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute an INSERT and return the inserted ID
 */
export async function insert(sql: string, params?: any[]): Promise<number> {
  const pool = await getPool();
  const [result] = await pool.query<mysql.ResultSetHeader>(sql, params);
  return result.insertId;
}

/**
 * Execute an UPDATE/DELETE and return affected rows count
 */
export async function execute(sql: string, params?: any[]): Promise<number> {
  const pool = await getPool();
  const [result] = await pool.query<mysql.ResultSetHeader>(sql, params);
  return result.affectedRows;
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT 1 as test');
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

/**
 * Close database connection pool (for cleanup)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection pool closed');
  }
}
