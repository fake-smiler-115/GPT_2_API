# Browser Open POC

This POC opens a supplied website in a visible Google Chrome window repeatedly
and writes a JSON report. It does not submit prompts, log in, inspect page
content, or attempt to bypass bot-detection systems.

## Setup

```bash
npm install
npx playwright install chrome
```

## Run

```bash
npm start -- --url https://example.com --runs 10
```

Visits are sequential by default. To run visits in parallel, set a
concurrency value:

```bash
# Recommended starting point
npm start -- --url https://example.com --runs 1000 --concurrency 50

# Attempt all 1,000 visits at the same time
npm start -- --url https://example.com --runs 1000 --concurrency 1000
```

Each parallel visit uses a separate Chrome tab. Running 1,000 tabs at once can
exhaust system memory or cause Chrome/the target server to reject requests, so
start with a smaller concurrency such as 25–100.

The URL and run count can also be supplied through environment variables:

```bash
SITE_URL=https://example.com RUNS=10 npm start
```

To leave the Node process running in the background while Chrome opens visibly:

```bash
nohup npm start -- --url https://example.com --runs 10 > run.log 2>&1 &
```

Reports are written to `reports/latest.json` and to a timestamped JSON file.

Useful options:

```text
--delay-ms 1000     Keep each page open for 1 second
--timeout-ms 30000  Navigation timeout
--concurrency 1     Number of visits opened in parallel
--headless          Do not show the browser window
--keep-open         Leave Chrome open after the run
```
# GPT_2_API
