import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const BCRYPT_ROUNDS = 12;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in env');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const testPhoneNumber = '+2348000000001';
  const testPassword = 'Password123!';
  const hashedPassword = await bcrypt.hash(testPassword, BCRYPT_ROUNDS);

  console.log('Seeding database...');

  // Delete existing identity first to prevent foreign key errors
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

  // Create a verified user and profile
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

  // Create the identity connected to both
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
