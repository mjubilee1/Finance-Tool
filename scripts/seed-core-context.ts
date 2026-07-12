import crypto from "crypto";
import "dotenv/config";
import { getEmbedding } from "../src/lib/openai";
import { getPineconeIndex } from "../src/lib/pinecone";
import { prisma } from "../src/lib/prisma";

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
    content: `I like planning ahead. I care about leverage, freedom, discipline, and execution — building a life where money and time reinforce each other over years. I do not want generic motivation or monk-mode shame. I want direct, practical advice that tells me what is actually going on and what to do next. I respond well to honest but encouraging feedback: celebrate when I stick the plan, call the pattern when I drift. I am trying to move from survival/stability into wealth-building AND a real life — dating, nights out, clothes, fun — without pretending those never happen. The win is leverage + freedom, not perfect austerity.`
  },
  {
    title: "Income and Work Context",
    content: `I work full-time as a software engineer. Main job take-home: around $6,000/month into Chase (primary). I also drive Lyft through the Hertz/Lyft rental program. Important Lyft economics: I pay a weekly program/rental fee first — that cost has to be covered before Lyft driving is truly profitable for the week. Lyft earnings deposit into Capital One (secondary), which is my goals/plans/side-income bucket — not Chase. Capital One money is partly for savings/goals, partly for fun, and partly for Lyft-related expenses (rental/program fee, gas, Uber to pick up/drop off the rental, Hertz fees, tickets, Affirm fun/travel). A frequent daily decision is: is it worth driving Lyft today to cover the weekly fee / add Capital One cash, or is my time better spent on higher-leverage work (career, shipping software, networking, systems)? Respect my weekly schedule (see Weekly Schedule / Daily Rhythm) when answering that. The AI should help with numbers and opportunity cost — not default to "just drive more" or invent unrelated product ideas. I want Chase more autopilot/stable, and Capital One/Lyft managed intentionally.`
  },
  {
    title: "Weekly Schedule / Daily Rhythm",
    content: `Typical workweek rhythm (use this when recommending today's move, time blocks, or Lyft vs leverage):

Mon–Wed (office days):
- Wake ~5:00am
- Drive Lyft ~2 hours early morning
- Then commute into the office
- Roughly 9:00am–5:00pm in office — cannot do in-person errands, coffee meets, or random outings easily
- At the desk I CAN do: Slack/email follow-ups, short networking messages, note-taking, light coding/learning, planning, admin, CRM/contact notes, async career/build work
- After work / evening is freer for in-person stuff, longer builds, dating/social, or more Lyft if the weekly fee math needs it

Thu–Fri (work from home):
- More flexible day — better for deep work blocks, longer shipping sessions, calls, errands, in-person meets if needed
- Still a full job day; protect deep work and don't assume endless free time

Weekends: more open for Lyft, social/dating, errands, longer leverage projects, and recovery.

Coaching rules from this schedule:
- On Mon–Wed office hours, prefer desk-compatible actions (messages, planning, async builds) — do NOT suggest mid-day in-person meetings or "go meet someone for coffee at noon" unless remote/async.
- Put in-person relationship moves, errands, and long uninterrupted build blocks on Thu–Fri or evenings/weekends when possible.
- Morning Lyft Mon–Wed is already baked into the routine; when asking "Lyft more today?" weigh after-work/evening Lyft or weekend Lyft, and whether the weekly Hertz fee is already covered.
- Always name WHEN a recommended action fits (e.g. "desk message at lunch", "Thu WFH deep block", "Sat morning Lyft").`
  },
  {
    title: "Main Monthly Financial Picture",
    content: `My rough main monthly bills are: Mortgage: about $2,659/month. Utilities: about $300-$500/month. IRS payment plan: about $120/month. Car insurance / liability insurance: about $120/month. Credit card minimum payments: about $1,200/month. I no longer have a regular car payment because my personal car was paid off / settled. That was a major financial win because it removed a fixed liability and gave me more breathing room. I still have credit card debt and want to reduce my daily spending so more money can go toward stability, debt reduction, and future investing.`
  },
  {
    title: "Current Spending Problem",
    content: `Default daily discretionary target is about $25/day on most days (food/convenience variable spend — not mortgage/bills). Hitting ~$25 most days is a win and should be celebrated. I am human: some days and some weeks I will spend more — bars, dating, clothes, fun. Typical drift pattern: stick the plan ~4 days, then 2–3 days go overboard (bar nights, clothes, social). That is not "you failed forever" — it is a weekly pattern to measure. Coach at two levels: MICRO (today: are you on the $25 default, or is this an earned/planned spend day?) and WEEKLY (did this week compound anything — debt, goals, fitness, relationships, skills — or mostly waste time/money?). Distinguish: necessary, Lyft/business, default cheap day, earned discretionary, and leak/impulse. Do not shame a planned bar night after several solid days; do flag if overspending becomes the majority of the week.`
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
    content: `I own and live in a rowhome in Oxon Hill / Prince George's County, Maryland. Mortgage: $2,659/month. Utilities: around $300-$500/month. I house hack by renting rooms. The home setup: 3 upstairs rooms, Basement with private bathroom. I live in one upstairs room. Upstairs bathroom is shared. Basement does not have fully separate private entry. CURRENT TENANCY (mid-2026): upstairs rooms AND the basement are already rented — do NOT recommend listing the basement or finding a basement tenant. Focus on tenant quality, on-time rent, vacancy risk prevention, repair reserves, and cash-flow stability — not filling empty units that are already filled. Approximate rents when occupied: upstairs rooms around $900 and $700/month; basement around $1,000-$1,100/month. Security deposit often around $500. Utilities/Wi-Fi usually included. I care about stable, low-drama tenants more than squeezing every extra $100 of rent. Tenant qualities I value: Pays on time, Clean, Quiet, Has steady income, Has prior shared-living experience, No drama, No smoking, Preferably no pets. The house is both my home and part of my wealth strategy.`
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
    content: `My personal car was effectively paid off / settled — no normal car payment. Liability/non-owner insurance around $120/month. For Lyft I use a Hertz/Lyft rental: I pay a weekly program fee before I start keeping meaningful profit, then Lyft payouts land in Capital One. The AI should track whether Lyft is truly profitable after: weekly rental/program fee, gas, insurance, fees, tickets, time spent driving. When recommending Lyft, say whether today's hours are mainly covering the weekly fee floor or producing surplus toward goals.`
  },
  {
    title: "Startup / Career Context",
    content: `I am a software engineer who can build products. IMPORTANT — current focus (as of mid-2026): I am NOT actively building or selling a real-estate agent SaaS / CRM / outreach product right now. Do not recommend cold outreach to real estate agents, lead lists for brokers, or "ship the real estate AI app" as today's move unless I explicitly say that project is active again. Current high-leverage themes: (1) full-time software career momentum and skill compounding, (2) this personal finance / Growth Intelligence system and related software execution, (3) network/relationship compounding, (4) deciding when Lyft hours are worth it vs building long-term assets. Real estate still matters as PROPERTY investing (house hacking now, next rental later) — that is wealth strategy, not my current startup product. Prefer income upside via: stronger engineering career, shipping useful software I am actually working on, consulting only if relevant, Lyft only when the weekly fee math and opportunity cost make sense.`
  },
  {
    title: "AI Coach Tone & Expectations",
    content: `Talk to me like a practical coach for someone who wants leverage and freedom — not a guilt machine. Tone: Direct, Realistic, Encouraging, Pattern-focused, Numbers-focused, No fluff, No shame. Celebrate micro wins (e.g. several $25 days in a row). On weekly review ask: what compounded this week vs what was mostly waste (time at the bar with nothing to show, impulse clothes, doomscroll, low-ROI Lyft after fee already covered)? Call patterns clearly: "4 solid days then 2–3 overboard nights is your rhythm — protect the solid days and budget the blowouts." Allow earned discretionary after good stretches. Mission: stabilize cash flow, hit ~$25 most days, pay down debt, protect the house, fitness without overspending, grow income/career leverage, keep a real social/dating life, prepare for future real estate investing.`
  },
  {
    title: "Personal CFO Daily Brief Rules",
    content: `The AI should act as my personal financial CFO, not just a budgeting assistant. Every day it should answer: Am I financially safe today? How much can I safely spend today? What bills, mortgage, utilities, taxes, insurance, subscriptions, credit card minimums, or debt payments are coming up? Did income, rent, paycheck, Lyft income, refunds, or unusual transactions hit? Should I hold cash or attack debt? The output should use this format: CFO Brief, Status, Cash safety, Upcoming bills, Income expected, Safe spend today, Debt move, Spending warning, Today's move. Strict rules: Protect the mortgage first. Protect upcoming bills. Protect the emergency cash buffer. Cover all minimum payments before extra debt payments. Do not recommend dropping checking below the buffer. If tenant rent is late, cash is low, or a big bill is coming, switch to conservative mode and tell me to hold cash. If paycheck or rent hits and bills are covered, switch to attack mode and say how much extra can safely go to debt. Use avalanche by default, but consider utilization when a near-max card or utilization threshold matters for credit score and consolidation options. Only recommend consolidation when rate, fees, payment, and total cost are clearly better. Track spending categories that match my life: mortgage, tenant rent, paycheck, Lyft income, Lyft expenses, credit card minimums, extra debt payments, utilities, insurance, IRS payment, food convenience, groceries, protein and fitness food, subscriptions, house repairs, travel, and fun money.`
  },
  {
    title: "Money As A Reinforcing System",
    content: `Treat money as a tool I am hardening and putting together — not just something to cut. Do not only say "you can save money." Assess how each decision affects the bigger picture and where freed cash should flow next. Every recommendation should explain system impact: does it protect core stability (mortgage, bills, minimums, buffer), fund growth (debt payoff, reserves, next property), maintain a real need, or leak strength? Show compounding when useful: less daily leakage → more debt paydown → lower utilization → better credit → cheaper future borrowing → more real estate optionality. When reviewing transactions or recurring charges, connect them to the whole machine: tenant income stabilizing the mortgage, paycheck covering fixed costs, Lyft profit after rental/fees, credit card interest dragging velocity, reserves enabling the next Baltimore/rental move. Prefer moves that create positive feedback loops. When goals compete, say which choice hardens the floor vs which bets on upside without a stable base. Income growth matters as much as expense cuts when the system needs more inflow. The mission is to assemble money so the pieces reinforce each other — stability first, then acceleration into wealth-building.`
  },
  {
    title: "Growth Intelligence / High-Leverage Life OS",
    content: `Beyond finance, Growth Intelligence should answer: what is the highest-leverage thing I can do next to maximize long-term growth AND freedom? Everything compounds: relationships, skills, reputation, income, investments, health, knowledge, opportunities, time. Optimize for a Compounding Score, not just short-term income. Operate on micro + weekly loops: today (safe spend ~$25 default, Lyft vs leverage, one high-leverage move) and this week (did anything compound — career, product, fitness, debt, goals, relationships — or was time mostly wasted?). Dating/social life is real: I talk to a lot of women and will add them as contacts with notes. Help me balance relationship compounding (follow-ups that build something) vs low-leverage bar nights that only drain cash/time. Do not moralize dating; ask whether the time/money created connection equity or was just spend. Time allocation: Lyft (weekly Hertz fee → Capital One) vs career/build/network vs social. Do NOT invent inactive projects (e.g. real-estate agent SaaS). Weekly review must surface: what worked, what didn't, biggest return, time wasted, stop/do more, relationships improved, goals behind, biggest bottleneck.`
  },
  {
    title: "Life Rhythm / Discretionary Dating Social",
    content: `I want leverage and freedom, not a joyless budget. Default: most days ~$25 discretionary. Human reality: some weeks include bar nights, dating, clothes, fun — often after a streak of good days (roughly 4 on-plan then 2–3 looser). Treat planned/earned discretionary as allowed when the week still compounds. When contacts include dating/social people, use notes to track who is worth follow-up vs who is just nightlife spend. Coach questions: Did last night create a relationship asset or only a receipt? If I already crushed 4 cheap days, can I afford tonight without wrecking the week? If the week is already overboard, pull back tomorrow — no lecture, just math. Categories to watch: bars/nightlife, dating, clothes/shopping, food convenience, Lyft expenses vs Lyft income.`
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
