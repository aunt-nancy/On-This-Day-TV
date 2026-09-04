# On This Day — Automatic Scheduler Catch-Up

ROOT CAUSE OF THE AUGUST 31 MISS
The first automatic scheduler only created a new edition during the first
10 minutes of each publishing window.

At 12:43 AM Pacific, if the midnight trigger had been missed, the scheduler
would do nothing until noon.

THIS FIX REMOVES THAT FAILURE MODE.

CATCH-UP BEHAVIOR
Whenever cron wakes, it determines the most recent publishing window that
should already exist today:

00:00–05:59 -> New-day kickoff
06:00–08:59 -> Early morning
09:00–11:59 -> Morning
12:00–14:59 -> Midday
15:00–17:59 -> Afternoon
18:00–21:59 -> Evening
22:00–23:59 -> Late Breaking

If that slot has not been created, it is created immediately.

Examples:
- deploy at 12:43 AM -> New-day Edition starts at next cron wake-up
- outage until 1:30 PM -> Midday Edition starts at next cron wake-up
- redeploy at 8:15 PM -> Evening Edition starts at next cron wake-up

Idempotency still prevents duplicate runs for the same date/slot.

LOCKED
- 19 agents unchanged
- bounded-parallel/nonblocking runner unchanged
- #12 remains Closing Desk publisher
- Pacific site date unchanged

BUILD
2026-08-31.19agent-scheduler-catchup.1
