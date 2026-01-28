#!/bin/sh
set -e

# Database file path
DB_PATH="/app/data/tablo.db"

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
    
    # Create database and tables using SQL directly
    echo "Creating database schema..."
    sqlite3 "$DB_PATH" <<'EOF'
-- User table
CREATE TABLE IF NOT EXISTS User (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    displayName TEXT NOT NULL,
    role TEXT DEFAULT 'SECURITY',
    isActive INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Dock table
CREATE TABLE IF NOT EXISTS Dock (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    dockNumber INTEGER UNIQUE NOT NULL,
    dockType TEXT DEFAULT 'BOTH',
    hasReeferPower INTEGER DEFAULT 0,
    hazmatOk INTEGER DEFAULT 0,
    maxLength REAL,
    dockHeight REAL,
    status TEXT DEFAULT 'AVAILABLE',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- TruckVisit table
CREATE TABLE IF NOT EXISTS TruckVisit (
    id TEXT PRIMARY KEY,
    truckPlate TEXT NOT NULL,
    trailerPlate TEXT,
    carrier TEXT,
    driverName TEXT,
    driverPhone TEXT,
    loadType TEXT DEFAULT 'INBOUND',
    orderRef TEXT,
    priority TEXT DEFAULT 'NORMAL',
    status TEXT DEFAULT 'NEW',
    scheduledAt TEXT,
    assignedDockId TEXT REFERENCES Dock(id),
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    arrivedAt TEXT,
    calledAt TEXT,
    dockedAt TEXT,
    startedAt TEXT,
    finishedAt TEXT,
    leftAt TEXT,
    notes TEXT,
    flags TEXT,
    queuePosition INTEGER,
    createdById TEXT NOT NULL REFERENCES User(id)
);

-- AuditLog table
CREATE TABLE IF NOT EXISTS AuditLog (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    entityType TEXT NOT NULL,
    entityId TEXT NOT NULL,
    beforeState TEXT,
    afterState TEXT,
    metadata TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    userId TEXT NOT NULL REFERENCES User(id),
    visitId TEXT REFERENCES TruckVisit(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_truckvisit_status ON TruckVisit(status);
CREATE INDEX IF NOT EXISTS idx_truckvisit_plate ON TruckVisit(truckPlate);
CREATE INDEX IF NOT EXISTS idx_truckvisit_created ON TruckVisit(createdAt);
CREATE INDEX IF NOT EXISTS idx_auditlog_entity ON AuditLog(entityType, entityId);
CREATE INDEX IF NOT EXISTS idx_auditlog_created ON AuditLog(createdAt);
EOF
    
    echo "Seeding data..."
    sqlite3 "$DB_PATH" < /app/prisma/seed.sql
    
    echo "Database initialized successfully."
else
    echo "Database already initialized. Checking for schema updates..."
    
    # Add scheduledAt column if it doesn't exist
    sqlite3 "$DB_PATH" "SELECT scheduledAt FROM TruckVisit LIMIT 1;" 2>/dev/null || {
        echo "Adding scheduledAt column..."
        sqlite3 "$DB_PATH" "ALTER TABLE TruckVisit ADD COLUMN scheduledAt TEXT;"
        echo "Migration completed."
    }
fi

# Start the application
exec node server.js
