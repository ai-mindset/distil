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
      '<main id="main-content" class="home-main">',
      '<header class="hero">',
      '<p class="eyebrow">Personal research digest</p>',
      "<h1>Distil</h1>",
      '<p class="lede">Turn the sources you trust into a focused research digest.</p>',
      "</header>",
      setupNotice,
      '<nav class="workflow" aria-label="Digest workflow">',
      "<ol>",
      `<li id="workflow-collect" class="workflow-step current"><a href="#collect-panel" aria-current="step"><span class="step-marker" data-step-number="1" aria-hidden="true">1</span><span><strong>Collect</strong><small id="workflow-collect-state">${
        configuration.configured ? "Ready" : "Setup required"
      }</small></span></a></li>`,
      '<li id="workflow-review" class="workflow-step blocked"><a href="#review-panel"><span class="step-marker" data-step-number="2" aria-hidden="true">2</span><span><strong>Review</strong><small id="workflow-review-state">Waiting for collection</small></span></a></li>',
      '<li id="workflow-generate" class="workflow-step blocked"><a href="#generate-panel"><span class="step-marker" data-step-number="3" aria-hidden="true">3</span><span><strong>Generate</strong><small id="workflow-generate-state">Waiting for review</small></span></a></li>',
      "</ol>",
      "</nav>",
      '<section id="collect-panel" class="card workflow-panel" aria-labelledby="collect-heading">',
      '<div class="card-heading"><div><p class="kicker">Step 1</p><h2 id="collect-heading">Collect recent items</h2><p>Choose a time range, then gather items from every configured source.</p></div></div>',
      '<label for="days">Days to look back</label>',
      '<div class="row collect-controls"><input id="days" type="number" min="1" max="30" value="7">',
      '<label class="check"><input id="include-seen" type="checkbox"> Include seen</label>',
      `<button id="fetch-items" type="button"${
        configuration.configured ? "" : " disabled"
      }>Fetch items</button>`,
      '<button id="cancel-fetch" class="secondary" disabled>Stop and reset</button></div>',
      '<p id="fetch-status" class="status" role="status" aria-live="polite" aria-atomic="true"></p>',
      '<progress id="fetch-progress" aria-label="Source collection progress" hidden></progress>',
      '<ol id="fetch-log" class="progress-log" aria-label="Collection activity"></ol>',
      "</section>",
      '<section id="review-panel" class="card workflow-panel" aria-labelledby="review-heading">',
      '<div class="card-heading"><div><p class="kicker">Step 2</p><h2 id="review-heading">Review the selection</h2><p>Check what will shape the digest and resolve any uncertain items.</p></div></div>',
      '<p id="review-status" class="section-status" role="status" aria-live="polite" aria-atomic="true">Collect items to begin reviewing.</p>',
      '<div id="review-actions" class="review-actions row" hidden>',
      '<strong id="review-summary"></strong>',
      '<button id="include-unresolved" type="button" class="secondary" data-review-action>Include all</button>',
      '<button id="exclude-unresolved" type="button" class="secondary" data-review-action>Exclude all</button>',
      "</div>",
      '<div id="preview"></div>',
      "</section>",
      '<section id="generate-panel" class="card workflow-panel" aria-labelledby="generate-heading">',
      '<div class="card-heading"><div><p class="kicker">Step 3</p><h2 id="generate-heading">Generate the digest</h2><p>Create and save one focused Markdown digest from the included items.</p></div></div>',
      '<button id="generate" disabled>Generate digest</button>',
      '<p id="generate-status" class="status" role="status" aria-live="polite" aria-atomic="true"></p>',
      '<progress id="generate-progress" aria-label="Digest generation in progress" hidden></progress>',
      '<pre id="output" class="stream-output" tabindex="0" aria-label="Generated digest"></pre>',
      "</section>",
      "</main>",
    ].join("\n"),
    `const configurationReady = ${configuration.configured};\n${HOME_SCRIPT}`,
    "home",
  );
}

