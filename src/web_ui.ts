export function homePage(
  configuration: { configured: boolean; issue?: string } = { configured: true },
): string {
  const setupNotice = configuration.configured
    ? ""
    : [
        '<section class="card notice" role="status">',
        "<h2>Finish setting up Distil</h2>",
        `<p>${escapeHtml(configuration.issue ?? "No saved configuration was found.")}</p>`,
        "<p>Choose your research topic, AI provider, and sources before collecting items.</p>",
        '<a class="button-link" href="/settings">Open settings</a>',
        "</section>",
      ].join("\n");
  return page(
    "Distil",
    [
      '<button id="theme" class="theme" aria-label="Toggle theme">◐</button>',
      "<main>",
      brandHeading(),
      '<p class="lede">Turn the sources you trust into a focused research digest.</p>',
      setupNotice,
      '<section class="card">',
      "<h2>Collect</h2>",
      '<label for="days">Days to look back</label>',
      '<div class="row"><input id="days" type="number" min="1" max="30" value="7">',
      '<label class="check"><input id="include-seen" type="checkbox"> Include seen</label>',
      `<button id="fetch"${
        configuration.configured ? "" : " disabled"
      }>Fetch items</button>`,
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
      '<progress id="generate-progress" aria-label="Digest generation in progress" hidden></progress>',
      '<pre id="output" tabindex="0"></pre>',
      "</section>",
      '<nav class="page-links" aria-label="Distil pages"><a href="/settings">Settings</a><a href="/history">View history →</a></nav>',
      "</main>",
    ].join("\n"),
    `const configurationReady = ${configuration.configured};\n${HOME_SCRIPT}`,
  );
}

