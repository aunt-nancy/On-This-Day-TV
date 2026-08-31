# On This Day — Site Date / Time Zone Fix

ROOT CAUSE
When Admin's date input was blank, computeEditionDate() used `new Date()` and
then converted it to an ISO/UTC date.

At 5:00 PM Pacific during daylight time, UTC has already advanced to the next
calendar day.

Example:
- Los Angeles: August 30, evening
- Vercel UTC: August 31

Therefore a blank-date Run All, side-headline repair, or illustration workflow
could target August 31 while the public page still displayed the August 30
edition.

FIX
- Site default date is now based on `America/Los_Angeles`.
- Optional env override: OTD_TIME_ZONE
- No new env variable is required.
- Admin date input automatically fills the browser's local YYYY-MM-DD date.
- Run All / Fill 200/75 use that explicit date instead of undefined.
- /api/content/today also uses the site time zone instead of UTC.
- /api/content/today now reports `siteDate` and `siteTimeZone` for diagnostics.

LOCKED
- 19 agents unchanged.
- Mandatory 200/75 publication contract unchanged.
- Bounded-parallel/nonblocking runner unchanged.
- No public layout/design files changed.

BUILD
2026-08-30.19agent-site-date-pacific.1

AFTER DEPLOYMENT
For tonight's August 30 edition:
1. Reload Admin.
2. Confirm the date field visibly says 2026-08-30.
3. Start ONE new Run All Agents run.

That run will research 1826 / 1926 / 1951 and attach visuals to the August 30
edition instead of silently working on August 31.
