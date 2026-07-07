import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getEmbedding } from "../src/lib/openai";
import { getPineconeIndex } from "../src/lib/pinecone";
import crypto from "crypto";

const shouldUpdate = process.argv.includes("--update");
const pineconeEnabled =
  process.env.ENABLE_PINECONE_MEMORY === "true" || process.env.ENABLE_PINECONE_MEMORY === "1";

async function upsertPineconeRecord(params: {
  userId: string;
  vectorId: string;
  embedding: number[];
  content: string;
  type: string;
}) {
  if (!pineconeEnabled) {
    return false;
  }

  try {
    const index = getPineconeIndex();
    await index.upsert({
      records: [{
        id: params.vectorId,
        values: params.embedding,
        metadata: {
          userId: params.userId,
          content: params.content,
          type: params.type,
          createdAt: new Date().toISOString(),
        },
      }],
    });
    return true;
  } catch (error) {
    console.error("  -> Pinecone upsert failed, saved to Prisma only.");
    console.error(error instanceof Error ? error.message : error);
    return false;
  }
}

const CORE_CONTEXTS = [
  {
    title: "Core Personality & Decision-Making",
    content: `I like planning ahead. I care about leverage, discipline, execution, and making smart financial decisions that help me grow over the next few years. I do not want generic motivation. I want direct, practical advice that tells me what is actually going on financially and what I should do next. I respond well to feedback that is honest but encouraging. Do not coddle me, but also recognize progress when I'm actually improving. I am actively trying to think bigger financially and professionally. I want to move from survival/stability mode into wealth-building mode.`
  },
  {
    title: "Income and Work Context",
    content: `I work full-time as a software engineer. Main job take-home: around $6,000/month. I also drive Lyft using a rental vehicle through the Hertz/Lyft program. Lyft money is treated differently from my main account. The Lyft account is partly for savings, partly for fun, and partly for expenses related to Lyft or transportation. Examples of expenses that may belong to the Lyft/secondary account: Lyft rental costs, Gas, Uber rides to pick up or drop off rental vehicles, Speeding tickets or Hertz-related fees, Affirm payments connected to fun/travel purchases, Some fun money. I want my main account to become more "autopilot" and stable, while I focus on growing and managing the secondary/Lyft account better.`
  },
  {
    title: "Main Monthly Financial Picture",
    content: `My rough main monthly bills are: Mortgage: about $2,659/month. Utilities: about $300-$500/month. IRS payment plan: about $120/month. Car insurance / liability insurance: about $120/month. Credit card minimum payments: about $1,200/month. I no longer have a regular car payment because my personal car was paid off / settled. That was a major financial win because it removed a fixed liability and gave me more breathing room. I still have credit card debt and want to reduce my daily spending so more money can go toward stability, debt reduction, and future investing.`
  },
  {
    title: "Current Spending Problem",
    content: `One major issue is daily spending, especially food and convenience spending. Current pattern: Main account spending can average around $70/day. A lot of this comes from eating out and trying to hit protein goals. Typical daily spending examples: Gas: ~$15/day, Protein shake/snacks: ~$25/day, Lunch: ~$20, Dinner: ~$25. The AI should watch for patterns like: "You've spent around $70/day for the past few days." "You are spending a lot on protein convenience foods." "You are doing better this week. Your average daily spend is down by $X." "This looks like a recurring behavior, not a one-time purchase." The AI should distinguish between necessary spending, recurring spending, business/Lyft-related spending, and wasteful convenience spending.`
  },
  {
    title: "Fitness / Weight Loss Context",
    content: `I am actively cutting weight and working toward about 185 lbs. Height: around 5'11" to 6'0". Current/typical weight range: around 193-196 lbs. Lowest recent weight: around 192.9 lbs. Goal weight: around 185 lbs. Long-term goal: lean, athletic, visible muscle definition. I lift weights and care about body composition, not just the scale. I understand that daily scale changes can be water weight, sodium, food volume, carbs, stress, sleep, or training inflammation. The AI should not overreact to daily fluctuations. My calories have generally been around: Maintenance estimate: around 2,700 calories/day. Cutting calories: around 2,100-2,300 calories/day. Protein goal: roughly 135-160g/day. The AI should understand that some food spending comes from trying to hit protein goals, but it should still help me find cheaper ways to do that.`
  },
  {
    title: "Food / Protein Context",
    content: `I often rely on convenience foods because I do not cook much. Foods I commonly use: Chipotle double meat, Cava, Sushi / sashimi / nigiri, Greek yogurt, Fairlife milk, Protein shakes, Protein bars, Sardines, Pinto beans, Bananas, Miso soup, Convenience-store snacks. I want cheaper protein options that still support my cut. The AI should recognize that reducing food spending is one of the highest-leverage improvements for me. Instead of simply saying "cook more," it should give practical options like: Pack lunch 3 days/week, Use Greek yogurt + protein shake instead of convenience-store protein, Buy bulk protein sources, Set a daily food cap, Compare restaurant protein cost vs grocery protein cost, Create a "default cheap cutting day".`
  },
  {
    title: "Housing / Landlord Context",
    content: `I own and live in a rowhome in Oxon Hill / Prince George's County, Maryland. Mortgage: $2,659/month. Utilities: around $300-$500/month. I house hack by renting rooms. The home setup: 3 upstairs rooms, Basement with private bathroom. I live in one upstairs room. Upstairs bathroom is shared. Basement does not have fully separate private entry. Tenant/rent context: One upstairs room rented around $900/month. Another upstairs room around $700/month. Basement target around $1,000-$1,100/month. Security deposit often around $500. Utilities/Wi-Fi usually included. I care about stable, low-drama tenants more than squeezing every extra $100 of rent. Tenant qualities I value: Pays on time, Clean, Quiet, Has steady income, Has prior shared-living experience, No drama, No smoking, Preferably no pets. The AI should understand that my house is both my home and part of my wealth strategy. It should help me think about vacancy risk, repair reserves, tenant quality, and cash-flow stability.`
  },
  {
    title: "Real Estate / Wealth Goals",
    content: `I want to continue building wealth through real estate. Long-term goal: Buy another property in the next 12-18 months if financially ready. Eventually own multiple rental properties. Use house hacking and rental income to reduce personal living expenses. Build enough assets to have more freedom. Potential future market: Baltimore City or another affordable Maryland market. Target property price possibly around $200k-$250k. The AI should help me evaluate whether I am actually ready for the next property based on: Emergency fund, Credit score, Debt level, Cash reserves, Tenant stability, Mortgage stability, Repair risk, Debt-to-income ratio, Monthly surplus. It should not just hype me up to buy another property. It should be realistic.`
  },
  {
    title: "Debt / Credit Context",
    content: `I have had significant credit card debt, with minimum payments around $1,200/month. My credit score has been around the low 600s at times. I am frustrated because paying off installment debt can sometimes cause a temporary credit score drop, but I understand that paying off debt is still financially good. The AI should focus more on real financial health than temporary score fluctuations. Priority order should generally be: 1. Keep mortgage and essential bills stable. 2. Avoid new bad debt. 3. Reduce daily spending leakage. 4. Build emergency reserves. 5. Pay down high-interest credit cards. 6. Improve credit score over time. 7. Prepare for next property.`
  },
  {
    title: "IRS / Taxes Context",
    content: `I owe federal taxes and have been trying to set up an IRS payment plan. Rough context: Federal tax owed: around $2,500-$3,000. State tax was already handled separately. IRS payment plan target: around $120/month. The AI should treat tax payments as a real recurring obligation and include them in monthly planning.`
  },
  {
    title: "Car / Transportation Context",
    content: `My personal car situation changed recently. The car was effectively paid off / settled, removing a monthly liability. Current transportation context: No normal car payment. Liability/non-owner insurance around $120/month. Lyft rental used for driving. Lyft/Hertz rental costs exist separately. This matters because not having a car payment gives me more room to stabilize my finances, but Lyft rental expenses can still eat into side-income profits. The AI should track whether Lyft is truly profitable after: Rental cost, Gas, Insurance, Fees, Tickets, Maintenance-related expenses, Time spent driving.`
  },
  {
    title: "Startup / Career Context",
    content: `I am building AI / real estate-related products and care about execution, sales, positioning, and product-market fit. I am technical and can build software, but I want to make sure products actually make money. One startup direction: AI tools for real estate agents, brokers, lead follow-up, SMS/email/calling, CRM workflows, and sales automation. The AI should understand that career growth and business upside are part of my financial plan. It should sometimes point out when the best ROI is not just cutting expenses, but increasing income through: Higher-paying software job, Startup revenue, Consulting, Better use of technical skills, Real estate income, Lyft only when it actually makes sense.`
  },
  {
    title: "AI Coach Tone & Expectations",
    content: `The AI should talk to me like a practical financial coach. Tone should be: Direct, Realistic, Encouraging, Pattern-focused, Numbers-focused, No fluff, No shame. It should call out bad patterns clearly but also recognize real progress. Good tone example: "You're not broke because of one purchase. The issue is the pattern. At $70/day, your variable spending is acting like a second rent payment. The fix is not extreme restriction. The fix is creating a cheaper default day that still supports your fitness goals." The overall mission is: Help me stabilize my cash flow, lower daily spending, pay down debt, protect my house, improve fitness without overspending, grow income, and prepare for future real estate investing. The AI should always connect daily decisions to long-term goals.`
  },
  {
    title: "Personal CFO Daily Brief Rules",
    content: `The AI should act as my personal financial CFO, not just a budgeting assistant. Every day it should answer: Am I financially safe today? How much can I safely spend today? What bills, mortgage, utilities, taxes, insurance, subscriptions, credit card minimums, or debt payments are coming up? Did income, rent, paycheck, Lyft income, refunds, or unusual transactions hit? Should I hold cash or attack debt? The output should use this format: CFO Brief, Status, Cash safety, Upcoming bills, Income expected, Safe spend today, Debt move, Spending warning, Today's move. Strict rules: Protect the mortgage first. Protect upcoming bills. Protect the emergency cash buffer. Cover all minimum payments before extra debt payments. Do not recommend dropping checking below the buffer. If tenant rent is late, cash is low, or a big bill is coming, switch to conservative mode and tell me to hold cash. If paycheck or rent hits and bills are covered, switch to attack mode and say how much extra can safely go to debt. Use avalanche by default, but consider utilization when a near-max card or utilization threshold matters for credit score and consolidation options. Only recommend consolidation when rate, fees, payment, and total cost are clearly better. Track spending categories that match my life: mortgage, tenant rent, paycheck, Lyft income, Lyft expenses, credit card minimums, extra debt payments, utilities, insurance, IRS payment, food convenience, groceries, protein and fitness food, subscriptions, house repairs, travel, and fun money.`
  },
  {
    title: "Money As A Reinforcing System",
    content: `Treat money as a tool I am hardening and putting together — not just something to cut. Do not only say "you can save money." Assess how each decision affects the bigger picture and where freed cash should flow next. Every recommendation should explain system impact: does it protect core stability (mortgage, bills, minimums, buffer), fund growth (debt payoff, reserves, next property), maintain a real need, or leak strength? Show compounding when useful: less daily leakage → more debt paydown → lower utilization → better credit → cheaper future borrowing → more real estate optionality. When reviewing transactions or recurring charges, connect them to the whole machine: tenant income stabilizing the mortgage, paycheck covering fixed costs, Lyft profit after rental/fees, credit card interest dragging velocity, reserves enabling the next Baltimore/rental move. Prefer moves that create positive feedback loops. When goals compete, say which choice hardens the floor vs which bets on upside without a stable base. Income growth matters as much as expense cuts when the system needs more inflow. The mission is to assemble money so the pieces reinforce each other — stability first, then acceleration into wealth-building.`
  }
];

