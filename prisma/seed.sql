-- Seed data for Tablo (docks only).
--
-- No user rows here on purpose: SQL cannot hash a password, so any account
-- seeded from this file would ship with a publicly known credential. The admin
-- account is created by docker-entrypoint.sh from ADMIN_INITIAL_PASSWORD.

-- Docks
INSERT OR REPLACE INTO Dock (id, name, dockNumber, dockType, hasReeferPower, hazmatOk, status, createdAt, updatedAt) VALUES
('dock-001', 'Dock 1', 1, 'BOTH', 1, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-002', 'Dock 2', 2, 'BOTH', 1, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-003', 'Dock 3', 3, 'INBOUND', 0, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-004', 'Dock 4', 4, 'INBOUND', 0, 1, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-005', 'Dock 5', 5, 'OUTBOUND', 1, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('dock-006', 'Dock 6', 6, 'OUTBOUND', 0, 0, 'AVAILABLE', datetime('now'), datetime('now')),
('scales-001', 'Scales', 99, 'SCALES', 0, 0, 'AVAILABLE', datetime('now'), datetime('now'));
