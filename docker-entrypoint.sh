#!/bin/sh
set -e

# Database file path
DB_PATH="/app/data/tablo.db"

# Always create/update .env with DATABASE_URL for Prisma
echo "DATABASE_URL=file:${DB_PATH}" > /app/.env

# Function to check if database has User table
db_has_tables() {
    if [ ! -f "$DB_PATH" ]; then
        return 1
    fi
    # Check if User table exists (means DB is initialized)
    sqlite3 "$DB_PATH" "SELECT 1 FROM User LIMIT 1;" 2>/dev/null && return 0
    return 1
}

# Check if database needs initialization
if ! db_has_tables; then
    echo "Database not initialized. Running setup..."
    
    # Push schema
    echo "Pushing schema..."
    npx prisma db push
    
    # Seed data
    echo "Seeding data..."
    npx prisma db execute --file /app/prisma/seed.sql
    
    echo "Database initialized successfully."
else
    echo "Database already initialized. Skipping setup."
fi

# Start the application
exec node server.js
