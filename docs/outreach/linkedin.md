# UsageOS: eight weeks of LinkedIn posts

Publish from your personal profile on Wednesdays at **6:30 p.m. IST**, starting **25 November 2026** if the [launch checks](community.md#before-the-first-post) pass. This is a starting slot you can be around for. If launch slips, shift the series together. Schedule the first two once ready, then plan in pairs so the later posts can reflect what people actually try and report.

Use a specific first sentence, one idea, one piece of evidence, and one ask. These drafts are intentionally short; add a detail only when it advances the story. Use the GitHub link in the post where the ask is to try UsageOS. Hashtags are optional: one or two relevant ones are plenty. Use the media notes as instructions, and copy only the blockquoted post text.

| Date (IST) | Post | What it should do |
| --- | --- | --- |
| 25 Nov 2026 | [Launch](#1--25-nov-launch) | Find the first outside installers |
| 2 Dec 2026 | [Follow a snapshot](#2--2-dec-follow-a-snapshot) | Explain what syncs and where it goes |
| 9 Dec 2026 | [The extension that would not load](#3--9-dec-the-extension-that-would-not-load) | Share a debugging lesson |
| 16 Dec 2026 | [Design the dashboard around resets](#4--16-dec-design-the-dashboard-around-resets) | Show one product design choice |
| 23 Dec 2026 | [Telegram reset alerts](#5--23-dec-telegram-reset-alerts) | Show an optional workflow |
| 30 Dec 2026 | [How I used AI tools](#6--30-dec-how-i-used-ai-tools) | Share a practical way to verify fixes |
| 6 Jan 2027 | [Preparing the repo for strangers](#7--6-jan-preparing-the-repo-for-strangers) | Share an open source release lesson |
| 13 Jan 2027 | [A small first contribution](#8--13-jan-a-small-first-contribution) | Turn interested readers into contributors |

## 1 · 25 Nov: Launch

**Media:** [Dark dashboard screenshot](../screenshots/dashboard-dark.png). Alt text: “UsageOS dashboard with five fictional Claude accounts showing session and weekly usage, plus an upcoming resets list.”

> I kept switching Claude browser profiles just to answer one question: when does this account reset?
>
> So I built UsageOS, a self-hosted dashboard that puts my Claude.ai accounts on one screen. I can see session and weekly usage, reset times, and a bit of history without opening every profile.
>
> The dashboard runs with Docker Compose. You load the extension from the repo in each Chromium profile you want to track. The screenshot uses fictional accounts.
>
> The server, dashboard, and extension are on GitHub under GPL-3.0: https://github.com/YRB19/UsageOS
>
> Credit to lugia19 for Claude Usage Tracker, the upstream extension I built on.
>
> If you use more than one Claude profile and give it a try, tell me how your first sync went.

## 2 · 2 Dec: Follow a snapshot

**Media:** Use the README architecture diagram as a reference. For a simple graphic, show `Claude.ai → Chromium extension → FastAPI → PostgreSQL`, then draw the React dashboard reading from FastAPI.

> What actually leaves the browser when UsageOS syncs?
>
> The extension sends a usage snapshot to the server you set. It includes usage percentages, reset times, the organization ID, and email and plan tier when available. The snapshot has no conversation text or attachments.
>
> FastAPI accepts it, Postgres keeps a history, and the dashboard reads from the backend. If the server is offline, the extension can queue snapshots in the browser and send them later.
>
> I wrote down the data flow, including what happens if you enable Telegram or Anthropic token counting: https://github.com/YRB19/UsageOS/blob/main/extension/PRIVACY.md
>
> If you were reviewing this extension before installing it, what would you want explained more clearly?

## 3 · 9 Dec: The extension that would not load

**Before publishing:** Confirm the manifest fix is public. The error reproduced in a clean Brave profile was `Could not load javascript 'common/ext/bridge-isolated.js' for script.` Brave loaded the same checkout with the local manifest fixes. If showing the browser error, capture only the relevant line.

> I found an open source release bug before the extension even got to Claude.ai: Chromium couldn't load it.
>
> The manifest pointed to scripts from a different upstream layout. Those files weren't in the repository. It's easy to read a valid JSON file and miss that the files it points to don't exist.
>
> The fix was to make the Chromium manifest match what actually ships in the folder. The patched extension loaded in a clean Brave profile. For the next release, I'd also like a check that fails whenever the manifest points to a missing file.
>
> What small release check has saved you from an “it works on my machine” bug?

## 4 · 16 Dec: Design the dashboard around resets

**Media:** [Mobile view](../screenshots/mobile.png) or [light dashboard](../screenshots/dashboard-light.png). Use one; both show fictional data.

> A usage bar tells me how close I am to a limit. A countdown tells me whether it's worth waiting.
>
> That's why UsageOS puts a reset time next to each usage bar. Session and weekly usage have their own rows, and there's a separate list of upcoming resets so I can scan them across accounts.
>
> I wanted the dashboard to answer one question at a glance: “When can I use this again?” This is the current layout with fictional data.
>
> On your phone, would you want the next reset at the top, or your most used account?

## 5 · 23 Dec: Telegram reset alerts

**Media:** [Demo alerts log](../screenshots/alerts.png). If you record the actual Telegram flow, use a test bot and fictional account names; keep chat IDs, handles and tokens out of frame.

> I wanted to know when a Claude limit reset without keeping the dashboard open.
>
> UsageOS can send a Telegram message shortly before a reset and another when it happens. You can choose which limits trigger alerts and how early to get the heads-up. The dashboard keeps an alerts log, too.
>
> It's optional. It uses a bot you set up and a public HTTPS webhook for incoming bot commands. Once linked, you can also save an account note from Telegram.
>
> If you use reset alerts, is a heads-up useful to you, or would you only want the message when the limit resets?

## 6 · 30 Dec: How I used AI tools

**Before publishing:** Confirm this describes your actual Claude and OpenCode workflow. If you have a specific example, add the real check you ran. Use your own words for the lessons you took from it.

> When an AI tool tells me a bug is fixed, my next question is: what did you run to prove it?
>
> On UsageOS I used Claude for planning and diagnosis and OpenCode to work through changes. I still needed a way to check the result outside the conversation. For an extension install fix, that means loading the folder in a clean browser profile and checking what Chromium actually reports.
>
> The useful habit was asking for a check I could repeat: a browser error, a response from the API, or a screenshot from the new build.
>
> What's one piece of evidence you ask for before trusting an AI-assisted fix?

## 7 · 6 Jan: Preparing the repo for strangers

**Media:** A crop of the quickstart or a photo of your own release checklist. Confirm the contributor guide is public before linking it.

> Opening the UsageOS repo made me look at the quickstart through someone else's eyes.
>
> My machine already knew which API key to use and how to load the extension. A new installer only had the README. One stale variable name was enough to send them down the wrong path.
>
> I split the docs by what people are trying to do: get the app running, work on the code, or report a problem. I also used fictional accounts in the screenshots so people can see the real interface without seeing my data.
>
> If you try new open source projects, what's the first thing you look for in a README?

## 8 · 13 Jan: A small first contribution

**Before publishing:** Link one open starter issue directly if it has been reproduced and scoped; replace the general issues link and make the task specific. The copy below works as an install feedback ask even if no starter issue is open.

> You can make a useful first contribution to UsageOS without changing any code: try the quickstart on a clean machine or profile and tell me where it breaks.
>
> The path is short: start the Docker stack, load the Chromium extension from the repo, and check that a Claude account appears after the first sync.
>
> If a step is confusing, please open an issue with your browser, OS, the step you were on, and what you saw. Use fictional data or redact account details and keys.
>
> Issues: https://github.com/YRB19/UsageOS/issues
>
> Which step got you from “I want to try this” to “I'm stuck”?
