/**
 * Run this once to create the first admin user.
 *
 *   pnpm db:seed
 *
 * Or with an email argument:
 *   pnpm db:seed -- admin@yourcompany.com
 */

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import readline from "node:readline";

import { prisma } from "../lib/prisma";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const email = (process.argv[2] ?? (await ask("Admin email: "))).toLowerCase().trim();
  if (!email.includes("@")) {
    console.error("Invalid email");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`User ${email} already exists.`);
    process.exit(1);
  }

  // Generate a random initial password — the user changes it after first login.
  const password = randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name: email.split("@")[0],
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("\n✓ Admin user created");
  console.log(`  Email:    ${user.email}`);
  console.log(`  Password: ${password}`);
  console.log("\n  Change the password after first login.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
