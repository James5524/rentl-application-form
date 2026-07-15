# FormForge

A small, self-hosted form builder — build forms with a drag-and-drop editor, share a link, and collect responses.

## 1. Run it locally (to build and test your form)

Requirements: [Node.js](https://nodejs.org) 18 or newer.

```bash
cd formforge
npm install
npm start
```

Open **http://localhost:3210**. This link only works on your own computer — see part 3 to get a real public link.

Your **RENTL Application Template** is already there, built from your Jotform fields, ready to go.

## 2. Duplicate the template per property

1. On the forms list, click **Duplicate** on "RENTL Application Template", type the property name/address as the new title, and it instantly creates a fully separate saved form — its own link, its own responses — with all the same fields already in place.
2. Click **Share link** on that card to copy its link and send it out.
3. Repeat for each new property. The original template is never touched, so it's always there to duplicate again.

If you ever want to tweak the master template itself (add/remove a question), edit "RENTL Application Template" directly, then duplicate it for future properties — forms you've already sent out won't change retroactively.

### How the "how many adults" question works

The first question in the Applicant Details section asks how many adults (1–4) will live at the property. Whatever number the applicant picks, that many "Adult" blocks appear immediately below it — each with its own name, date of birth, employment, income, and background questions. Applicants can only fill in personal details for the number of adults they declared.

This is built using a field type called a **Repeating group** — you'll see it in the builder if you open the template. You can change the per-adult questions inside it, or the label ("Adult"), or the max number of adults (currently 4), all from the builder.

There's also a plain **Section heading** field type available for adding instructional text (like the referencing/ID notice or the Terms section) between questions without it being an actual input.

## 3. Get a real public link (deploy to Render, free)

Running locally only works while your computer is on. To get a link that works for anyone, anytime, deploy it:

1. Put this folder in a GitHub repository (create a free GitHub account if you don't have one, create a new repo, upload these files — skip `node_modules`).
2. Go to [render.com](https://render.com), sign up free, click **New > Web Service**, and connect your GitHub repo.
3. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - Instance type: **Free**
4. Click **Create Web Service**. Render will give you a permanent URL like `https://your-app.onrender.com`.

**Important:** Render's free tier wipes the app's file storage whenever it goes idle and restarts (after ~15 minutes of no traffic) — this deletes every stored form, including your duplicated per-property links, not just submissions. That's what part 4 solves, for free, without needing a paid plan.

## 4. Make your data permanent (free, via Upstash Redis)

The app can store everything in a free Upstash Redis database instead of Render's own disk, so your duplicated property forms, their links, and all submissions survive restarts indefinitely. (We tried MongoDB Atlas first, but its connection method turned out to be incompatible with Render's network. Upstash connects over plain HTTPS instead - the same method that already works fine for the email notifications - which avoids that problem entirely.)

1. Go to [upstash.com](https://upstash.com) and sign up free (no credit card needed).
2. Click **Create Database**. Give it any name, choose the **Free** plan, pick any region, and click **Create**.
3. On the database's page, find the **REST API** section. You'll see two values: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — click to reveal/copy each one.
4. In Render, go to your service → **Environment** → **Add Environment Variable**, and add both:
   - Key: `UPSTASH_REDIS_REST_URL` — Value: the URL from step 3
   - Key: `UPSTASH_REDIS_REST_TOKEN` — Value: the token from step 3
5. Save. Render redeploys automatically. Check the **Logs** tab for `Storage backend: Upstash Redis (persistent)` to confirm it's connected.

*(Running locally instead? Copy `.env.example` to `.env` and fill in both Upstash values the same way — or just leave them blank, since local runs already use a plain file and don't need this.)*

## 5. Get emailed a copy of every application too

Since free hosting can't reliably keep files long-term, the app emails you a copy of every submission the moment it comes in — so even if the on-site dashboard resets, you always have the record in your inbox.

1. Sign up free at [resend.com](https://resend.com) (3,000 emails/month free, no credit card).
2. Create an API key in the Resend dashboard.
3. In Render, go to your service → **Environment**, and add:
   - `RESEND_API_KEY` = the key from Resend
   - `NOTIFY_EMAIL` = `office@jgla.co.uk` (or whichever address should receive applications)
4. Redeploy. Submit a test application through your form's link — you should get an email within a few seconds.

You don't need to verify a domain in Resend for this — sending to your own account email works out of the box with their default sending address.

*(Running locally instead? Copy `.env.example` to `.env` in the project folder and fill in the same two values — no deployment needed to test it.)*

## Data storage

Locally (no Upstash variables set), everything lives in `data/db.json`. Once those are set (see part 4), all reads/writes go to your free Upstash Redis database instead, and that file is unused.

The responses table and CSV export automatically expand each adult into its own set of columns (e.g. "Adult 1 - Full Name", "Adult 2 - Full Name" …), so multi-person applications open cleanly in Excel/Sheets.

If you ever need a fresh copy of the original template (e.g. you deleted it by accident), run `node seed-template.js` from the project folder — it adds a new copy without touching anything else.

## Notes on scope

This is a lean, single-user tool — no accounts/logins, conditional logic, or payment fields. Ask if you'd like any of those added.
