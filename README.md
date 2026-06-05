# Financial Tracker

Mobile-friendly personal finance tracker built with Next.js and Plaid. Connect checking, savings, credit, and mortgage accounts (Chase, PNC, US Bank, and others) in one dashboard.

## Quick start

1. **Get Plaid keys** from the [Plaid Dashboard](https://dashboard.plaid.com/developers/keys) (you already have production access).

2. **Configure environment** — copy `.env.example` to `.env` and fill in:

```bash
PLAID_CLIENT_ID=your_client_id
PLAID_TEST_SECRET=your_sandbox_secret
PLAID_PROD_SECRET=your_production_secret
PLAID_ENV=sandbox
```

Start with `PLAID_ENV=sandbox` to test the flow with Plaid's test banks. When ready for real Chase / PNC / US Bank data, switch to `PLAID_ENV=production`.

3. **Run the app:**

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your phone or browser.

## What it does today

- Opens **Plaid Link** to connect bank accounts
- Shows **net worth**, assets, and liabilities
- Groups accounts by institution (Chase, PNC, US Bank mortgage, etc.)
- Mobile-first layout with a sticky connect button

## Linking your banks

Plaid Link supports all three institutions you mentioned:

| Bank | Use case |
|------|----------|
| Chase | Checking / savings |
| PNC | Checking / savings |
| US Bank | Mortgage (and other accounts) |

Tap **Connect bank account**, search for the institution, and sign in. Link each bank once; all accounts under that login appear automatically.

## Security notes

- Access tokens are stored locally in `.data/` during development. For production, move token storage to a secure database (e.g. Supabase).
- Never commit `.env` or `.data/` — both are gitignored.
- Rotate your Plaid secrets if they were ever exposed.

## Next steps

- Transaction history and spending categories
- Mortgage payoff tracking
- Cash flow projections
- Persistent cloud storage with Supabase