export function settingsPage(): string {
  return page(
    "Settings · Distil",
    [
      '<button id="theme" class="theme" aria-label="Toggle theme">◐</button>',
      '<main class="settings-main">',
      brandLink(),
      '<div class="page-title"><div><h1>Settings</h1><p class="lede">A few choices are all Distil needs to make focused digests.</p></div><span id="save-state" class="save-state">Loading…</span></div>',
      '<div id="configuration-notice" class="notice inline-notice" role="status" hidden></div>',
      '<form id="settings-form">',
      '<section class="card setup-section" aria-labelledby="focus-heading">',
      '<div class="section-heading"><span class="step">1</span><div><h2 id="focus-heading">What do you want to follow?</h2><p>Describe the subject that should guide each digest.</p></div></div>',
      '<label for="focus">Research focus</label>',
      '<textarea id="focus" rows="3" required placeholder="For example: climate adaptation and resilient cities"></textarea>',
      '<div class="field-grid two">',
      '<label>Reading time <span class="hint">minutes</span><input id="reading-time" type="number" min="1" max="120" value="5" required></label>',
      '<label>CLI digest folder <span class="hint">Web digests use history/</span><input id="output-directory" value="~/distils" required></label>',
      "</div>",
      "</section>",
      '<section class="card setup-section" aria-labelledby="provider-heading">',
      '<div class="section-heading"><span class="step">2</span><div><h2 id="provider-heading">Choose the AI that writes the digest</h2><p>Ollama keeps generation local. Compatible APIs include Mistral and private proxies.</p></div></div>',
      '<label for="provider-mode">Connection</label>',
      '<select id="provider-mode">',
      '<option value="local-ollama">Ollama on this computer</option>',
      '<option value="remote-ollama">Ollama at another address</option>',
      '<option value="openai">OpenAI-compatible API</option>',
      "</select>",
      '<p id="provider-explanation" class="field-help"></p>',
      '<div class="field-grid two">',
      '<label>Model<input id="model" required autocomplete="off"></label>',
      '<label>Base URL<input id="base-url" type="url" required spellcheck="false"></label>',
      "</div>",
      '<label id="api-key-field">API key environment variable <span class="hint">The key itself is never saved</span><input id="api-key-env" autocomplete="off" spellcheck="false" placeholder="MISTRAL_API_KEY"><span id="api-key-status" class="field-help"></span></label>',
      '<details class="advanced"><summary>Advanced model settings</summary>',
      '<div class="field-grid three">',
      '<label>Timeout <span class="hint">seconds</span><input id="llm-timeout" type="number" min="1" value="900" required></label>',
      '<label>Retries<input id="retries" type="number" min="0" max="20" value="2" required></label>',
      '<label>Temperature <span class="hint">optional</span><input id="temperature" type="number" step="0.1" placeholder="Provider default"></label>',
      "</div></details>",
      "</section>",
      '<section class="card setup-section" aria-labelledby="sources-heading">',
      '<div class="section-heading"><span class="step">3</span><div><h2 id="sources-heading">Add sources you trust</h2><p>Use an RSS or Atom feed, a YouTube channel, playlist, or video. Add at least one.</p></div></div>',
      '<div id="sources"></div>',
      '<button id="add-source" class="secondary" type="button">+ Add another source</button>',
      "</section>",
      '<section class="card setup-section optional-section" aria-labelledby="selection-heading">',
      '<div class="section-heading"><span class="step">4</span><div><h2 id="selection-heading">Relevance screening <span class="hint">optional</span></h2><p>A local Strands service can screen every item before generation. Uncertain items still require your review.</p></div></div>',
      '<label class="switch-row"><input id="decision-enabled" type="checkbox"><span><strong>Use Strands Decider</strong><small>Only a loopback service is accepted.</small></span></label>',
      '<div id="decision-fields" class="field-grid three" hidden>',
      '<label>Service URL<input id="decision-url" type="url" value="http://127.0.0.1:8000" required></label>',
      '<label>Confidence <span class="hint">0–1</span><input id="confidence" type="number" min="0" max="1" step="0.01" value="0.9" required></label>',
      '<label>Timeout <span class="hint">seconds</span><input id="decision-timeout" type="number" min="1" value="10" required></label>',
      "</div>",
      "</section>",
      '<div class="save-bar"><div><strong>Ready to save?</strong><span>Settings are validated before config.toml is replaced.</span></div><button id="save" type="submit">Save settings</button></div>',
      '<p id="form-status" class="status form-status" role="status" aria-live="polite"></p>',
      "</form>",
      '<nav class="page-links"><a href="/">← Back to Distil</a><a href="/history">History</a></nav>',
      "</main>",
      '<template id="source-template">',
      '<fieldset class="source-card"><legend>Source</legend>',
      '<div class="source-heading"><strong class="source-number"></strong><button type="button" class="remove-source secondary">Remove</button></div>',
      '<div class="field-grid two"><label>Feed or YouTube URL<input data-field="url" type="url" required spellcheck="false" placeholder="https://example.com/feed.xml"></label><label>Name <span class="hint">optional</span><input data-field="name" placeholder="A clear label"></label></div>',
      '<div class="field-grid three"><label>Kind<select data-field="type"><option value="rss">RSS or Atom</option><option value="youtube">YouTube</option></select></label><label>Item limit<input data-field="maxItems" type="number" min="1" placeholder="No limit"></label><label>Keywords <span class="hint">comma separated</span><input data-field="keywords" placeholder="battery, grid"></label></div>',
      '<details class="advanced"><summary>Advanced source filter</summary><label>Title or summary pattern <span class="hint">regular expression</span><input data-field="pattern" spellcheck="false" placeholder="research|analysis"></label></details>',
      "</fieldset>",
      "</template>",
    ].join("\n"),
    SETTINGS_SCRIPT,
  );
}

