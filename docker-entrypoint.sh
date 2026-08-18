#!/bin/sh
set -e

# Database file path
DB_PATH="/app/data/tablo.db"

# ---------------------------------------------------------------------------
# Schema fragments
#
# NOTE: this script is a stop-gap schema manager. prisma/migrations does not
# exist yet, so the DDL below is maintained by hand and must be kept in sync
# with prisma/schema.prisma. See README ("Database schema") before editing.
# ---------------------------------------------------------------------------

display_ddl() {
    cat <<'EOF'
CREATE TABLE IF NOT EXISTS Display (
    id TEXT PRIMARY KEY,
    deviceId TEXT UNIQUE NOT NULL,
    name TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);
EOF
}

ldap_config_ddl() {
    cat <<'EOF'
CREATE TABLE IF NOT EXISTS LdapConfig (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    enabled INTEGER DEFAULT 0,
    host TEXT DEFAULT '',
    port INTEGER DEFAULT 389,
    connectionMode TEXT DEFAULT 'LDAP',
    tlsRejectUnauthorized INTEGER DEFAULT 1,
    tlsCaCert TEXT,
    baseDn TEXT DEFAULT '',
    bindDn TEXT DEFAULT '',
    bindPasswordEnc TEXT DEFAULT '',
    userSearchFilter TEXT DEFAULT '(&(objectClass=user)(sAMAccountName={{username}}))',
    userAttributes TEXT DEFAULT 'cn,displayName,mail,memberOf,sAMAccountName,userPrincipalName,userAccountControl',
    selectedOUs TEXT DEFAULT '[]',
    groupAuthEnabled INTEGER DEFAULT 0,
    groupAuthMode TEXT DEFAULT 'highest_role_wins',
    groupAuthDefaultRole TEXT DEFAULT 'SECURITY',
    groupMappingRules TEXT DEFAULT '[]',
    groupAllowList TEXT DEFAULT '[]',
    groupDenyList TEXT DEFAULT '[]',
    connectTimeout INTEGER DEFAULT 5000,
    searchTimeout INTEGER DEFAULT 10000,
    disableLocalFallback INTEGER DEFAULT 0,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedById TEXT REFERENCES User(id)
);
EOF
}

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

    # The admin account is created here rather than in prisma/seed.sql because SQL
    # cannot hash a password, and a hash committed to the repository is a password
    # everybody already knows.
    if [ -z "$ADMIN_INITIAL_PASSWORD" ]; then
        echo "ERROR: ADMIN_INITIAL_PASSWORD is not set." >&2
        echo "       It is required the first time the database is created, and is used" >&2
        echo "       as the password of the initial 'admin' account. Set it in your" >&2
        echo "       environment (docker-compose .env) and start the container again." >&2
        exit 1
    fi
    if [ "$(printf %s "$ADMIN_INITIAL_PASSWORD" | wc -c)" -lt 12 ]; then
        echo "ERROR: ADMIN_INITIAL_PASSWORD must be at least 12 characters long." >&2
        exit 1
    fi

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
    ldapDn TEXT,
    ldapSyncedAt TEXT,
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

    ldap_config_ddl | sqlite3 "$DB_PATH"
    display_ddl | sqlite3 "$DB_PATH"

    echo "Creating admin account..."
    # bcryptjs is copied into the runtime image by the Dockerfile.
    ADMIN_HASH=$(node -e "process.stdout.write(require('bcryptjs').hashSync(process.env.ADMIN_INITIAL_PASSWORD, 10))")
    if [ -z "$ADMIN_HASH" ]; then
        echo "ERROR: failed to hash ADMIN_INITIAL_PASSWORD." >&2
        exit 1
    fi
    # A bcrypt hash contains no single quotes, so single-quoting it is safe. The
    # shell does not re-expand the contents of "$ADMIN_HASH".
    sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO User (id, username, passwordHash, displayName, role, isActive, createdAt, updatedAt) VALUES ('admin-001', 'admin', '$ADMIN_HASH', 'System Administrator', 'ADMIN', 1, datetime('now'), datetime('now'));"

    echo "Seeding data..."
    sqlite3 "$DB_PATH" < /app/prisma/seed.sql

    echo "Database initialized successfully."
    echo "Log in as 'admin' with the password from ADMIN_INITIAL_PASSWORD, then change it."
else
    echo "Database already initialized. Checking for schema updates..."

    # Add LDAP columns to User if they don't exist
    sqlite3 "$DB_PATH" "SELECT ldapDn FROM User LIMIT 1;" 2>/dev/null || {
        echo "Adding LDAP columns to User table..."
        sqlite3 "$DB_PATH" "ALTER TABLE User ADD COLUMN ldapDn TEXT;"
        sqlite3 "$DB_PATH" "ALTER TABLE User ADD COLUMN ldapSyncedAt TEXT;"
    }

    # Add scheduledAt column if it doesn't exist
    sqlite3 "$DB_PATH" "SELECT scheduledAt FROM TruckVisit LIMIT 1;" 2>/dev/null || {
        echo "Adding scheduledAt column..."
        sqlite3 "$DB_PATH" "ALTER TABLE TruckVisit ADD COLUMN scheduledAt TEXT;"
    }

    # Create Display table if it doesn't exist
    sqlite3 "$DB_PATH" "SELECT 1 FROM Display LIMIT 1;" 2>/dev/null || {
        echo "Creating Display table..."
        display_ddl | sqlite3 "$DB_PATH"
    }

    # Create LdapConfig table if it doesn't exist
    sqlite3 "$DB_PATH" "SELECT 1 FROM LdapConfig LIMIT 1;" 2>/dev/null || {
        echo "Creating LdapConfig table..."
        ldap_config_ddl | sqlite3 "$DB_PATH"
    }

    echo "Schema updates completed."
fi

# Start the application
exec node server.js
