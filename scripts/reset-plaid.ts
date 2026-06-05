import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (email) {
    console.log(`Looking for user with email: ${email}...`);
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      console.error(`❌ User with email ${email} not found.`);
      process.exit(1);
    }

    console.log(`Resetting Plaid data for user: ${email}...`);
    
    const txRes = await prisma.transaction.deleteMany({ where: { userId: user.id } });
    console.log(`Deleted ${txRes.count} transactions.`);
    
    const accRes = await prisma.financialAccount.deleteMany({ where: { userId: user.id } });
    console.log(`Deleted ${accRes.count} financial accounts.`);
    
    const itemRes = await prisma.plaidItem.deleteMany({ where: { userId: user.id } });
    console.log(`Deleted ${itemRes.count} Plaid items.`);
    
    const snapRes = await prisma.dailyFinancialSnapshot.deleteMany({ where: { userId: user.id } });
    console.log(`Deleted ${snapRes.count} daily snapshots.`);

  } else {
    console.log("No email provided. Resetting Plaid data for ALL users...");
    
    const txRes = await prisma.transaction.deleteMany();
    console.log(`Deleted ${txRes.count} transactions.`);
    
    const accRes = await prisma.financialAccount.deleteMany();
    console.log(`Deleted ${accRes.count} financial accounts.`);
    
    const itemRes = await prisma.plaidItem.deleteMany();
    console.log(`Deleted ${itemRes.count} Plaid items.`);
    
    const snapRes = await prisma.dailyFinancialSnapshot.deleteMany();
    console.log(`Deleted ${snapRes.count} daily snapshots.`);
  }

  console.log("✅ Successfully reset Plaid data! You can now link a fresh bank account.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
