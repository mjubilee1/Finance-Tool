import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";

/**
 * Import names from an iPhone/Contacts .vcf export into GrowthContact.
 * Stores NAME ONLY — never phones/emails (PII stays out of the DB and git).
 *
 * Usage:
 *   npx tsx scripts/import-vcf-contacts.ts "/path/to/Daily life.vcf"
 *   npx tsx scripts/import-vcf-contacts.ts "./data/private/daily-life.vcf"
 *
 * Optional: RELATIONSHIP_TYPE=unlabeled (default) | peer | family | ...
 */

type ParsedCard = { name: string };

function unfoldVcf(raw: string) {
  return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function decodeQuotedPrintable(value: string) {
  if (!/=[0-9A-Fa-f]{2}/.test(value) && !value.includes("=3D")) return value;
  try {
    return value
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  } catch {
    return value;
  }
}

function parseVcfNames(raw: string): ParsedCard[] {
  const text = unfoldVcf(raw);
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  const names: ParsedCard[] = [];

  for (const card of cards) {
    const lines = card.split("\n").map((l) => l.trim()).filter(Boolean);
    let fn: string | null = null;
    let nGiven: string | null = null;

    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.startsWith("FN") && (upper.startsWith("FN:") || upper.startsWith("FN;"))) {
        const value = line.slice(line.indexOf(":") + 1);
        fn = decodeQuotedPrintable(value).trim();
      }
      if (upper.startsWith("N:") || upper.startsWith("N;")) {
        const value = decodeQuotedPrintable(line.slice(line.indexOf(":") + 1));
        // N: Last;First;Middle;Prefix;Suffix
        const parts = value.split(";");
        const last = parts[0]?.trim() ?? "";
        const first = parts[1]?.trim() ?? "";
        nGiven = [first, last].filter(Boolean).join(" ").trim() || null;
      }
    }

    const name = (fn || nGiven || "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    names.push({ name });
  }

  return names;
}

function normalizeNameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: npx tsx scripts/import-vcf-contacts.ts "/path/to/contacts.vcf"');
    process.exit(1);
  }

  const filePath = path.resolve(fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const relationshipType =
    (process.env.RELATIONSHIP_TYPE?.trim() || "unlabeled").toLowerCase();

  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("No user found in database.");
    process.exit(1);
  }

  const parsed = parseVcfNames(fs.readFileSync(filePath, "utf8"));
  console.log(`Parsed ${parsed.length} cards from ${path.basename(filePath)}`);

  const existing = await prisma.growthContact.findMany({
    where: { userId: user.id },
    select: { name: true },
  });
  const existingKeys = new Set(existing.map((c) => normalizeNameKey(c.name)));

  let created = 0;
  let skipped = 0;

  for (const card of parsed) {
    const key = normalizeNameKey(card.name);
    if (!key || existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    await prisma.growthContact.create({
      data: {
        userId: user.id,
        name: card.name,
        relationshipType,
        status: "active",
        trustLevel: 3,
        collaborationPotential: 3,
      },
    });
    existingKeys.add(key);
    created += 1;
    console.log(`  + ${card.name}`);
  }

  console.log(`Done. created=${created} skipped_duplicates=${skipped} type=${relationshipType}`);
  console.log("Next: label people in Growth → Relationships (family / peer / mentor / dating / …).");
  console.log("Family usually needs no notes — compounding focus is leverage people.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