export function settingsPage(): string {
  return page(
    "Settings · Distil",
    [
      '<main id="main-content" class="settings-main">',
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
      '<label>Service URL <span class="hint">loopback only</span><input id="decision-url" type="url" value="http://127.0.0.1:8000" required></label>',
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
    "settings",
  );
}

export function historyPage(files: string[]): string {
  const list =
    files.length === 0
      ? '<div class="empty-state"><h2>No digests yet</h2><p>Generate a digest and it will appear here.</p><a class="button-link" href="/">Create a digest</a></div>'
      : `<ol class="history-list">${files
          .map((file) => {
            const label = digestLabel(file);
            return [
              "<li>",
              `<a class="history-card" href="/history/${encodeURIComponent(file)}">`,
              '<span class="history-icon" aria-hidden="true">→</span>',
              "<span>",
              `<strong>${escapeHtml(label.title)}</strong>`,
              label.iso
                ? `<time datetime="${label.iso}">${escapeHtml(label.subtitle)}</time>`
                : `<span>${escapeHtml(label.subtitle)}</span>`,
              `<code>${escapeHtml(file)}</code>`,
              "</span>",
              "</a>",
              "</li>",
            ].join("");
          })
          .join("")}</ol>`;
  return page(
    "History · Distil",
    [
      '<main id="main-content" class="history-main">',
      '<p class="eyebrow">Saved research</p>',
      "<h1>History</h1>",
      '<p class="lede">Read the digests Distil has generated on this computer.</p>',
      list,
      "</main>",
    ].join("\n"),
    "",
    "history",
  );
}

export function viewPage(filename: string, content: string): string {
  const label = digestLabel(filename);
  return page(
    `${filename} · Distil`,
    [
      '<main id="main-content" class="reader-main">',
      '<a class="back-link" href="/history">← Back to history</a>',
      '<header class="reader-heading">',
      '<p class="eyebrow">Research digest</p>',
      `<h1>${escapeHtml(label.title)}</h1>`,
      label.iso
        ? `<p><time datetime="${label.iso}">${escapeHtml(label.subtitle)}</time></p>`
        : `<p>${escapeHtml(filename)}</p>`,
      "</header>",
      `<article class="digest">${renderDigestMarkdown(content)}</article>`,
      '<details class="raw-markdown"><summary>View raw Markdown</summary>',
      `<pre tabindex="0"><code>${escapeHtml(content)}</code></pre>`,
      "</details>",
      "</main>",
    ].join("\n"),
    "",
    "history",
  );
}

export function notFoundPage(): string {
  return page(
    "Not found · Distil",
    [
      '<main id="main-content">',
      "<h1>Not found</h1>",
      "<p>The requested page does not exist.</p>",
      '<a href="/">← Back</a>',
      "</main>",
    ].join("\n"),
  );
}

type PageName = "home" | "settings" | "history";

function page(title: string, body: string, script = "", current?: PageName): string {
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
    "<body>",
    '<a class="skip-link" href="#main-content">Skip to main content</a>',
    siteHeader(current),
    body,
    `<script>${THEME_SCRIPT}</script>`,
    script ? `<script>${script}</script>` : "",
    "</body>",
    "</html>",
  ].join("\n");
}

function siteHeader(current?: PageName): string {
  return [
    '<header class="site-header"><div class="site-header-inner">',
    brandLink(),
    '<nav class="site-nav" aria-label="Primary">',
    navLink("/", "Home", current === "home"),
    navLink("/settings", "Settings", current === "settings"),
    navLink("/history", "History", current === "history"),
    "</nav>",
    '<button id="theme" class="theme" type="button" aria-label="Dark theme" aria-pressed="true" title="Use light theme"><span class="theme-icon" aria-hidden="true">☀</span></button>',
    "</div></header>",
  ].join("");
}

function navLink(href: string, label: string, current: boolean): string {
  return `<a href="${href}"${current ? ' aria-current="page"' : ""}>${label}</a>`;
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

function digestLabel(filename: string): {
  title: string;
  subtitle: string;
  iso?: string;
} {
  const match = filename.match(
    /^distil-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})Z(?:-(\d+))?\.md$/,
  );
  if (!match) return { title: "Research digest", subtitle: filename };
  const [, year, month, day, hour, minute, second, copy] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const parsed = new Date(iso);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== `${iso.slice(0, -1)}.000Z`
  ) {
    return { title: "Research digest", subtitle: filename };
  }
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const date = `${months[Number(month) - 1]} ${Number(day)}, ${year}`;
  return {
    title: `Digest from ${date}${copy ? ` (${copy})` : ""}`,
    subtitle: `${date} at ${hour}:${minute} UTC`,
    iso,
  };
}

