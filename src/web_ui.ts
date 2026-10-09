export function homePage(): string {
  return page(
    "Distil",
    [
      '<button id="theme" class="theme" aria-label="Toggle theme">◐</button>',
      "<main>",
      "<h1>Distil</h1>",
      '<p class="lede">Turn the sources you trust into a focused research digest.</p>',
      '<section class="card">',
      "<h2>Collect</h2>",
      '<label for="days">Days to look back</label>',
      '<div class="row"><input id="days" type="number" min="1" max="30" value="7">',
      '<label class="check"><input id="include-seen" type="checkbox"> Include seen</label>',
      '<button id="fetch">Fetch items</button>',
      '<button id="cancel-fetch" class="secondary" disabled>Stop and reset</button></div>',
      '<p id="fetch-status" class="status" aria-live="polite"></p>',
      '<progress id="fetch-progress" hidden></progress>',
      '<ol id="fetch-log" class="progress-log" aria-live="polite"></ol>',
      '<div id="review-actions" class="review-actions row" hidden>',
      '<strong id="review-summary"></strong>',
      '<button id="include-unresolved" type="button" class="secondary" data-review-action>Include all</button>',
      '<button id="exclude-unresolved" type="button" class="secondary" data-review-action>Exclude all</button>',
      "</div>",
      '<div id="preview"></div>',
      "</section>",
      '<section class="card">',
      "<h2>Generate</h2>",
      '<button id="generate" disabled>Generate digest</button>',
      '<p id="generate-status" class="status" aria-live="polite"></p>',
      '<pre id="output" tabindex="0"></pre>',
      "</section>",
      '<a href="/history">View history →</a>',
      "</main>",
    ].join("\n"),
    HOME_SCRIPT,
  );
}

export function historyPage(files: string[]): string {
  const list = files.length === 0
    ? "<p>No digests yet.</p>"
    : `<ul>${
      files.map((file) =>
        `<li><a href="/history/${encodeURIComponent(file)}">${escapeHtml(file)}</a></li>`
      ).join("")
    }</ul>`;
  return page(
    "History · Distil",
    [
      "<main>",
      "<h1>History</h1>",
      list,
      '<a href="/">← Back</a>',
      "</main>",
    ].join("\n"),
  );
}

export function viewPage(filename: string, content: string): string {
  return page(
    `${filename} · Distil`,
    [
      "<main>",
      `<h1>${escapeHtml(filename)}</h1>`,
      `<pre tabindex="0">${escapeHtml(content)}</pre>`,
      '<a href="/history">← Back to history</a>',
      "</main>",
    ].join("\n"),
  );
}

export function notFoundPage(): string {
  return page(
    "Not found · Distil",
    [
      "<main>",
      "<h1>Not found</h1>",
      "<p>The requested page does not exist.</p>",
      '<a href="/">← Back</a>',
      "</main>",
    ].join("\n"),
  );
}

function page(title: string, body: string, script = ""): string {
  return [
    "<!doctype html>",
    '<html lang="en" data-theme="dark" data-palette="fasthtml-blue">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${CSS}</style>`,
    "</head>",
    `<body>${body}${script ? `<script>${script}</script>` : ""}</body>`,
    "</html>",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]!);
}

