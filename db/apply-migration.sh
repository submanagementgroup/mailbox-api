#!/bin/bash
# Apply database migration to add used_mb column

# Load environment variables if .env exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Default to localhost if not set
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3306}
DB_NAME=${DB_NAME:-email_platform}
DB_USER=${DB_USER:-root}

echo "Applying migration to add used_mb column..."
echo "Database: $DB_HOST:$DB_PORT/$DB_NAME"

# Apply migration
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p "$DB_NAME" < db/migrations/add_used_mb_column.sql

if [ $? -eq 0 ]; then
  echo "✓ Migration applied successfully!"
else
  echo "✗ Migration failed. If column already exists, you can safely ignore this error."
fi
