# On This Day — 19 Agents + Bounded-Parallel / Nonblocking Runner

This restores the full 19-agent feature set while using the faster runner behavior.

RESEARCH EXECUTION
- Maximum 2 expensive research agents at once.
- Black Press + Major Press start together.
- Regional/Local + Community Press enter as worker slots free up.
- A slow/failing noncritical research agent does not stop the other worker.
- Community-lens agents do not wait for Major Press; when its anchors are not ready, they research the strongest same-date national events and preserve precise eventKey values.
- Source Verification reconciles the same-event clusters later.

PRESERVED 19 AGENTS
1 Editor Opening
2 Black Press
3 Major Press
4 Source Verification
5 Discrepancy
6 Regional/Local
7 Community Press
8 Historical Context
9 Rights
10 Translation
11 Visual Archive
12 Editor Closing
13 Then & Now
14 Recipe From the Archives
15 Illustrator
16 Social Editor
17 Short-Form Video
18 Engagement & Trends
19 Social Distribution

PRESERVED FEATURES
- resilient small-batch Source Verification
- rolling publication
- 200/75 side-story recovery
- same-event national headline logic
- Then & Now
- Recipe From the Archives
- Illustrator
- deterministic/local Short-Form Video reliability fix
- noncritical errors do not stop later agents
- locked public design

BUILD VERSION
2026-08-30.19agent-bounded-nonblocking.1

After deployment, /api/health must show this exact build and 19 agents.
Start ONE new run. Near the beginning, Black Press and Major Press should show RUNNING together.