const CSS = String.raw`
  :root { color-scheme:light; --blue-600:#2563eb; --blue-500:#3b82f6;
    --blue-400:#60a5fa; --bg:#fff; --ink:#1f2937; --card:#fff; --input:#fff;
    --muted:#475569; --line:#d1d5db; --accent:var(--blue-600);
    --accent-hover:var(--blue-600); --accent-ink:#fff; --link:var(--blue-600);
    --focus:#fbbf24; --focus-ring:#1f2937; --pre-bg:#f1f5f9; --pre-ink:#1f2937;
    --shadow:#00000012; }
  :root[data-theme="dark"] { color-scheme:dark; --bg:#111827; --ink:#f9fafb;
    --card:#1f2937; --input:#374151; --muted:#d1d5db; --line:#374151;
    --accent:var(--blue-600); --accent-hover:var(--blue-600); --accent-ink:#fff;
    --link:var(--blue-400); --focus:#fbbf24; --focus-ring:#f9fafb;
    --pre-bg:#0f172a; --pre-ink:#e2e8f0; --shadow:#0000004d; }
  * { box-sizing:border-box; } [hidden] { display:none!important; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.55 ui-sans-serif,system-ui,sans-serif; }
  main { width:min(780px,calc(100% - 2rem)); margin:4rem auto; }
  h1 { margin:0; font:700 clamp(2.6rem,8vw,5rem)/.95 ui-serif,Georgia,serif;
    letter-spacing:-.045em; } h2 { margin-top:0; font-size:1.05rem; }
  .lede { color:var(--muted); font-size:1.1rem; margin:1rem 0 2rem; }
  .card { border:1px solid var(--line); background:var(--card); border-radius:14px;
    padding:1.25rem; margin:1rem 0; box-shadow:0 8px 28px var(--shadow); }
  .row { display:flex; gap:.75rem; align-items:center; flex-wrap:wrap; }
  label { display:block; color:var(--muted); margin-bottom:.35rem; }
  input,button { font:inherit; border-radius:9px; border:1px solid var(--line);
    padding:.68rem .9rem; } input { width:8rem; background:var(--input); color:var(--ink); }
  .check { display:flex; align-items:center; gap:.45rem; margin:0; }
  .check input { width:auto; accent-color:var(--accent); }
  button { cursor:pointer; background:var(--accent); color:var(--accent-ink);
    border-color:transparent; font-weight:700; } button:hover:not(:disabled) {
    background:var(--accent-hover); transform:translateY(-1px); }
  button.secondary { background:transparent; color:var(--link); border-color:var(--link); }
  button.secondary:hover:not(:disabled) { background:var(--pre-bg); }
  button:disabled { opacity:.45; cursor:not-allowed; }
  button:focus-visible,input:focus-visible,a:focus-visible,pre:focus-visible {
    outline:3px solid var(--focus-ring); outline-offset:3px;
    box-shadow:0 0 0 3px var(--focus); }
  .theme { position:fixed; right:1rem; top:1rem; width:2.75rem; padding:.55rem; }
  .status { min-height:1.5rem; color:var(--muted); }
  progress { width:100%; height:.65rem; accent-color:var(--accent); }
  .progress-log { max-height:10rem; overflow:auto; margin:.65rem 0 1rem;
    padding-left:1.5rem; color:var(--muted); font-size:.9rem; }
  .review-actions { padding:.75rem; margin:.75rem 0; border:1px solid var(--line);
    border-radius:9px; background:var(--pre-bg); }
  details { border-top:1px solid var(--line); padding:.6rem 0; }
  summary { cursor:pointer; font-weight:700; } ul { padding-left:1.3rem; }
  .decision { margin:.55rem 0; } .decision small { display:block; color:var(--muted); }
  .decision-actions { display:flex; gap:.5rem; margin:.4rem 0 0 3.45rem; }
  .decision-actions button { padding:.35rem .65rem; font-size:.85rem; }
  .tag { display:inline-flex; align-items:center; justify-content:center; gap:.3rem;
    min-width:6.5rem; margin-right:.45rem; padding:.12rem .5rem; border:1px solid var(--line);
    border-radius:999px; color:var(--muted); font-size:.75rem; font-weight:800;
    letter-spacing:.04em; text-transform:uppercase; }
  .keep .tag { color:var(--accent-ink); background:var(--accent);
    border-color:var(--accent); }
  .review .tag,.fallback .tag { color:var(--link); border-color:var(--link);
    border-style:dashed; }
  .skip .tag { color:var(--muted); border-color:var(--muted); }
  .tag-icon { font-size:1rem; line-height:1; }
  pre { white-space:pre-wrap; overflow-wrap:anywhere; background:var(--pre-bg);
    color:var(--pre-ink); border:1px solid var(--line); padding:1rem; border-radius:10px;
    max-height:34rem; overflow:auto; }
  pre:empty { display:none; } a { color:var(--link); text-decoration-thickness:.1em;
    text-underline-offset:.18em; }
  @media (max-width:520px) { main { margin:3rem auto; } .card { padding:1rem; } }
`;

