import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // No default password: an account whose credentials live in the repository is
    // an account everybody already knows. The operator has to supply one.
    const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
    if (!adminPassword) {
        throw new Error(
            'ADMIN_INITIAL_PASSWORD is not set. Set it to the initial password for the "admin" account, e.g.\n' +
            '  ADMIN_INITIAL_PASSWORD=... npx prisma db seed'
        );
    }
    if (adminPassword.length < 12) {
        throw new Error('ADMIN_INITIAL_PASSWORD must be at least 12 characters long.');
    }

    await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            passwordHash: await bcrypt.hash(adminPassword, 10),
            displayName: 'System Administrator',
            role: 'ADMIN',
        },
    });
    console.log('✅ Created admin user (password taken from ADMIN_INITIAL_PASSWORD)');

    const docks = [
        { name: 'Dock 1', dockNumber: 1, dockType: 'BOTH', hasReeferPower: true, hazmatOk: false },
        { name: 'Dock 2', dockNumber: 2, dockType: 'BOTH', hasReeferPower: true, hazmatOk: false },
        { name: 'Dock 3', dockNumber: 3, dockType: 'INBOUND', hasReeferPower: false, hazmatOk: false },
        { name: 'Dock 4', dockNumber: 4, dockType: 'INBOUND', hasReeferPower: false, hazmatOk: true },
        { name: 'Dock 5', dockNumber: 5, dockType: 'OUTBOUND', hasReeferPower: true, hazmatOk: false },
        { name: 'Dock 6', dockNumber: 6, dockType: 'OUTBOUND', hasReeferPower: false, hazmatOk: false },
        { name: 'Scales', dockNumber: 99, dockType: 'SCALES', hasReeferPower: false, hazmatOk: false },
    ];

    for (const dock of docks) {
        await prisma.dock.upsert({
            where: { dockNumber: dock.dockNumber },
            update: {},
            create: dock,
        });
    }
    console.log(`✅ Created ${docks.length} docks`);

    console.log('🎉 Seeding completed!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
