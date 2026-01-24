-- Seed data for Tablo
-- Users (passwords are bcrypt hashed - password: "password")
INSERT OR REPLACE INTO User (id, username, passwordHash, displayName, role, isActive, createdAt, updatedAt) VALUES
('admin-001', 'admin', '$2b$10$jeucR3hZvCYtMSlUF3.Z7eCER4EG5ReNdBFE5do9sIYWOfkozYSjG', 'System Administrator', 'ADMIN', 1, datetime('now'), datetime('now')),
('dispatcher-001', 'dispatcher', '$2b$10$jeucR3hZvCYtMSlUF3.Z7eCER4EG5ReNdBFE5do9sIYWOfkozYSjG', 'Main Dispatcher', 'DISPATCHER', 1, datetime('now'), datetime('now')),
('security-001', 'security', '$2b$10$jeucR3hZvCYtMSlUF3.Z7eCER4EG5ReNdBFE5do9sIYWOfkozYSjG', 'Gate Security', 'SECURITY', 1, datetime('now'), datetime('now'));

-- Docks
INSERT OR REPLACE INTO Dock (id, name, dockNumber, dockType, hasReeferPower, hazmatOk, status, createdAt, updatedAt) VALUES
('dock-001', 'Dock 1', 1, 'BOTH', 1, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-002', 'Dock 2', 2, 'BOTH', 1, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-003', 'Dock 3', 3, 'INBOUND', 0, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-004', 'Dock 4', 4, 'INBOUND', 0, 1, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-005', 'Dock 5', 5, 'OUTBOUND', 1, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-006', 'Dock 6', 6, 'OUTBOUND', 0, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('scales-001', 'Scales', 99, 'SCALES', 0, 0, 'AVAILABLE', datetime('now'), datetime('now'));

