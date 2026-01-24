#!/bin/sh
set -e

# Database file path
DB_PATH="/app/data/tablo.db"

# Always create/update .env with DATABASE_URL for Prisma
echo "DATABASE_URL=file:${DB_PATH}" > /app/.env

# Check if database needs initialization
if [ ! -f "$DB_PATH" ]; then
    echo "Database not found. Initializing..."
    
    # Push schema
    npx prisma db push
    
    # Seed data
    npx prisma db execute --file /app/prisma/seed.sql
    
    echo "Database initialized successfully."
else
    echo "Database exists. Skipping initialization."
fi

# Start the application
exec node server.js