function renderDigestMarkdown(markdown: string): string {
  const output: string[] = [];
  let paragraph: string[] = [];
  let list: { type: "ol" | "ul"; items: string[] } | undefined;
  let code: string[] | undefined;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    output.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (!list) return;
    output.push(
      `<${list.type}>${list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${list.type}>`,
    );
    list = undefined;
  };
  const flushText = (): void => {
    flushParagraph();
    flushList();
  };

  for (const line of markdown
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")) {
    if (code) {
      if (/^\s*```/.test(line)) {
        output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = undefined;
      } else {
        code.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushText();
      code = [];
      continue;
    }
    if (line.trim() === "") {
      flushText();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushText();
      const level = Math.min(heading[1].length + 1, 6);
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const type = ordered ? "ol" : "ul";
      if (list?.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push((ordered ?? unordered)![1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushText();
  if (code) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  return output.join("\n");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1<span class="sr-only"> (opens in a new tab)</span></a>',
    );
}

const CSS = String.raw`
  :root { color-scheme:light; --blue-700:#1d4ed8; --blue-600:#2563eb;
    --blue-500:#3b82f6; --blue-400:#60a5fa; --bg:#f8fafc; --ink:#172033;
    --card:#fff; --input:#fff; --subtle:#f1f5f9; --muted:#526078; --line:#cbd5e1;
    --accent:var(--blue-600); --accent-hover:var(--blue-700); --accent-ink:#fff;
    --link:#1d4ed8; --success:#15803d; --danger:#b91c1c; --focus:#fbbf24;
    --focus-ring:#172033; --pre-bg:#f1f5f9; --pre-ink:#172033;
    --shadow:0 14px 36px #0f172a12; }
  :root[data-theme="dark"] { color-scheme:dark; --bg:#0f172a; --ink:#f8fafc;
    --card:#1e293b; --input:#334155; --subtle:#172033; --muted:#cbd5e1;
    --line:#475569; --accent:var(--blue-600); --accent-hover:var(--blue-500);
    --accent-ink:#fff; --link:#93c5fd; --success:#86efac; --danger:#fca5a5;
    --focus:#fbbf24; --focus-ring:#fff; --pre-bg:#111827; --pre-ink:#e2e8f0;
    --shadow:0 18px 44px #0006; }
  * { box-sizing:border-box; }
  [hidden] { display:none!important; }
  html { scroll-padding-top:6rem; }
  body { min-height:100vh; margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  a { color:var(--link); text-decoration-thickness:.1em; text-underline-offset:.18em; }
  main { width:min(820px,calc(100% - 2rem)); margin:3.5rem auto 5rem; }
  h1 { margin:0; font:700 clamp(2.65rem,8vw,5rem)/1 ui-serif,Georgia,serif;
    letter-spacing:-.045em; }
  h2,h3 { line-height:1.25; }
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px;
    overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  .skip-link { position:fixed; z-index:100; top:.75rem; left:.75rem; padding:.7rem 1rem;
    border-radius:9px; background:var(--ink); color:var(--bg); font-weight:800;
    transform:translateY(-180%); }
  .skip-link:focus { transform:translateY(0); }
  .site-header { position:sticky; z-index:10; top:0; border-bottom:1px solid var(--line);
    background:var(--card); box-shadow:0 2px 14px #0f172a0a; }
  .site-header-inner { display:flex; align-items:center; gap:1rem;
    width:min(1040px,calc(100% - 2rem)); min-height:4.5rem; margin:auto; }
  .brand { display:flex; align-items:center; gap:.65rem; width:max-content;
    color:var(--ink); text-decoration:none; }
  .brand-logo { display:block; width:2.25rem; height:2.25rem; }
  .site-brand { font-size:1.1rem; font-weight:850; letter-spacing:-.02em; }
  .site-nav { display:flex; align-items:center; gap:.2rem; margin-left:auto; }
  .site-nav a { display:flex; align-items:center; min-height:2.75rem; padding:.5rem .7rem;
    border-radius:8px; color:var(--muted);
    font-size:.94rem; font-weight:700; text-decoration:none; }
  .site-nav a[aria-current="page"] { background:var(--subtle); color:var(--ink); }
  .theme { display:grid; place-items:center; flex:0 0 2.75rem; width:2.75rem;
    height:2.75rem; padding:0; background:transparent; color:var(--ink);
    border-color:var(--line); }
  .theme:hover:not(:disabled) { background:var(--subtle); }
  .theme-icon { font-size:1.1rem; line-height:1; }
  .hero { margin-bottom:2rem; }
  .eyebrow,.kicker { margin:0 0 .45rem; color:var(--link); font-size:.78rem;
    font-weight:850; letter-spacing:.1em; text-transform:uppercase; }
  .lede { max-width:44rem; margin:.8rem 0 2rem; color:var(--muted); font-size:1.12rem; }
  .card { margin:1rem 0; padding:1.5rem; border:1px solid var(--line);
    border-radius:16px; background:var(--card); box-shadow:var(--shadow); }
  .card-heading { display:flex; align-items:start; justify-content:space-between; gap:1rem;
    margin-bottom:1.25rem; }
  .card-heading h2 { margin:0; font-size:1.35rem; }
  .card-heading p:last-child { max-width:40rem; margin:.25rem 0 0; color:var(--muted); }
  .row { display:flex; align-items:center; flex-wrap:wrap; gap:.75rem; }
  label { display:block; margin-bottom:.35rem; color:var(--muted); }
  input,button,select,textarea { min-height:2.75rem; padding:.62rem .85rem;
    border:1px solid var(--line); border-radius:9px; font:inherit; }
  input,select,textarea { background:var(--input); color:var(--ink); }
  input { width:8rem; }
  textarea { resize:vertical; }
  .check { display:flex; align-items:center; gap:.5rem; min-height:2.75rem; margin:0; }
  .check input { width:1.1rem; min-height:1.1rem; padding:0; accent-color:var(--accent); }
  button,.button-link { border-color:transparent; background:var(--accent);
    color:var(--accent-ink); cursor:pointer; font-weight:750; }
  .button-link { display:inline-block; min-height:2.75rem; padding:.62rem .9rem;
    border-radius:9px; text-decoration:none; }
  button:hover:not(:disabled),.button-link:hover { background:var(--accent-hover); }
  button.secondary { border-color:var(--link); background:transparent; color:var(--link); }
  button.secondary:hover:not(:disabled) { background:var(--subtle); }
  button:disabled { opacity:.48; cursor:not-allowed; }
  button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,
  a:focus-visible,pre:focus-visible,summary:focus-visible {
    outline:3px solid var(--focus-ring); outline-offset:3px;
    box-shadow:0 0 0 3px var(--focus); }
  .notice { border-left:4px solid var(--link); }
  .notice p,.section-status { color:var(--muted); }
  .status { min-height:1.5rem; color:var(--muted); }
  .workflow { margin:0 0 1.5rem; }
  .workflow ol { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.65rem;
    margin:0; padding:0; list-style:none; }
  .workflow-step a { display:flex; align-items:center; gap:.7rem; min-height:4.25rem;
    padding:.7rem; border:1px solid var(--line); border-radius:12px; background:var(--card);
    color:var(--ink); text-decoration:none; }
  .workflow-step small { display:block; color:var(--muted); font-size:.76rem;
    line-height:1.3; }
  .step-marker { display:grid; place-items:center; flex:0 0 2rem; width:2rem; height:2rem;
    border:1px solid var(--line); border-radius:50%; color:var(--muted); font-weight:850; }
  .workflow-step.current a { border-color:var(--accent); box-shadow:inset 0 0 0 1px var(--accent); }
  .workflow-step.current .step-marker { border-color:var(--accent); background:var(--accent);
    color:var(--accent-ink); }
  .workflow-step.complete .step-marker { border-color:var(--success); color:var(--success); }
  .workflow-step.blocked a { background:var(--subtle); }
  .workflow-panel { scroll-margin-top:6rem; }
  .collect-controls { align-items:end; }
  progress { width:100%; height:.65rem; accent-color:var(--accent); }
  .progress-log { max-height:10rem; overflow:auto; margin:.65rem 0 0;
    padding-left:1.5rem; color:var(--muted); font-size:.9rem; }
  .review-actions { padding:.85rem; margin:.75rem 0 1rem; border:1px solid var(--line);
    border-radius:10px; background:var(--subtle); }
  .review-actions strong { margin-right:auto; }
  #preview > details { margin-top:.75rem; border:1px solid var(--line);
    border-radius:11px; background:var(--subtle); }
  #preview > details > summary { padding:.85rem 1rem; }
  .source-summary { display:flex; align-items:center; justify-content:space-between;
    gap:1rem; }
  .source-counts { color:var(--muted); font-size:.83rem; font-weight:600; }
  .decision-list { display:grid; gap:.65rem; margin:0; padding:0 .75rem .75rem;
    list-style:none; }
  .decision { display:grid; grid-template-columns:auto minmax(0,1fr); gap:.7rem 1rem;
    margin:0; padding:1rem; border:1px solid var(--line); border-radius:10px;
    background:var(--card); }
  .decision-content { min-width:0; }
  .decision-title { font-weight:750; overflow-wrap:anywhere; }
  .decision-meta,.decision-reason { display:block; margin:.25rem 0 0; color:var(--muted);
    font-size:.88rem; }
  .decision-actions { display:flex; flex-wrap:wrap; gap:.5rem; grid-column:2; }
  .decision-actions button { min-height:2.75rem; padding:.5rem .8rem; font-size:.9rem; }
  .tag { display:inline-flex; align-items:center; justify-content:center; align-self:start;
    gap:.3rem; min-width:6.25rem; padding:.2rem .55rem; border:1px solid var(--line);
    border-radius:999px; color:var(--muted); font-size:.72rem; font-weight:850;
    letter-spacing:.04em; text-transform:uppercase; }
  .keep .tag { border-color:var(--accent); background:var(--accent); color:var(--accent-ink); }
  .review .tag,.fallback .tag { border-color:var(--link); border-style:dashed;
    color:var(--link); }
  .skip .tag { border-color:var(--muted); color:var(--muted); }
  .tag-icon { font-size:1rem; line-height:1; }
  details { border-top:1px solid var(--line); padding:.6rem 0; }
  summary { cursor:pointer; font-weight:750; }
  ul { padding-left:1.3rem; }
  pre { padding:1rem; border:1px solid var(--line); border-radius:10px;
    background:var(--pre-bg); color:var(--pre-ink); white-space:pre-wrap;
    overflow-wrap:anywhere; }
  pre:empty { display:none; }
  .stream-output { max-height:none; overflow:visible; }
  .settings-main { width:min(940px,calc(100% - 2rem)); }
  .settings-main h1 { font-family:Inter,"Avenir Next","Segoe UI Variable Display",
    "Segoe UI",Roboto,"Helvetica Neue",Arial,ui-sans-serif,system-ui,sans-serif;
    font-size:clamp(2.25rem,7vw,4rem); }
  .page-title { display:flex; align-items:start; justify-content:space-between; gap:1rem; }
  .save-state { margin-top:.5rem; padding:.25rem .7rem; border:1px solid var(--line);
    border-radius:999px; color:var(--muted); font-size:.82rem; white-space:nowrap; }
  .inline-notice { margin:1rem 0; padding:1rem; border:1px solid var(--line);
    border-left:4px solid var(--link); border-radius:10px; color:var(--muted); }
  .setup-section { padding:1.5rem; }
  .section-heading { display:flex; align-items:flex-start; gap:.9rem; margin-bottom:1.25rem; }
  .section-heading h2 { margin:0; font-size:1.2rem; }
  .section-heading p { margin:.2rem 0 0; color:var(--muted); }
  .step { display:grid; place-items:center; flex:0 0 2rem; width:2rem; height:2rem;
    border-radius:50%; background:var(--accent); color:var(--accent-ink); font-weight:850; }
  .settings-main label:not(.check):not(.switch-row) { color:var(--ink); font-weight:750; }
  .settings-main label input,.settings-main label select,.settings-main label textarea,
  .settings-main > form > .card > textarea { display:block; width:100%; margin-top:.35rem;
    font-weight:400; }
  .field-grid { display:grid; gap:1rem; margin-top:1rem; }
  .field-grid.two { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .field-grid.three { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .hint { display:block; color:var(--muted); font-size:.78rem; font-weight:400; }
  .field-help { margin:.5rem 0 0; color:var(--muted); font-size:.9rem; }
  .advanced { margin-top:1rem; padding:.75rem 0 0; }
  .advanced summary { color:var(--link); }
  .source-card { min-width:0; margin:0 0 1rem; padding:1rem; border:1px solid var(--line);
    border-radius:11px; }
  .source-card legend { position:absolute; width:1px; height:1px; overflow:hidden;
    clip:rect(0 0 0 0); white-space:nowrap; }
  .source-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .remove-source { min-height:2.5rem; padding:.35rem .65rem; font-size:.85rem; }
  .switch-row { display:flex; align-items:flex-start; gap:.55rem; margin:0; color:var(--ink); }
  .switch-row input { flex:0 0 1rem; width:1rem; height:1rem; min-height:1rem;
    margin:.25rem 0 0; padding:0; accent-color:var(--accent); }
  .switch-row span { min-width:0; }
  .switch-row small { display:block; color:var(--muted); font-weight:400; }
  .save-bar { position:sticky; z-index:2; bottom:1rem; display:flex; align-items:center;
    justify-content:space-between; gap:1rem; margin:1.25rem 0 0; padding:1rem 1.25rem;
    border:1px solid var(--line); border-radius:12px; background:var(--card);
    box-shadow:var(--shadow); }
  .save-bar span { display:block; color:var(--muted); font-size:.85rem; }
  .form-status { margin:.65rem 0; }
  .form-status.error { color:var(--danger); }
  .form-status.success { color:var(--success); }
  .page-links { display:flex; align-items:center; justify-content:space-between; gap:1rem;
    margin-top:1.5rem; }
  .history-main { width:min(760px,calc(100% - 2rem)); }
  .history-list { display:grid; gap:.75rem; margin:0; padding:0; list-style:none; }
  .history-card { display:flex; align-items:start; gap:1rem; padding:1rem 1.1rem;
    border:1px solid var(--line); border-radius:12px; background:var(--card); color:var(--ink);
    box-shadow:0 7px 20px #0f172a0a; text-decoration:none; }
  .history-card:hover { border-color:var(--accent); }
  .history-card > span:last-child { min-width:0; }
  .history-card strong,.history-card time,.history-card code { display:block; }
  .history-card time,.history-card > span > span { color:var(--muted); font-size:.9rem; }
  .history-card code { margin-top:.25rem; color:var(--muted); font-size:.76rem;
    overflow-wrap:anywhere; }
  .history-icon { color:var(--link); font-size:1.25rem; }
  .empty-state { padding:2rem; border:1px dashed var(--line); border-radius:14px;
    background:var(--card); text-align:center; }
  .empty-state h2 { margin-top:0; }
  .empty-state p { color:var(--muted); }
  .reader-main { width:min(760px,calc(100% - 2rem)); }
  .back-link { display:inline-block; margin-bottom:2rem; }
  .reader-heading { padding-bottom:1.5rem; border-bottom:1px solid var(--line); }
  .reader-heading h1 { font-size:clamp(2.1rem,7vw,4.25rem); }
  .reader-heading p:last-child { margin:.7rem 0 0; color:var(--muted); }
  .digest { padding:1.25rem 0 2rem; font-size:1.05rem; }
  .digest h2 { margin:2.3rem 0 .75rem; font-size:1.75rem; }
  .digest h3 { margin:1.8rem 0 .65rem; font-size:1.35rem; }
  .digest h4,.digest h5,.digest h6 { margin:1.5rem 0 .5rem; font-size:1.1rem; }
  .digest p,.digest li { max-width:70ch; }
  .digest li + li { margin-top:.45rem; }
  .digest code { padding:.12rem .28rem; border-radius:4px; background:var(--subtle); }
  .digest pre code { padding:0; background:transparent; }
  .raw-markdown { margin-top:1rem; }
  .raw-markdown pre { max-height:28rem; overflow:auto; }
  @media (prefers-reduced-motion:no-preference) {
    button,.button-link,.history-card,.skip-link { transition:background-color .15s ease,
      border-color .15s ease,transform .15s ease; }
    button:hover:not(:disabled),.button-link:hover { transform:translateY(-1px); }
  }
  @media (max-width:700px) {
    .field-grid.two,.field-grid.three { grid-template-columns:1fr; }
    .workflow ol { grid-template-columns:1fr; }
    .save-bar { position:static; }
  }
  @media (max-width:520px) {
    .site-header-inner { align-items:center; flex-wrap:wrap; gap:.35rem .75rem;
      padding:.55rem 0; }
    .site-nav { order:3; width:100%; margin:0; }
    .site-nav a { flex:1; text-align:center; }
    .theme { margin-left:auto; }
    main { margin:2.5rem auto 4rem; }
    .card { padding:1rem; }
    .collect-controls > input { width:100%; }
    .collect-controls > button { flex:1 1 auto; }
    .decision { grid-template-columns:1fr; }
    .decision-actions { grid-column:1; }
    .tag { min-width:0; width:max-content; }
    .source-summary { align-items:start; flex-direction:column; gap:.2rem; }
    .page-title { display:block; }
    .save-state { display:inline-block; margin-bottom:1rem; }
    .save-bar { align-items:stretch; flex-direction:column; }
    .save-bar button { width:100%; }
  }
`;

const THEME_SCRIPT = String.raw`
  (() => {
    const root = document.documentElement;
    const button = document.querySelector("#theme");
    const icon = button.querySelector(".theme-icon");
    let savedTheme;
    try {
      savedTheme = localStorage.getItem("distil-theme");
    } catch {
      // Theme preference storage can be unavailable in privacy-restricted browsers.
    }
    const systemTheme = typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

    function applyTheme(theme) {
      root.dataset.theme = theme;
      const dark = theme === "dark";
      button.setAttribute("aria-pressed", String(dark));
      button.title = dark ? "Use light theme" : "Use dark theme";
      icon.textContent = dark ? "☀" : "☾";
    }

    applyTheme(savedTheme === "dark" || savedTheme === "light" ? savedTheme : systemTheme);
    button.addEventListener("click", () => {
      const theme = root.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      try {
        localStorage.setItem("distil-theme", theme);
      } catch {
        // The active page still changes theme when preference storage is unavailable.
      }
    });
  })();
`;

const HOME_SCRIPT = String.raw`
  const fetchButton = document.querySelector("#fetch-items");
  const cancelFetchButton = document.querySelector("#cancel-fetch");
  const generateButton = document.querySelector("#generate");
  const collectPanel = document.querySelector("#collect-panel");
  const reviewPanel = document.querySelector("#review-panel");
  const generatePanel = document.querySelector("#generate-panel");
  const fetchStatus = document.querySelector("#fetch-status");
  const fetchProgress = document.querySelector("#fetch-progress");
  const fetchLog = document.querySelector("#fetch-log");
  const reviewStatus = document.querySelector("#review-status");
  const reviewActions = document.querySelector("#review-actions");
  const reviewSummary = document.querySelector("#review-summary");
  const includeUnresolvedButton = document.querySelector("#include-unresolved");
  const excludeUnresolvedButton = document.querySelector("#exclude-unresolved");
  const generateStatus = document.querySelector("#generate-status");
  const generateProgress = document.querySelector("#generate-progress");
  const preview = document.querySelector("#preview");
  const output = document.querySelector("#output");
  const dispositions = {
    selected: { label: "Included", icon: "✓", className: "keep" },
    excluded: { label: "Excluded", icon: "–", className: "skip" },
    review: { label: "Review", icon: "?", className: "review" },
    seen: { label: "Seen", className: "seen" },
    fallback: { label: "Fallback", icon: "!", className: "fallback" },
  };
  let pollTimer;

  function setWorkflowStep(name, state, status) {
    const step = document.querySelector("#workflow-" + name);
    const link = step.querySelector("a");
    const marker = step.querySelector(".step-marker");
    step.className = "workflow-step " + state;
    document.querySelector("#workflow-" + name + "-state").textContent = status;
    marker.textContent = state === "complete" ? "✓" : marker.dataset.stepNumber;
    if (state === "current") link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
  }

  fetchButton.addEventListener("click", async () => {
    fetchButton.disabled = true;
    fetchButton.textContent = "Fetching…";
    generateButton.disabled = true;
    preview.replaceChildren();
    fetchStatus.textContent = "Starting collection…";
    reviewStatus.textContent = "Waiting for collection to finish.";
    collectPanel.setAttribute("aria-busy", "true");
    setWorkflowStep("collect", "current", "Collecting sources");
    setWorkflowStep("review", "blocked", "Waiting for collection");
    setWorkflowStep("generate", "blocked", "Waiting for review");
    try {
      const response = await window.fetch("/api/fetch", {
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
      fetchButton.textContent = "Fetch items";
      collectPanel.setAttribute("aria-busy", "false");
      setWorkflowStep("collect", "current", "Needs attention");
    }
  });

  cancelFetchButton.addEventListener("click", async () => {
    cancelFetchButton.disabled = true;
    fetchStatus.textContent = "Stopping fetch…";
    try {
      const response = await window.fetch("/api/fetch", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reset fetch");
      preview.replaceChildren();
      renderFetchState(data);
    } catch (error) {
      fetchStatus.textContent = error.message;
      cancelFetchButton.disabled = false;
      setWorkflowStep("collect", "current", "Could not reset");
    }
  });

  async function refreshFetchState() {
    try {
      const response = await window.fetch("/api/fetch/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read fetch progress");
      renderFetchState(data);
    } catch (error) {
      fetchStatus.textContent = error.message;
      setWorkflowStep("collect", "current", "Connection problem");
      schedulePoll();
    }
  }

  function renderFetchState(data) {
    clearTimeout(pollTimer);
    renderProgress(data);
    if (data.status === "running") {
      fetchButton.disabled = true;
      fetchButton.textContent = "Fetching…";
      cancelFetchButton.disabled = false;
      generateButton.disabled = true;
      reviewActions.hidden = true;
      collectPanel.setAttribute("aria-busy", "true");
      reviewPanel.setAttribute("aria-busy", "false");
      generatePanel.setAttribute("aria-busy", "false");
      reviewStatus.textContent = "Waiting for collection to finish.";
      setWorkflowStep("collect", "current", "Collecting sources");
      setWorkflowStep("review", "blocked", "Waiting for collection");
      setWorkflowStep("generate", "blocked", "Waiting for review");
      fetchStatus.textContent = data.progress?.message || "Fetching sources…";
      schedulePoll();
      return;
    }
    fetchButton.disabled = !configurationReady;
    fetchButton.textContent = "Fetch items";
    cancelFetchButton.disabled = data.status === "idle";
    collectPanel.setAttribute("aria-busy", "false");
    reviewPanel.setAttribute("aria-busy", "false");
    generatePanel.setAttribute("aria-busy", "false");
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
      reviewStatus.textContent = "Selection: " + result.selectedCount + " included, " +
        result.skippedCount + " excluded, and " + result.unresolvedCount +
        " unresolved across " + result.items.length + " items.";
      setWorkflowStep("collect", "complete", result.fetchedCount + " fetched");
      if (result.unresolvedCount > 0) {
        setWorkflowStep("review", "current", result.unresolvedCount + " to decide");
        setWorkflowStep("generate", "blocked", "Review required");
        generateStatus.textContent = "Resolve every review item before generating.";
      } else if (result.itemCount > 0) {
        setWorkflowStep("review", "complete", result.selectedCount + " included");
        setWorkflowStep("generate", "current", "Ready");
        generateStatus.textContent = "Ready to generate.";
      } else {
        setWorkflowStep("collect", "current", "Collect again");
        setWorkflowStep("review", "complete", "No items included");
        setWorkflowStep("generate", "blocked", "No included items");
        generateStatus.textContent =
          "No items are included. Adjust the collection and fetch again.";
      }
      return;
    }
    generateButton.disabled = true;
    reviewActions.hidden = true;
    if (data.status === "error") {
      fetchStatus.textContent = data.error || "Fetch failed";
      reviewStatus.textContent = "Collection did not complete.";
      setWorkflowStep("collect", "current", "Try again");
      setWorkflowStep("review", "blocked", "Waiting for collection");
      setWorkflowStep("generate", "blocked", "Waiting for review");
    } else {
      fetchStatus.textContent = configurationReady
        ? "Ready."
        : "Complete setup in Settings before collecting sources.";
      reviewStatus.textContent = "Collect items to begin reviewing.";
      setWorkflowStep(
        "collect",
        "current",
        configurationReady ? "Ready" : "Setup required",
      );
      setWorkflowStep("review", "blocked", "Waiting for collection");
      setWorkflowStep("generate", "blocked", "Waiting for review");
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
    const groups = data.items.reduce((result, item) => {
      (result[item.source] ||= []).push(item);
      return result;
    }, {});
    if (data.items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "section-status";
      empty.textContent = "No items matched this collection.";
      preview.append(empty);
    }
    for (const [source, items] of Object.entries(groups)) {
      const details = document.createElement("details");
      details.className = "source-group";
      details.dataset.source = source;
      const hasUnresolved = items.some((item) =>
        item.kind === "review" || item.kind === "fallback"
      );
      details.open = openSources.has(source) || (openSources.size === 0 && hasUnresolved);
      const summary = document.createElement("summary");
      summary.className = "source-summary";
      const selected = items.filter((item) => item.selected).length;
      const unresolved = items.filter((item) =>
        item.kind === "review" || item.kind === "fallback"
      ).length;
      const skipped = items.length - selected - unresolved;
      const sourceName = document.createElement("strong");
      sourceName.textContent = source;
      const counts = document.createElement("span");
      counts.className = "source-counts";
      counts.textContent = selected + " included · " + skipped + " excluded · " +
        unresolved + " review";
      summary.append(sourceName, counts);
      const list = document.createElement("ul");
      list.className = "decision-list";
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
        const content = document.createElement("div");
        content.className = "decision-content";
        const link = document.createElement("a");
        link.className = "decision-title";
        link.href = item.link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = item.title;
        const opensNewTab = document.createElement("span");
        opensNewTab.className = "sr-only";
        opensNewTab.textContent = " (opens in a new tab)";
        link.append(opensNewTab);
        const meta = document.createElement("small");
        meta.className = "decision-meta";
        const date = new Date(item.date);
        if (!Number.isNaN(date.getTime())) {
          const time = document.createElement("time");
          time.dateTime = item.date;
          time.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
            .format(date);
          meta.append(time);
        }
        if (typeof item.confidence === "number") {
          if (meta.childNodes.length > 0) meta.append(" · ");
          meta.append(Math.round(item.confidence * 100) + "% confidence");
        }
        const reason = document.createElement("p");
        reason.className = "decision-reason";
        reason.textContent = item.reason;
        content.append(link);
        if (meta.childNodes.length > 0) content.append(meta);
        content.append(reason);
        row.append(tag, content);
        if (item.kind === "review" || item.kind === "fallback") {
          const actions = document.createElement("div");
          actions.className = "decision-actions";
          actions.append(
            reviewButton("Include", item.title, item.fingerprint, true),
            reviewButton("Exclude", item.title, item.fingerprint, false),
          );
          row.append(actions);
        }
        list.append(row);
      }
      details.append(summary, list);
      preview.append(details);
    }
    const healthDetails = document.createElement("details");
    healthDetails.className = "feed-health";
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
  }

  function reviewButton(label, title, fingerprint, selected) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", label + ": " + title);
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
    reviewPanel.setAttribute("aria-busy", "true");
    reviewStatus.textContent = "Saving review decision…";
    try {
      const response = await window.fetch("/api/fetch/selection", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(resolution),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save review decision");
      renderFetchState(data);
    } catch (error) {
      reviewStatus.textContent = error.message;
      reviewPanel.setAttribute("aria-busy", "false");
      setWorkflowStep("review", "current", "Needs attention");
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
    generateButton.textContent = "Generating…";
    generatePanel.setAttribute("aria-busy", "true");
    setWorkflowStep("generate", "current", "Generating digest");
    let completed = false;
    let generationWarning = "";
    output.textContent = "";
    generateStatus.textContent = "Starting…";
    generateProgress.removeAttribute("value");
    generateProgress.hidden = false;
    try {
      const response = await window.fetch("/api/generate", { method: "POST" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Generation failed");
      }
      await readEvents(response, (event, data) => {
        if (event === "stage") generateStatus.textContent = data.message;
        if (event === "content") output.textContent += data.content;
        if (event === "complete") {
          completed = true;
          generateStatus.replaceChildren(
            document.createTextNode("Saved. "),
            Object.assign(document.createElement("a"), {
              href: "/history/" + encodeURIComponent(data.file),
              textContent: "Read " + data.file,
            }),
            document.createTextNode(generationWarning ? ". " + generationWarning : ""),
          );
          setWorkflowStep("generate", "complete", "Digest saved");
        }
        if (event === "warning") generationWarning = data.message;
        if (event === "error") throw new Error(data.message);
      });
    } catch (error) {
      generateStatus.textContent = error.message;
      setWorkflowStep("generate", "current", "Try again");
    } finally {
      generateProgress.hidden = true;
      generatePanel.setAttribute("aria-busy", "false");
      generateButton.disabled = completed;
      generateButton.textContent = "Generate digest";
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
      const response = await window.fetch("/api/config", { cache: "no-store" });
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
      const response = await window.fetch("/api/config", {
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