const HOME_SCRIPT = String.raw`
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("distil-theme") || "dark";
  root.dataset.theme = savedTheme;
  document.querySelector("#theme").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("distil-theme", root.dataset.theme);
  });

  const fetchButton = document.querySelector("#fetch");
  const cancelFetchButton = document.querySelector("#cancel-fetch");
  const generateButton = document.querySelector("#generate");
  const fetchStatus = document.querySelector("#fetch-status");
  const fetchProgress = document.querySelector("#fetch-progress");
  const fetchLog = document.querySelector("#fetch-log");
  const reviewActions = document.querySelector("#review-actions");
  const reviewSummary = document.querySelector("#review-summary");
  const includeUnresolvedButton = document.querySelector("#include-unresolved");
  const excludeUnresolvedButton = document.querySelector("#exclude-unresolved");
  const generateStatus = document.querySelector("#generate-status");
  const preview = document.querySelector("#preview");
  const output = document.querySelector("#output");
  const dispositions = {
    selected: { label: "Include", icon: "✓", className: "keep" },
    excluded: { label: "Exclude", icon: "–", className: "skip" },
    review: { label: "Review", icon: "?", className: "review" },
    seen: { label: "Seen", className: "seen" },
    fallback: { label: "Fallback", icon: "!", className: "fallback" },
  };
  let pollTimer;

  fetchButton.addEventListener("click", async () => {
    fetchButton.disabled = true;
    generateButton.disabled = true;
    preview.replaceChildren();
    try {
      const response = await fetch("/api/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          days: Number(document.querySelector("#days").value),
          includeSeen: document.querySelector("#include-seen").checked,
        }),
      });
      const data = await response.json();
      if (!response.ok && data.status !== "running") {
        throw new Error(data.error || "Fetch failed");
      }
      renderFetchState(data);
    } catch (error) {
      fetchStatus.textContent = error.message;
      fetchButton.disabled = false;
    }
  });

  cancelFetchButton.addEventListener("click", async () => {
    cancelFetchButton.disabled = true;
    fetchStatus.textContent = "Stopping fetch…";
    try {
      const response = await fetch("/api/fetch", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reset fetch");
      preview.replaceChildren();
      renderFetchState(data);
    } catch (error) {
      fetchStatus.textContent = error.message;
      cancelFetchButton.disabled = false;
    }
  });

  async function refreshFetchState() {
    try {
      const response = await fetch("/api/fetch/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read fetch progress");
      renderFetchState(data);
    } catch (error) {
      fetchStatus.textContent = error.message;
      schedulePoll();
    }
  }

  function renderFetchState(data) {
    clearTimeout(pollTimer);
    renderProgress(data);
    if (data.status === "running") {
      fetchButton.disabled = true;
      cancelFetchButton.disabled = false;
      generateButton.disabled = true;
      reviewActions.hidden = true;
      fetchStatus.textContent = data.progress?.message || "Fetching sources…";
      schedulePoll();
      return;
    }
    fetchButton.disabled = false;
    cancelFetchButton.disabled = data.status === "idle";
    if (data.status === "complete" && data.result) {
      const result = data.result;
      fetchStatus.textContent = "Fetched " + result.fetchedCount + " items; included " +
        result.selectedCount + ", skipped " + result.skippedCount + ", and " +
        result.unresolvedCount + " require review." +
        (result.warning ? " " + result.warning : "");
      renderFetchResult(result);
      setReviewControlsDisabled(false);
      reviewActions.hidden = result.unresolvedCount === 0;
      reviewSummary.textContent = result.unresolvedCount + " item(s) require review.";
      generateButton.disabled = result.itemCount === 0 || result.unresolvedCount > 0;
      generateStatus.textContent = result.unresolvedCount > 0
        ? "Resolve every review item before generating."
        : "";
      return;
    }
    generateButton.disabled = true;
    reviewActions.hidden = true;
    if (data.status === "error") {
      fetchStatus.textContent = data.error || "Fetch failed";
    } else {
      fetchStatus.textContent = "Ready.";
      fetchProgress.hidden = true;
      fetchLog.replaceChildren();
    }
  }

  function renderProgress(data) {
    const progress = data.progress;
    if (progress && progress.total > 0) {
      fetchProgress.hidden = false;
      fetchProgress.max = progress.total;
      fetchProgress.value = progress.completed;
    } else {
      fetchProgress.hidden = true;
    }
    fetchLog.replaceChildren();
    for (const event of data.events || []) {
      const row = document.createElement("li");
      row.textContent = "[" + event.stage + " " + event.completed + "/" + event.total +
        "] " + event.message;
      fetchLog.append(row);
    }
    fetchLog.scrollTop = fetchLog.scrollHeight;
  }

  function renderFetchResult(data) {
    const openSources = new Set(
      Array.from(preview.querySelectorAll("details[data-source][open]"), (details) =>
        details.dataset.source
      ),
    );
    preview.replaceChildren();
    const healthDetails = document.createElement("details");
    const healthSummary = document.createElement("summary");
    healthSummary.textContent = "Feed health";
    const healthList = document.createElement("ul");
    for (const [name, health] of Object.entries(data.health)) {
      const row = document.createElement("li");
      row.textContent = name + ": " + health.status + " — " +
        health.filteredEntries + "/" + health.totalEntries + " items" +
        (health.message ? " (" + health.message + ")" : "");
      healthList.append(row);
    }
    healthDetails.append(healthSummary, healthList);
    preview.append(healthDetails);
    const groups = data.items.reduce((result, item) => {
      (result[item.source] ||= []).push(item);
      return result;
    }, {});
    for (const [source, items] of Object.entries(groups)) {
      const details = document.createElement("details");
      details.dataset.source = source;
      details.open = openSources.has(source);
      const summary = document.createElement("summary");
      const selected = items.filter((item) => item.selected).length;
      const unresolved = items.filter((item) =>
        item.kind === "review" || item.kind === "fallback"
      ).length;
      const skipped = items.length - selected - unresolved;
      summary.textContent = source + " (" + selected + " included, " + skipped +
        " skipped, " + unresolved + " review)";
      const list = document.createElement("ul");
      for (const item of items) {
        const disposition = item.kind === "manual"
          ? (item.selected
            ? { label: "Included", icon: "✓", className: "keep" }
            : { label: "Excluded", icon: "–", className: "skip" })
          : dispositions[item.kind] ||
          (item.selected
            ? { label: "Include", icon: "✓", className: "keep" }
            : { label: "Exclude", icon: "–", className: "skip" });
        const row = document.createElement("li");
        row.className = "decision " + disposition.className;
        const tag = document.createElement("span");
        tag.className = "tag";
        if (disposition.icon) {
          const icon = document.createElement("span");
          icon.className = "tag-icon";
          icon.ariaHidden = "true";
          icon.textContent = disposition.icon;
          tag.append(icon);
        }
        tag.append(disposition.label);
        const link = document.createElement("a");
        link.href = item.link;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = item.title;
        const reason = document.createElement("small");
        reason.textContent = item.reason;
        row.append(tag, link, reason);
        if (item.kind === "review" || item.kind === "fallback") {
          const actions = document.createElement("div");
          actions.className = "decision-actions";
          actions.append(
            reviewButton("Include", item.fingerprint, true),
            reviewButton("Exclude", item.fingerprint, false),
          );
          row.append(actions);
        }
        list.append(row);
      }
      details.append(summary, list);
      preview.append(details);
    }
  }

  function reviewButton(label, fingerprint, selected) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.reviewAction = "";
    button.className = "secondary";
    button.addEventListener("click", () => {
      void resolveReview({ fingerprint, selected });
    });
    return button;
  }

  includeUnresolvedButton.addEventListener("click", () => {
    void resolveReview({ all: true, selected: true });
  });

  excludeUnresolvedButton.addEventListener("click", () => {
    void resolveReview({ all: true, selected: false });
  });

  async function resolveReview(resolution) {
    setReviewControlsDisabled(true);
    generateStatus.textContent = "Saving review decision…";
    try {
      const response = await fetch("/api/fetch/selection", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(resolution),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save review decision");
      renderFetchState(data);
    } catch (error) {
      generateStatus.textContent = error.message;
      setReviewControlsDisabled(false);
    }
  }

  function setReviewControlsDisabled(disabled) {
    for (const button of document.querySelectorAll("[data-review-action]")) {
      button.disabled = disabled;
    }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(refreshFetchState, 600);
  }

  generateButton.addEventListener("click", async () => {
    generateButton.disabled = true;
    let completed = false;
    let generationWarning = "";
    output.textContent = "";
    generateStatus.textContent = "Starting…";
    try {
      const response = await fetch("/api/generate", { method: "POST" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Generation failed");
      }
      await readEvents(response, (event, data) => {
        if (event === "stage") generateStatus.textContent = data.message;
        if (event === "content") output.textContent += data.content;
        if (event === "complete") {
          completed = true;
          generateStatus.textContent = "Saved to " + data.file +
            (generationWarning ? ". " + generationWarning : "");
        }
        if (event === "warning") generationWarning = data.message;
        if (event === "error") throw new Error(data.message);
      });
    } catch (error) {
      generateStatus.textContent = error.message;
    } finally {
      generateButton.disabled = completed;
    }
  });

  void refreshFetchState();

  async function readEvents(response, callback) {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer = (buffer + result.value).replaceAll("\r\n", "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        let event = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data += line.slice(5).trimStart();
        }
        if (data) callback(event, JSON.parse(data));
      }
    }
  }
`;
