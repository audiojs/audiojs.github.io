# GitHub Sponsors setup kit — audiojs org

Everything below is ready to paste. The plumbing is already live: `funding` field on all ~315 public packages (`npm fund` resolves org-wide), `FUNDING.yml` in all 47 repos + org default in [audiojs/.github](https://github.com/audiojs/.github), org profile README with the sponsor pitch. The only remaining steps need the account holder.

## Enable (one-time, ~20 min, account holder only)

1. https://github.com/sponsors/accounts → "Join the waitlist / Set up Sponsors" for **audiojs** (org, not personal) — usually instant for orgs in supported regions.
2. Payout: Stripe Connect (Canada supported) — business type "individual" works for an unincorporated maintainer; bank details + identity.
3. Tax: W-8BEN (non-US individual). GitHub charges no fees for Sponsors; 100% passes through.
4. Paste the listing content below; publish. The sponsor button appears on every repo automatically (FUNDING.yml is already everywhere).
5. Optional same-day: enable "Sponsors can pay by invoice" (corporates need this — procurement rarely uses credit cards).

## Listing content (paste-ready)

**Short bio** (≤250 chars):
> Audio DSP for JavaScript — 330 packages, 2M+ installs/week. Decode, process, analyse, synthesise: reference implementations, paper-cited and verified, MIT forever. One maintainer; sponsorship funds the maintenance that keeps it coherent.

**Introduction:**
> audiojs is the audio-DSP layer of the JS ecosystem: `audio-decode`, `audio-buffer` and `audio-type` alone are installed **2M+ times a week**, parsing untrusted audio in production pipelines everywhere. On top of that substrate sit ~330 `@audio/*` packages — loudness (BS.1770/EBU-verified), dynamics, denoise/restoration, pitch/time, MIR, synthesis — every algorithm an installable atom, every atom hostable as an AudioWorklet or compiled toward native plugin targets.
>
> It is maintained by one person. Your sponsorship buys maintenance: security response on the decode attack surface, cross-runtime testing, dependency coherence across 47 repos, and the reference-grade verification (differential tests against specs and canonical implementations) that makes these packages safe to depend on.
>
> Algorithms stay MIT forever. Sponsorship is not a paywall — it is how the commons stays maintained.

**First goal:** `$1,000/mo — funds CI across 9 platform legs, audio test hardware, and one dedicated maintenance day per week.`

## Tiers

Monthly:
| $ | Name | Reward |
|---|---|---|
| 5 | Supporter | Name in BACKERS.md, warm feeling of a maintained dependency tree |
| 25 | Backer | + name/link on the audiojs.org sponsor wall |
| 100 | Silver | + logo (small) on audiojs.org |
| 500 | Gold | + logo on the org profile README; issue-triage priority label |
| 2,000 | Corporate | + logo on the `audio` engine README + site header wall; direct channel (email/Slack); roadmap input. The honest pitch: you already ship on audio-decode/audio-buffer — this costs less per year than one engineer-month of replacing it |
| 5,000 | Infrastructure partner | + named support agreement (response SLO on the packages you depend on), quarterly maintenance report, co-announcement |

One-time: $10 (thanks), $250 (sponsor a package release — named in its release notes), $2,500 (sponsor a package family — named in the family README for a year).

## After enabling (same session, 10 min)

- [ ] Verify `npm fund audio-decode` and any `@audio/*` package prints the sponsors URL (already published; link goes live with the listing).
- [ ] Add sponsor strip to site (todo §Funder evidence) — live ledger embed: `https://github.com/sponsors/audiojs` + wall.
- [ ] Corporate outreach can start immediately (todo §Funding now-actions): dependents of audio-decode via GitHub dependency graph → Descript, Riverside.fm, BandLab, LiveKit, Daily — pitch = Corporate tier above.
- [ ] Open Source Collective application (fiscal host, free) — parallel rail for orgs that can't do GitHub Sponsors; add `open_collective: audiojs` to the org FUNDING.yml once approved.
- [ ] thanks.dev enrollment reads FUNDING.yml automatically once Sponsors is live.

## Notes

- Numbers verified 2026-07-10: audio-decode 710,862/wk · audio-type 733,656/wk · audio-buffer 693,673/wk · fourier-transform 23,602/wk · pcm-convert 9,104/wk.
- The funding field points at `https://github.com/sponsors/audiojs` — it 404s until step 4 above; enable before announcing anything.
- GitHub Secure OSS Fund application (todo) is strengthened by an active Sponsors profile — do this first.
