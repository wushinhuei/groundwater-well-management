# Windows WRA browser handoff

Queries the previous complete month through the WRA browser UI, without using
water-right API keys or submitting any WRA forms. The local MCP exposes one
read-only tool; the Windows runner uploads validated results to Drive.

Three disjoint groups run on days 6 at 12:43, 16 at 14:13, and 26 at 15:23
(Windows must use Taipei time). Queries are serial with an eight-second delay.
The current Windows user must be logged in and the computer available. A missed
run uses the batch corresponding to the current date; it does not backfill all
missed batches. Expired WRA sessions require manual login.

Keep configuration, service-account credentials, browser profile and saved WRA
session cookies outside the repository. The private session file contains only
WRA cookies, never an E-government password. Server-side expiration still applies.

`run.cjs CONFIG login` verifies login and stores the private session before
closing Chrome. `run.cjs CONFIG smoke-upload` reopens Chrome headlessly, queries
K1140087, then uploads a separately labelled single-well verification result.
It does not mark a normal batch complete. `Install-Task.ps1 -Config CONFIG
-Enable` requires this verification within the last 24 hours.

Apps Script `WindowsPumping.gs` polls Drive hourly near minute 43 and dispatches
the pumping-only GitHub workflow. Its installer replaces the old monthly pumping
triggers, leaving well-registry triggers intact. Successful GitHub completion is
acknowledged separately from dispatch; failed jobs retry at most three times.
The workflow run name must preserve the dispatch schedule for correlation.

Blank months remain null and never overwrite a previously recorded numeric
value. The staging source is not evidence that a website publication succeeded;
verify GitHub Actions and the published JSON separately.
