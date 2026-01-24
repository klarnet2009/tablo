#!/bin/sh
set -e

# Database file path
DB_PATH="/app/data/tablo.db"

# Check if database needs initialization
if [ ! -f "$DB_PATH" ]; then
    echo "Database not found. Initializing..."
    
    # Push schema with explicit URL
    npx prisma db push --url "file:${DB_PATH}"
    
    # Seed data with explicit URL
    npx prisma db execute --url "file:${DB_PATH}" --file /app/prisma/seed.sql
    
    echo "Database initialized successfully."
else
    echo "Database exists. Skipping initialization."
fi

# Start the application
exec node server.js
