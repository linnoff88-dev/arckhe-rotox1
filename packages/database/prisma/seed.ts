import { PrismaClient, UserRole, UserStatus, VehicleType } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@rotax1.com.br' },
    update: {},
    create: {
      email: 'admin@rotax1.com.br',
      phone: '+5511999999999',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  console.log('✅ Admin created:', admin.email);

  // Create test clients
  const clientPassword = await hash('cliente123', 12);
  for (let i = 1; i <= 3; i++) {
    const user = await prisma.user.upsert({
      where: { email: `cliente${i}@teste.com` },
      update: {},
      create: {
        email: `cliente${i}@teste.com`,
        phone: `+551199900000${i}`,
        passwordHash: clientPassword,
        role: UserRole.CLIENT,
        status: UserStatus.ACTIVE,
        client: {
          create: {
            name: `Cliente Teste ${i}`,
            document: `1234567890${i}`,
            documentType: 'CPF',
          },
        },
      },
    });
    console.log('✅ Client created:', user.email);
  }

  // Create test drivers
  const driverPassword = await hash('entregador123', 12);
  const vehicleTypes: VehicleType[] = [
    VehicleType.MOTO,
    VehicleType.MOTO,
    VehicleType.CAR,
    VehicleType.BIKE,
    VehicleType.VAN,
  ];
  
  for (let i = 1; i <= 5; i++) {
    const user = await prisma.user.upsert({
      where: { email: `entregador${i}@teste.com` },
      update: {},
      create: {
        email: `entregador${i}@teste.com`,
        phone: `+551198800000${i}`,
        passwordHash: driverPassword,
        role: UserRole.DRIVER,
        status: UserStatus.ACTIVE,
        driver: {
          create: {
            name: `Entregador Teste ${i}`,
            document: `9876543210${i}`,
            cnhNumber: `CNH${i}23456789`,
            vehicleType: vehicleTypes[i - 1],
            vehiclePlate: `ABC${i}D${i}${i}`,
            isOnline: i <= 2, // First 2 drivers are online
            currentLat: -23.5505 + (Math.random() * 0.1 - 0.05),
            currentLng: -46.6333 + (Math.random() * 0.1 - 0.05),
            ratingAvg: 4.0 + Math.random(),
            ratingCount: 10 + i * 5,
          },
        },
      },
    });
    console.log('✅ Driver created:', user.email);
  }

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
