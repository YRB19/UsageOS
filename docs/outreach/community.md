# UsageOS launch and community plan

UsageOS is for people who use multiple Claude.ai accounts and want one place to see limits and reset times. The first launch goal is **three confirmed outside installs and two actionable reports**. Treat those as targets, then use what people report to decide what to fix and what to write about next.

## Before the first post

- [x] Public [GitHub repo](https://github.com/YRB19/UsageOS), GPL-3.0 license, upstream credit, and README screenshots with fictional accounts.
- [ ] Get the corrected `SERVER_API_KEY` quickstart, Chromium manifest files, privacy docs, and [contributor guide](../../CONTRIBUTING.md) onto public `main` together. On 18 November, Brave rejected the public checkout because `common/ext/bridge-isolated.js` was missing. Brave loaded the same checkout with the local manifest fixes, and the extension's background worker started.
- [ ] Follow the public quickstart from a clean clone and a fresh Chromium profile: generate throwaway secrets, run `docker compose up -d --build`, check `/api/v1/health`, sign into the dashboard, load the extension, use **Test Connection**, and confirm one authorized Claude account appears after a message. Check that a second profile appears separately if you have a second account. Ask an outside tester to repeat the core path before broad outreach. The screenshot and the demo seed can help someone preview the product without an account; they do not verify browser sync.
- [ ] Enable GitHub private vulnerability reporting or give users a working private contact method. On 18 November it was disabled, but `SECURITY.md` tells users to use it.
- [ ] After the clean install passes, publish a tagged release with install steps and known limitations. This gives testers a stable version to report. No public tags or releases were present on 18 November.
- [ ] Update the repo description to **Self-hosted dashboard for Claude.ai account usage and reset times**. Suggested topics: `claude`, `self-hosted`, `usage-tracker`, `chrome-extension`, `docker-compose`. Start with GitHub Issues for reproducible bugs and concrete improvements; add Discussions if enough setup questions recur to justify a second place to check.

## First month of outreach

1. **Launch week: LinkedIn from your personal profile.** Use [the launch draft](linkedin.md#1--25-nov-launch) with the demo screenshot, a direct link to the repo, and one ask: tell me what got in the way of your first sync. Credit the upstream maintainer by name and repo. No need to tag the maintainer or people who star the repo; thank people for specific help when they offer it.
2. **Once the quickstart works for someone else: r/ClaudeAI.** Start here for relevant users. Check the current [Showcase guidance](https://www.reddit.com/r/ClaudeAI/comments/1qe5wtt/rule_7_is_getting_a_glowup_less_spam_more_how_the/). Write a short post in your own words: say you built it, what it does for Claude users, how Claude helped with development, and how to try the free software. Be explicit about the Docker and unpacked extension steps and any account needed to test real sync. Use the required flair if prompted and ask for one piece of setup feedback.
3. **After responding to that feedback: r/selfhosted.** Recheck the [subreddit rules](https://www.reddit.com/r/selfhosted/about/rules/) and the current pinned [New Project Megathread](https://www.reddit.com/r/selfhosted/). Projects under three months since their first public presence go in the megathread; the repo creation date alone does not establish when it became public. When in doubt, use the permitted new project thread. Cover what runs in Docker, what the browser extension does, where the data goes, and disclose AI involvement as requested by the mods. Write it yourself for the venue.
4. **Later: Show HN or a technical write-up.** Use [Show HN](https://news.ycombinator.com/showhn.html) when people can try a working release. A demo with fake data and no login would make it easier to see what the app does. [HN requires authors to write their own submissions and comments](https://news.ycombinator.com/newsguidelines.html). A separate article about the manifest bug is worthwhile if you can show the error, the fix, and the verification.

Skip r/opensource for this launch given its [restrictions on project submissions](https://www.reddit.com/r/opensource/comments/1xelcuf/your_tokens_arent_valuable_no_more_ai/). Revisit [awesome-selfhosted-data](https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/CONTRIBUTING.md) once the first tagged release is more than four months old and the project meets the other criteria; they prohibit AI-generated submissions. Leave Product Hunt and extra cross-posts until you have evidence that people can install and use it.

## Three starter issue drafts

Publish only issues you want to maintain. Give each a starting file, an observable result, and a way to verify it. Add `good first issue` to scoped, confirmed tasks. Prefer a handful of real tasks over a backlog created for launch.

### Adoption task: Add a quickstart for trying the dashboard with fictional data

**Problem:** The public quickstart takes readers directly to an extension install and Claude sign-in. The developer guide already documents a demo seed, but an evaluator may not find it.

**Scope:** Add a short optional section to `README.md` that points to the existing seed flow once the local stack is running. Explain that it is for a throwaway local database, how to view the dashboard, and how to remove only the demo rows. No new demo infrastructure or changes to the seed script.

**Done when:** Following the README from a fresh local stack produces a visible set of fictional accounts without a Claude sign-in, and the linked cleanup command removes those demo rows.

### Narrow existing issue [#5](https://github.com/YRB19/UsageOS/issues/5): Keep account detail notes and color controls usable at mobile widths

**Problem:** The report mentions notes sizing and color control spacing on the account detail page. First attach a reproducible example with demo data, including browser and viewport width.

**Scope:** Start in `frontend/src/pages/AccountHistoryPage.tsx` and the components it uses. At a narrow phone viewport such as 390 px, fix the confirmed layout problem without changing how notes save or colors are applied. If notes and spacing turn out to be separate bugs, scope this issue to one of them.

**Done when:** The controls fit without horizontal overflow at the reproduced width, both actions still work, and the PR includes comparable mobile before/after screenshots plus a desktop spot check.

### Regression task: Detect missing files in the unpacked Chromium manifest

**Problem:** The November public snapshot referenced scripts that were not shipped. Valid JSON alone did not catch this.

**Scope:** Add a small local validation command for `extension/manifest.json` and `extension/manifest_chrome.json`. Check that the manifests match and that referenced background, content script, popup, options, icon, and web accessible files exist under `extension/`. Keep Firefox and desktop manifests out of scope.

**Done when:** The command succeeds on a clean checkout with the fixed manifests and exits nonzero with the missing path when given a manifest with a bogus script reference. Document how to run it in `README-dev.md`.

Triage [#4](https://github.com/YRB19/UsageOS/issues/4) separately. A swapped session/weekly limit can be a display or data problem; reproduce it with expected values before estimating scope or asking a newcomer to fix it.

## How to run each week

Choose one post and one asset. Use your own profile and [LinkedIn's native scheduler](https://www.linkedin.com/help/linkedin/answer/a1347212): open **Start a post**, add the copy and media, click the **clock**, pick the date and time, preview, and schedule. Confirm that your device timezone is set to India if you follow the IST calendar. Queue the first two only after the launch checks pass and keep the rest flexible. Use a direct repo link for installs; if a later post is only meant to start a discussion, the link can be omitted. Treat timing and link placement as choices to test, not rules about the feed.

Set aside time after each post to answer setup questions. Turn repeat questions into README changes and reproducible bugs into GitHub issues. Once a week, record the following; log installs only when someone confirms them.

| Post / channel | Confirmed first syncs | Useful reports or questions | Issue/PR references | What to change next |
| --- | ---: | ---: | --- | --- |
| | | | | |

After week eight, write about one real user problem solved, one concrete contributor change (with credit), or one verified release improvement each week. If nothing worth sharing happened, gather feedback for the next useful post.