async function main() {
  // Get the first user (assuming single user for now)
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("No user found in database.");
    process.exit(1);
  }

  const userId = user.id;

  console.log(`Seeding core context for user: ${userId}`);
  if (shouldUpdate) {
    console.log("Update mode: refreshing existing core context entries.");
  }
  if (!pineconeEnabled) {
    console.log("Pinecone disabled — saving to database only.");
  }

  for (const context of CORE_CONTEXTS) {
    console.log(`Processing: ${context.title}`);
    
    const existing = await prisma.financialMemory.findFirst({
      where: {
        userId,
        title: context.title,
        type: "CORE_CONTEXT",
      },
    });

    if (existing && !shouldUpdate) {
      console.log("  -> Already exists, skipping.");
      continue;
    }

    const embedding = pineconeEnabled ? await getEmbedding(context.content) : null;
    let vectorId: string | null = existing?.pineconeVectorId ?? null;

    if (embedding && pineconeEnabled) {
      vectorId = vectorId ?? crypto.randomUUID();
      await upsertPineconeRecord({
        userId,
        vectorId,
        embedding,
        content: context.content,
        type: "CORE_CONTEXT",
      });
    }

    if (existing) {
      await prisma.financialMemory.update({
        where: { id: existing.id },
        data: {
          content: context.content,
          importanceScore: 10,
          source: "User Input",
          pineconeVectorId: vectorId,
        },
      });
      console.log("  -> Updated in Prisma.");
      continue;
    }

    await prisma.financialMemory.create({
      data: {
        userId,
        type: "CORE_CONTEXT",
        title: context.title,
        content: context.content,
        source: "User Input",
        importanceScore: 10,
        pineconeVectorId: vectorId,
      },
    });

    console.log("  -> Saved to Prisma.");
  }

  console.log("Done seeding core context.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
