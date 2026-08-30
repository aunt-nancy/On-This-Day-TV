# On This Day — Agent #17 Final Stability Fix

YES — THIS RESTORES THE WORKING AGENT BEHAVIOR

The newsroom now follows the same stability principle as the earlier working version:
- critical editorial work can block publication only when it genuinely must;
- optional production/social agents cannot stop the remaining newsroom;
- a 404, timeout, or transport problem in a noncritical agent is recorded and the run continues.

AGENT #17 — SHORT-FORM VIDEO
The 404 path is removed entirely.

Agent #17 no longer makes an OpenAI, video-generation, webhook, or other external generation request.
It creates two short-form video packages directly from the already-verified published edition.

It outputs:
- hook
- short script
- five-shot plan
- caption
- source URL
- link URL
- Social Distribution-compatible post data

Because it is built locally from the verified edition:
- no OpenAI 404 is possible;
- no malformed model JSON is possible;
- no external video service is required;
- it completes almost immediately.

ADMIN RUNNER
If any future noncritical agent throws a network/404/timeout error, Admin now continues the remaining agents rather than treating the transport error as a blocking newsroom failure.

UNCHANGED
- 19-agent roster
- Source Verification stability batching
- early 200/100/75 publication
- Then & Now early publication
- Recipe From the Archives
- Illustrator
- locked public design
- Supabase schema
- DNS

REPLACE THE FULL PACKAGE CONTENTS AT REPOSITORY ROOT.

This is intentionally an isolated final stability change for Agent #17 and noncritical error handling.
