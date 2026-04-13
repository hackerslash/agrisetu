import "dotenv/config";
import bcrypt from "bcryptjs";

import { prisma } from "../lib/prisma.js";
import { requireEnv } from "../lib/env.js";

async function main() {
  const email = requireEnv("SUPERADMIN_EMAIL").toLowerCase();
  const password = requireEnv("SUPERADMIN_PASSWORD", { minLength: 8 });
  const businessName =
    process.env.SUPERADMIN_BUSINESS_NAME?.trim() || "AgriSetu Admin";
  const contactName =
    process.env.SUPERADMIN_CONTACT_NAME?.trim() || "Super Admin";
  const phone = process.env.SUPERADMIN_PHONE?.trim() || "0000000000";

  const hashed = await bcrypt.hash(password, 10);

  const admin = await prisma.vendor.upsert({
    where: { email },
    update: {
      password: hashed,
      businessName,
      contactName,
      phone,
      role: "SUPERADMIN",
      status: "ACTIVE",
      isVerified: true,
      reviewNote: null,
    },
    create: {
      email,
      password: hashed,
      businessName,
      contactName,
      phone,
      role: "SUPERADMIN",
      status: "ACTIVE",
      isVerified: true,
    },
    select: {
      id: true,
      email: true,
      businessName: true,
      role: true,
      status: true,
    },
  });

  console.log("Superadmin ready:", admin);
}

main()
  .catch((error) => {
    console.error("Failed to bootstrap superadmin", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
