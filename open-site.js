const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const DEFAULT_RUNS = 10;
const DEFAULT_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;

function readOptions() {
  const args = process.argv.slice(2);
  const options = {
    url: process.env.SITE_URL,
    runs: Number(process.env.RUNS || DEFAULT_RUNS),
    concurrency: Number(process.env.CONCURRENCY || 1),
    delayMs: Number(process.env.DELAY_MS || DEFAULT_DELAY_MS),
    timeoutMs: Number(process.env.TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    headless: false,
    keepOpen: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const [name, inlineValue] = argument.split("=", 2);
    const value = inlineValue ?? args[index + 1];

    if (name === "--url") {
      options.url = value;
      if (inlineValue === undefined) index += 1;
    } else if (name === "--runs") {
      options.runs = Number(value);
      if (inlineValue === undefined) index += 1;
    } else if (name === "--concurrency") {
      options.concurrency = Number(value);
      if (inlineValue === undefined) index += 1;
    } else if (name === "--delay-ms") {
      options.delayMs = Number(value);
      if (inlineValue === undefined) index += 1;
    } else if (name === "--timeout-ms") {
      options.timeoutMs = Number(value);
      if (inlineValue === undefined) index += 1;
    } else if (name === "--headless") {
      options.headless = true;
    } else if (name === "--keep-open") {
      options.keepOpen = true;
    } else if (name === "--help" || name === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!options.url) {
    throw new Error("A URL is required. Use --url https://example.com");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(options.url);
  } catch {
    throw new Error(`Invalid URL: ${options.url}`);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  if (!Number.isInteger(options.runs) || options.runs < 1) {
    throw new Error("--runs must be a positive integer.");
  }

  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }

  options.concurrency = Math.min(options.concurrency, options.runs);

  for (const [name, value] of [
    ["--delay-ms", options.delayMs],
    ["--timeout-ms", options.timeoutMs],
  ]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be zero or a positive number.`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage:
  node open-site.js --url <url> [options]

Options:
  --url <url>          Website to open (or SITE_URL)
  --runs <number>      Number of visits (default: 10, or RUNS)
  --concurrency <n>    Number of visits opened in parallel (default: 1)
  --delay-ms <number>  Time to leave each page open (default: 1000)
  --timeout-ms <number> Navigation timeout (default: 30000)
  --headless           Run without showing a browser window
  --keep-open          Keep Chrome open after the report is written
  --help               Show this help

Example:
  node open-site.js --url https://example.com --runs 10
`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const options = readOptions();
  const startedAt = new Date().toISOString();
  const results = [];
  let browser;

  try {
    // Use the locally installed Google Chrome channel by default. This is
    // normal Playwright automation; no stealth or bot-detection bypass is used.
    browser = await chromium.launch({
      channel: "chrome",
      headless: options.headless,
    });

    const openSite = async (run) => {
      const page = await browser.newPage();
      const visitStartedAt = Date.now();
      const result = {
        run,
        status: "failed",
        startedAt: new Date(visitStartedAt).toISOString(),
      };

      try {
        const response = await page.goto(options.url, {
          timeout: options.timeoutMs,
          waitUntil: "domcontentloaded",
        });

        result.status = "opened";
        result.finalUrl = page.url();
        result.httpStatus = response?.status() ?? null;
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
      }

      result.durationMs = Date.now() - visitStartedAt;
      result.finishedAt = new Date().toISOString();
      results.push(result);

      console.log(
        `Run ${run}/${options.runs}: ${result.status}` +
          (result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""),
      );

      if (!options.keepOpen || run < options.runs) {
        await page.close();
      }

      if (run < options.runs && options.delayMs > 0) {
        await sleep(options.delayMs);
      }
    };

    let nextRun = 1;
    const worker = async () => {
      while (true) {
        const run = nextRun;
        nextRun += 1;
        if (run > options.runs) return;
        await openSite(run);
      }
    };

    await Promise.all(
      Array.from({ length: options.concurrency }, () => worker()),
    );

    const report = {
      url: options.url,
      requestedRuns: options.runs,
      concurrency: options.concurrency,
      successfulOpens: results.filter((result) => result.status === "opened")
        .length,
      failedOpens: results.filter((result) => result.status === "failed")
        .length,
      startedAt,
      finishedAt: new Date().toISOString(),
      browser: "Google Chrome",
      headless: options.headless,
      results,
    };

    const reportsDirectory = path.join(__dirname, "reports");
    await fs.mkdir(reportsDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(reportsDirectory, `run-${timestamp}.json`);
    const latestReportPath = path.join(reportsDirectory, "latest.json");
    const reportJson = `${JSON.stringify(report, null, 2)}\n`;
    await Promise.all([
      fs.writeFile(reportPath, reportJson),
      fs.writeFile(latestReportPath, reportJson),
    ]);

    console.log(`Report: ${reportPath}`);
  } finally {
    if (browser && !options.keepOpen) {
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
