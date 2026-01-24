import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    const adminPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            passwordHash: adminPassword,
            displayName: 'System Administrator',
            role: 'ADMIN',
        },
    });
    console.log('✅ Created admin user');

    const dispatcherPassword = await bcrypt.hash('dispatcher123', 10);
    await prisma.user.upsert({
        where: { username: 'dispatcher' },
        update: {},
        create: {
            username: 'dispatcher',
            passwordHash: dispatcherPassword,
            displayName: 'Main Dispatcher',
            role: 'DISPATCHER',
        },
    });
    console.log('✅ Created dispatcher user');

    const securityPassword = await bcrypt.hash('security123', 10);
    await prisma.user.upsert({
        where: { username: 'security' },
        update: {},
        create: {
            username: 'security',
            passwordHash: securityPassword,
            displayName: 'Gate Security',
            role: 'SECURITY',
        },
    });
    console.log('✅ Created security user');

    const docks = [
        { name: 'Dock 1', dockNumber: 1, dockType: 'BOTH', hasReeferPower: true, hazmatOk: false },
        { name: 'Dock 2', dockNumber: 2, dockType: 'BOTH', hasReeferPower: true, hazmatOk: false },
        { name: 'Dock 3', dockNumber: 3, dockType: 'INBOUND', hasReeferPower: false, hazmatOk: false },
        { name: 'Dock 4', dockNumber: 4, dockType: 'INBOUND', hasReeferPower: false, hazmatOk: true },
        { name: 'Dock 5', dockNumber: 5, dockType: 'OUTBOUND', hasReeferPower: true, hazmatOk: false },
        { name: 'Dock 6', dockNumber: 6, dockType: 'OUTBOUND', hasReeferPower: false, hazmatOk: false },
    ];

    for (const dock of docks) {
        await prisma.dock.upsert({
            where: { dockNumber: dock.dockNumber },
            update: {},
            create: dock,
        });
    }
    console.log('✅ Created 6 docks');

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