export function historyPage(files: string[]): string {
  const list =
    files.length === 0
      ? "<p>No digests yet.</p>"
      : `<ul>${files
          .map(
            (file) =>
              `<li><a href="/history/${encodeURIComponent(file)}">${escapeHtml(file)}</a></li>`,
          )
          .join("")}</ul>`;
  return page(
    "History · Distil",
    [
      "<main>",
      brandLink(),
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
      brandLink(),
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
      brandLink(),
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
    '<meta name="theme-color" content="#2563eb">',
    '<link rel="icon" type="image/png" href="/assets/distil-logo.png">',
    '<link rel="apple-touch-icon" href="/assets/distil-logo.png">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${CSS}</style>`,
    "</head>",
    `<body>${body}${script ? `<script>${script}</script>` : ""}</body>`,
    "</html>",
  ].join("\n");
}

function brandHeading(): string {
  return [
    '<div class="brand brand-heading">',
    '<img class="brand-logo" src="/assets/distil-logo.png" alt="" width="96" height="96">',
    "<h1>Distil</h1>",
    "</div>",
  ].join("");
}

function brandLink(): string {
  return [
    '<a class="brand site-brand" href="/" aria-label="Distil home">',
    '<img class="brand-logo" src="/assets/distil-logo.png" alt="" width="40" height="40">',
    "<span>Distil</span>",
    "</a>",
  ].join("");
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
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
  .brand { display:flex; align-items:center; gap:.85rem; width:max-content;
    color:var(--ink); text-decoration:none; }
  .brand-logo { display:block; width:clamp(4.25rem,12vw,6rem); height:auto; }
  .site-brand { margin-bottom:1.5rem; font-weight:800; font-size:1.15rem; }
  .site-brand .brand-logo { width:2.5rem; }
  .brand-heading h1 { font-family:Inter,"Avenir Next","Segoe UI Variable Display",
    "Segoe UI",Roboto,"Helvetica Neue",Arial,ui-sans-serif,system-ui,sans-serif;
    font-weight:750; font-optical-sizing:auto; letter-spacing:-.06em; }
  h1 { margin:0; font:700 clamp(2.6rem,8vw,5rem)/.95 ui-serif,Georgia,serif;
    letter-spacing:-.045em; } h2 { margin-top:0; font-size:1.05rem; }
  .lede { color:var(--muted); font-size:1.1rem; margin:1rem 0 2rem; }
  .card { border:1px solid var(--line); background:var(--card); border-radius:14px;
    padding:1.25rem; margin:1rem 0; box-shadow:0 8px 28px var(--shadow); }
  .row { display:flex; gap:.75rem; align-items:center; flex-wrap:wrap; }
  label { display:block; color:var(--muted); margin-bottom:.35rem; }
  input,button,select,textarea { font:inherit; border-radius:9px; border:1px solid var(--line);
    padding:.68rem .9rem; } input,select,textarea { background:var(--input); color:var(--ink); }
  input { width:8rem; } textarea { resize:vertical; }
  .check { display:flex; align-items:center; gap:.45rem; margin:0; }
  .check input { width:auto; accent-color:var(--accent); }
  button,.button-link { cursor:pointer; background:var(--accent); color:var(--accent-ink);
    border-color:transparent; font-weight:700; } button:hover:not(:disabled) {
    background:var(--accent-hover); transform:translateY(-1px); }
  .button-link { display:inline-block; border-radius:9px; padding:.68rem .9rem;
    text-decoration:none; }
  button.secondary { background:transparent; color:var(--link); border-color:var(--link); }
  button.secondary:hover:not(:disabled) { background:var(--pre-bg); }
  button:disabled { opacity:.45; cursor:not-allowed; }
  button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,
  a:focus-visible,pre:focus-visible {
    outline:3px solid var(--focus-ring); outline-offset:3px;
    box-shadow:0 0 0 3px var(--focus); }
  .theme { position:fixed; right:1rem; top:1rem; width:2.75rem; padding:.55rem; }
  .status { min-height:1.5rem; color:var(--muted); }
  .notice { border-left:4px solid var(--link); }
  .notice p { color:var(--muted); }
  .page-links { display:flex; align-items:center; justify-content:space-between; gap:1rem;
    margin-top:1.5rem; }
  .settings-main { width:min(940px,calc(100% - 2rem)); }
  .settings-main h1 { font-family:Inter,"Avenir Next","Segoe UI Variable Display",
    "Segoe UI",Roboto,"Helvetica Neue",Arial,ui-sans-serif,system-ui,sans-serif;
    font-size:clamp(2.25rem,7vw,4rem); }
  .page-title { display:flex; justify-content:space-between; align-items:start; gap:1rem; }
  .save-state { margin-top:.5rem; border:1px solid var(--line); border-radius:999px;
    padding:.25rem .7rem; color:var(--muted); font-size:.82rem; white-space:nowrap; }
  .inline-notice { margin:1rem 0; padding:1rem; border:1px solid var(--line);
    border-left:4px solid var(--link); border-radius:10px; color:var(--muted); }
  .setup-section { padding:1.5rem; }
  .section-heading { display:flex; gap:.9rem; align-items:flex-start; margin-bottom:1.25rem; }
  .section-heading h2 { margin:0; font-size:1.2rem; }
  .section-heading p { margin:.2rem 0 0; color:var(--muted); }
  .step { display:grid; place-items:center; flex:0 0 2rem; width:2rem; height:2rem;
    border-radius:999px; background:var(--accent); color:var(--accent-ink); font-weight:800; }
  .settings-main label:not(.check):not(.switch-row) { font-weight:700; color:var(--ink); }
  .settings-main label input,.settings-main label select,.settings-main label textarea,
  .settings-main > form > .card > textarea { display:block; width:100%; margin-top:.35rem;
    font-weight:400; }
  .settings-main > form > .card > textarea { width:100%; }
  .field-grid { display:grid; gap:1rem; margin-top:1rem; }
  .field-grid.two { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .field-grid.three { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .hint { display:block; color:var(--muted); font-weight:400; font-size:.78rem; }
  .field-help { margin:.5rem 0 0; color:var(--muted); font-size:.9rem; }
  .advanced { margin-top:1rem; padding:.75rem 0 0; }
  .advanced summary { color:var(--link); }
  .source-card { min-width:0; margin:0 0 1rem; padding:1rem; border:1px solid var(--line);
    border-radius:11px; }
  .source-card legend { position:absolute; width:1px; height:1px; overflow:hidden;
    clip:rect(0 0 0 0); white-space:nowrap; }
  .source-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .remove-source { padding:.35rem .65rem; font-size:.85rem; }
  .switch-row { display:flex; align-items:flex-start; gap:.55rem; margin:0; color:var(--ink); }
  .switch-row input { flex:0 0 1rem; width:1rem; height:1rem; margin:.25rem 0 0;
    padding:0; accent-color:var(--accent); }
  .switch-row span { min-width:0; }
  .switch-row small { display:block; color:var(--muted); font-weight:400; }
  .save-bar { position:sticky; bottom:1rem; z-index:2; display:flex; align-items:center;
    justify-content:space-between; gap:1rem; margin:1.25rem 0 0; padding:1rem 1.25rem;
    border:1px solid var(--line); border-radius:12px; background:var(--card);
    box-shadow:0 10px 35px var(--shadow); }
  .save-bar span { display:block; color:var(--muted); font-size:.85rem; }
  .form-status { margin:.65rem 0; }
  .form-status.error { color:#ef4444; }
  .form-status.success { color:#22c55e; }
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
  @media (max-width:700px) { .field-grid.two,.field-grid.three { grid-template-columns:1fr; }
    .save-bar { position:static; } }
  @media (max-width:520px) { main { margin:3rem auto; } .card { padding:1rem; }
    .page-title { display:block; } .save-state { display:inline-block; margin-bottom:1rem; }
    .save-bar { align-items:stretch; flex-direction:column; } .save-bar button { width:100%; } }
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
  const generateProgress = document.querySelector("#generate-progress");
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
    fetchButton.disabled = !configurationReady;
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
      fetchStatus.textContent = configurationReady
        ? "Ready."
        : "Complete setup in Settings before collecting sources.";
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
    generateProgress.removeAttribute("value");
    generateProgress.hidden = false;
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
      generateProgress.hidden = true;
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

const SETTINGS_SCRIPT = String.raw`
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("distil-theme") || "dark";
  root.dataset.theme = savedTheme;
  document.querySelector("#theme").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("distil-theme", root.dataset.theme);
  });

  const form = document.querySelector("#settings-form");
  const formStatus = document.querySelector("#form-status");
  const saveButton = document.querySelector("#save");
  const saveState = document.querySelector("#save-state");
  const notice = document.querySelector("#configuration-notice");
  const sourceList = document.querySelector("#sources");
  const sourceTemplate = document.querySelector("#source-template");
  const providerMode = document.querySelector("#provider-mode");
  const providerExplanation = document.querySelector("#provider-explanation");
  const apiKeyField = document.querySelector("#api-key-field");
  const apiKeyInput = document.querySelector("#api-key-env");
  const apiKeyStatus = document.querySelector("#api-key-status");
  const decisionEnabled = document.querySelector("#decision-enabled");
  const decisionFields = document.querySelector("#decision-fields");
  let apiKeyAvailable = false;

  document.querySelector("#add-source").addEventListener("click", () => addSource());
  providerMode.addEventListener("change", () => updateProvider(true));
  decisionEnabled.addEventListener("change", updateDecision);

  function addSource(feed = {}) {
    const card = sourceTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector('[data-field="url"]').value = feed.url || "";
    card.querySelector('[data-field="name"]').value = feed.name || "";
    card.querySelector('[data-field="type"]').value = feed.type || "rss";
    card.querySelector('[data-field="maxItems"]').value = feed.maxItems || "";
    card.querySelector('[data-field="keywords"]').value = (feed.keywords || []).join(", ");
    card.querySelector('[data-field="pattern"]').value = feed.pattern || "";
    card.querySelector(".remove-source").addEventListener("click", () => {
      card.remove();
      numberSources();
    });
    const urlInput = card.querySelector('[data-field="url"]');
    urlInput.addEventListener("change", () => {
      try {
        const hostname = new URL(urlInput.value).hostname.toLowerCase();
        if (hostname === "youtu.be" || hostname === "youtube.com" ||
          hostname.endsWith(".youtube.com")) {
          card.querySelector('[data-field="type"]').value = "youtube";
        }
      } catch {
        // Native form validation explains malformed URLs when the user saves.
      }
    });
    sourceList.append(card);
    numberSources();
  }

  function numberSources() {
    const cards = Array.from(sourceList.querySelectorAll(".source-card"));
    cards.forEach((card, index) => {
      const label = "Source " + (index + 1);
      card.querySelector("legend").textContent = label;
      card.querySelector(".source-number").textContent = label;
      card.querySelector(".remove-source").disabled = cards.length === 1;
    });
  }

  function updateProvider(changedByUser) {
    const mode = providerMode.value;
    const baseUrl = document.querySelector("#base-url");
    const model = document.querySelector("#model");
    if (changedByUser && mode === "local-ollama") {
      baseUrl.value = "http://127.0.0.1:11434/v1";
      if (!model.value || model.value.startsWith("mistral-")) model.value = "qwen2.5:3b";
    }
    if (changedByUser && mode === "openai") {
      if (!baseUrl.value || baseUrl.value.includes(":11434")) {
        baseUrl.value = "https://api.mistral.ai/v1";
      }
      if (!model.value || model.value.startsWith("qwen")) {
        model.value = "mistral-small-latest";
      }
      if (!apiKeyInput.value && baseUrl.value.includes("api.mistral.ai")) {
        apiKeyInput.value = "MISTRAL_API_KEY";
      }
    }
    apiKeyField.hidden = mode !== "openai";
    apiKeyInput.disabled = mode !== "openai";
    providerExplanation.textContent = mode === "local-ollama"
      ? "Distil verifies Ollama and can start it or download the model when needed."
      : mode === "remote-ollama"
      ? "Distil only contacts this address and will never run local Ollama commands."
      : "Distil uses the standard chat-completions protocol. Leave the key variable blank for a trusted local service.";
    updateApiKeyStatus();
  }

  function updateApiKeyStatus() {
    if (providerMode.value !== "openai") {
      apiKeyStatus.textContent = "";
    } else if (!apiKeyInput.value.trim()) {
      apiKeyStatus.textContent = "No API key will be sent.";
    } else {
      apiKeyStatus.textContent = apiKeyAvailable
        ? "This variable is available to Distil."
        : "Set this variable before starting Distil. The secret is not entered here.";
    }
  }
  apiKeyInput.addEventListener("input", () => {
    apiKeyAvailable = false;
    updateApiKeyStatus();
  });

  function updateDecision() {
    decisionFields.hidden = !decisionEnabled.checked;
    for (const input of decisionFields.querySelectorAll("input")) {
      input.disabled = !decisionEnabled.checked;
    }
  }

  async function loadConfiguration() {
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load settings");
      apiKeyAvailable = data.apiKeyAvailable;
      fillForm(data.config);
      saveState.textContent = data.configured ? "Saved" : "Setup needed";
      if (data.issue) {
        notice.hidden = false;
        notice.textContent = data.issue + " You can repair it here and save a valid configuration.";
      }
    } catch (error) {
      showStatus(error.message, "error");
      saveState.textContent = "Unavailable";
      saveButton.disabled = true;
    }
  }

  function fillForm(config) {
    document.querySelector("#focus").value = config.domain.focus;
    document.querySelector("#reading-time").value = config.output.readingTimeMinutes;
    document.querySelector("#output-directory").value = config.output.directory;
    providerMode.value = config.llm.provider === "openai"
      ? "openai"
      : config.llm.manageLocal
      ? "local-ollama"
      : "remote-ollama";
    document.querySelector("#model").value = config.llm.model;
    document.querySelector("#base-url").value = config.llm.baseUrl;
    apiKeyInput.value = config.llm.apiKeyEnv || "";
    document.querySelector("#llm-timeout").value = config.llm.timeoutSeconds;
    document.querySelector("#retries").value = config.llm.retries;
    document.querySelector("#temperature").value = config.llm.temperature ?? "";
    decisionEnabled.checked = config.decision.enabled;
    document.querySelector("#decision-url").value = config.decision.baseUrl;
    document.querySelector("#confidence").value = config.decision.confidenceThreshold;
    document.querySelector("#decision-timeout").value = config.decision.timeoutSeconds;
    sourceList.replaceChildren();
    for (const feed of config.feeds) addSource(feed);
    if (config.feeds.length === 0) addSource();
    updateProvider(false);
    updateDecision();
  }

  function formConfiguration() {
    const openai = providerMode.value === "openai";
    const temperature = document.querySelector("#temperature").value.trim();
    const feeds = Array.from(sourceList.querySelectorAll(".source-card"), (card) => {
      const maxItems = card.querySelector('[data-field="maxItems"]').value.trim();
      return {
        url: card.querySelector('[data-field="url"]').value.trim(),
        name: card.querySelector('[data-field="name"]').value.trim(),
        type: card.querySelector('[data-field="type"]').value,
        ...(maxItems ? { maxItems: Number(maxItems) } : {}),
        keywords: card.querySelector('[data-field="keywords"]').value.split(",")
          .map((value) => value.trim()).filter(Boolean),
        pattern: card.querySelector('[data-field="pattern"]').value.trim(),
      };
    });
    return {
      llm: {
        provider: openai ? "openai" : "ollama",
        model: document.querySelector("#model").value.trim(),
        baseUrl: document.querySelector("#base-url").value.trim(),
        manageLocal: providerMode.value === "local-ollama",
        apiKeyEnv: openai ? apiKeyInput.value.trim() : "",
        timeoutSeconds: Number(document.querySelector("#llm-timeout").value),
        retries: Number(document.querySelector("#retries").value),
        ...(temperature ? { temperature: Number(temperature) } : {}),
      },
      decision: {
        enabled: decisionEnabled.checked,
        baseUrl: document.querySelector("#decision-url").value.trim(),
        confidenceThreshold: Number(document.querySelector("#confidence").value),
        timeoutSeconds: Number(document.querySelector("#decision-timeout").value),
      },
      output: {
        directory: document.querySelector("#output-directory").value.trim(),
        readingTimeMinutes: Number(document.querySelector("#reading-time").value),
      },
      domain: { focus: document.querySelector("#focus").value.trim() },
      feeds,
    };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formStatus.textContent = "";
    formStatus.className = "status form-status";
    if (!form.reportValidity()) return;
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    saveState.textContent = "Saving";
    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: formConfiguration() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save settings");
      apiKeyAvailable = data.apiKeyAvailable;
      fillForm(data.config);
      notice.hidden = true;
      saveState.textContent = "Saved";
      showStatus("Settings saved and now in use. You can return to Distil and fetch items.", "success");
    } catch (error) {
      saveState.textContent = "Not saved";
      showStatus(error.message, "error");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save settings";
    }
  });

  function showStatus(message, kind) {
    formStatus.textContent = message;
    formStatus.className = "status form-status " + kind;
  }

  void loadConfiguration();
`;
