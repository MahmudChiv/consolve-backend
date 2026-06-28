"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const bcrypt = __importStar(require("bcrypt"));
require("dotenv/config");
const BCRYPT_ROUNDS = 12;
async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set in env');
    }
    const pool = new pg_1.Pool({ connectionString });
    const adapter = new adapter_pg_1.PrismaPg(pool);
    const prisma = new client_1.PrismaClient({ adapter });
    const testPhoneNumber = '+2348000000001';
    const testPassword = 'Password123!';
    const hashedPassword = await bcrypt.hash(testPassword, BCRYPT_ROUNDS);
    console.log('Seeding database...');
    const existingUser = await prisma.user.findUnique({
        where: { phoneNumber: testPhoneNumber },
        include: { profiles: true }
    });
    if (existingUser) {
        await prisma.identity.deleteMany({
            where: { userId: existingUser.id }
        });
        await prisma.userProfile.deleteMany({
            where: { userId: existingUser.id }
        });
        await prisma.user.delete({
            where: { id: existingUser.id }
        });
    }
    const user = await prisma.user.create({
        data: {
            phoneNumber: testPhoneNumber,
            hashedPassword,
            isVerified: true,
            profiles: {
                create: {
                    firstName: 'John',
                    lastName: 'Doe',
                    gender: 'MALE',
                    type: 'SERVICE_PROVIDER',
                    onboardingStatus: 'COMPLETED',
                    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
                },
            },
        },
        include: {
            profiles: true,
        },
    });
    const profile = user.profiles[0];
    const identity = await prisma.identity.create({
        data: {
            userId: user.id,
            userProfileId: profile.id,
            profession: 'Tailor',
            summary: 'Specialist in custom men\'s senator and traditional wear.',
            expertise: ['senator wear', 'agbada', 'ankara'],
            experience: 5,
            availability: { type: 'full-time', days: 'Mon-Sat' },
            pricing: { min: 5000, max: 25000, currency: 'NGN', unit: 'per outfit', raw: '5k-25k NGN' },
            latitude: 6.5244,
            longitude: 3.3792,
            city: 'Lagos',
            state: 'Lagos',
            country: 'Nigeria',
        }
    });
    console.log('Seed completed successfully!');
    console.log(`Verified user created:`);
    console.log(`Phone: ${testPhoneNumber}`);
    console.log(`Password: ${testPassword}`);
    console.log(`User ID: ${user.id}`);
    console.log(`Profile ID: ${profile.id}`);
    console.log(`Identity ID: ${identity.id}`);
    await prisma.$disconnect();
    await pool.end();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map