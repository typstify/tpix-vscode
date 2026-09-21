// @ts-check
/* TPIX sidebar webview. Plain JS on purpose: no build step, loaded as a local
 * resource by src/views/tpixView.ts. It renders the state pushed by the
 * extension and posts user actions back. */

(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');

  /** @type {any} */
  let state = { account: null, search: null, detail: null, project: null, cache: null, activity: [] };

  const saved = vscode.getState();
  /** @type {{tab: string, query: string, kind: string, expanded: Set<string>, expandedNs: Set<string>, expandedPkgs: Set<string>}} */
  const ui = saved && saved.ui
    ? {
        tab: saved.ui.tab,
        query: saved.ui.query,
        kind: saved.ui.kind,
        expanded: new Set(saved.ui.expanded || []),
        expandedNs: new Set(saved.ui.expandedNs || []),
        expandedPkgs: new Set(saved.ui.expandedPkgs || []),
      }
    : { tab: 'search', query: '', kind: 'all', expanded: new Set(), expandedNs: new Set(), expandedPkgs: new Set() };

  const ICON = {
    copy: 'copy',
    download: 'cloud-download',
    folder: 'folder-opened',
    trash: 'trash',
  };

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'state') {
      state = event.data.state || state;
      render();
    }
  });

  function post(message) {
    vscode.postMessage(message);
  }

  function saveUi() {
    vscode.setState({
      ui: {
        tab: ui.tab,
        query: ui.query,
        kind: ui.kind,
        expanded: [...ui.expanded],
        expandedNs: [...ui.expandedNs],
        expandedPkgs: [...ui.expandedPkgs],
      },
    });
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function specOf(p) {
    return '@' + p.namespace + '/' + p.name + (p.version ? ':' + p.version : '');
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function thumbnailVariant(url, size) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'size=' + size;
  }

  function iconBtn(action, attrs, title, icon) {
    return '<button class="iconbtn" data-action="' + action + '" ' + attrs +
      ' title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
      '<i class="codicon codicon-' + icon + '"></i>' +
      '</button>';
  }

  function render() {
    const active = document.activeElement;
    const activeId = active && active.id;
    const caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;

    app.innerHTML = header() + tabs() + '<div class="content">' + content() + '</div>';

    // Fall back to the full-size thumbnail if the small variant fails to load.
    const thumbs = app.querySelectorAll('img.thumb');
    for (let i = 0; i < thumbs.length; i++) {
      const img = thumbs[i];
      img.addEventListener('error', function () {
        const fallback = img.getAttribute('data-fallback');
        if (fallback && img.getAttribute('src') !== fallback) {
          img.setAttribute('src', fallback);
        }
      });
    }

    if (activeId) {
      const el = document.getElementById(activeId);
      if (el && el.focus) {
        el.focus();
        if (caret != null && el.setSelectionRange) {
          try { el.setSelectionRange(caret, caret); } catch (e) { /* ignore */ }
        }
      }
    }
    saveUi();
  }

  function header() {
    const a = state.account;
    return '<div class="header"><span class="title">TPIX</span><span class="account">' +
      '<span class="' + (a ? '' : 'muted') + '">' + (a ? '@' + esc(a.username) : 'Not signed in') + '</span>' +
      '<button class="mini" data-action="account">' + (a ? 'Sign out' : 'Sign in') + '</button>' +
      '</span></div>';
  }

  const TABS = ['search', 'project', 'cache', 'activity'];

  function tabs() {
    return '<div class="tabs">' + TABS.map((t) =>
      '<button class="tab' + (ui.tab === t ? ' active' : '') + '" data-tab="' + t + '">' + cap(t) + '</button>').join('') + '</div>';
  }

  function content() {
    if (ui.tab === 'project') return projectTab();
    if (ui.tab === 'cache') return cacheTab();
    if (ui.tab === 'activity') return activityTab();
    return searchTab();
  }

  // --- Search ---------------------------------------------------------------

  function searchTab() {
    if (state.detail) return detailView(state.detail);

    let html = '<form class="searchbar" data-role="search">' +
      '<input id="q" type="text" placeholder="Search packages…" value="' + esc(ui.query) + '" />' +
      '<select id="kind">' + option('all', 'All') + option('pkg', 'Packages') + option('template', 'Templates') + '</select>' +
      '<button type="submit">Go</button></form>';

    const s = state.search;
    if (!s) html += '<div class="muted">Search the Typst package index.</div>';
    else if (s.loading) html += '<div class="muted">Searching…</div>';
    else if (!s.results.length) html += '<div class="muted">No results for “' + esc(s.query) + '”.</div>';
    else {
      html += '<ul class="results">' + s.results.map((r) => {
        const base = '@' + r.namespace + '/' + r.name;
        const versioned = r.latest_version ? base + ':' + r.latest_version : base;
        return '<li class="result">' +
          '<div class="rmain" data-action="detail" data-spec="' + esc(base) + '">' +
          '<div class="rname">' + esc(base) + (r.latest_version ? ' <span class="ver">' + esc(r.latest_version) + '</span>' : '') + '</div>' +
          (r.description ? '<div class="rdesc muted">' + esc(r.description) + '</div>' : '') +
          '</div>' +
          '<span class="rowactions">' + iconBtn('copy', 'data-text="' + esc(versioned) + '"', 'Copy ' + versioned, ICON.copy) + '</span>' +
          '</li>';
      }).join('') + '</ul>';
    }
    return html;
  }

  function option(value, label) {
    return '<option value="' + value + '"' + (ui.kind === value ? ' selected' : '') + '>' + label + '</option>';
  }

  function detailView(p) {
    const base = '@' + p.namespace + '/' + p.name;
    const latest = p.versions && p.versions.length ? p.versions[0].version : '';
    const latestSpec = latest ? base + ':' + latest : base;

    let html = '<button class="link" data-action="back">← Back</button>';
    html += '<div class="card"><div class="pkgtitle">' + esc(base) + '</div>';
    if (p.is_template && p.thumbnail) {
      html += '<div class="thumbwrap"><img class="thumb" src="' + esc(thumbnailVariant(p.thumbnail, 'small')) +
        '" data-fallback="' + esc(p.thumbnail) + '" alt="Template preview" loading="lazy"></div>';
    }
    if (p.description) html += '<div class="row">' + esc(p.description) + '</div>';
    if (p.license) html += '<div class="row muted">License: ' + esc(p.license) + '</div>';
    if (p.authors && p.authors.length) html += '<div class="row muted">Authors: ' + esc(p.authors.join(', ')) + '</div>';
    if (p.categories && p.categories.length) html += '<div class="row muted">Categories: ' + esc(p.categories.join(', ')) + '</div>';
    html += '<div class="actions">' +
      '<button data-action="install" data-spec="' + esc(latestSpec) + '">Install' + (latest ? ' ' + esc(latest) : '') + '</button>' +
      '<button class="secondary" data-action="copy" data-text="' + esc(latestSpec) + '">Copy spec</button>';
    if (p.homepage_url) html += '<button class="secondary" data-action="openExternal" data-url="' + esc(p.homepage_url) + '">Homepage</button>';
    if (p.repository_url) html += '<button class="secondary" data-action="openExternal" data-url="' + esc(p.repository_url) + '">Repository</button>';
    html += '</div></div>';

    if (p.versions && p.versions.length) {
      html += '<div class="card"><div class="subhead">Versions</div><ul class="versions">' +
        p.versions.map((v) =>
          '<li class="vrow"><span>' + esc(v.version) + ' <span class="ver">typst ' + esc(v.minCompilerVer || '?') + '</span></span>' +
          iconBtn('install', 'data-spec="' + esc(base + ':' + v.version) + '"', 'Install ' + base + ':' + v.version, ICON.download) +
          '</li>').join('') + '</ul></div>';
    }
    return html;
  }

  // --- Project dependencies -------------------------------------------------

  function projectTab() {
    const p = state.project;
    const nodes = p ? p.nodes : [];
    const missing = nodes.filter((n) => !n.cached).length;

    let html = '<div class="toolbar"><button class="mini" data-action="refreshProject">Refresh</button>' +
      '<button class="mini" data-action="fetchMissing"' + (missing ? '' : ' disabled') + '>Fetch missing (' + missing + ')</button>' +
      (p && p.loading ? '<span class="muted">Loading…</span>' : '') + '</div>';

    if (!p) html += '<div class="muted">Loading…</div>';
    else if (!nodes.length) html += '<div class="muted">No package imports found. Add <code>#import "@ns/name"</code> to a <code>.typ</code> file.</div>';
    else html += '<ul class="tree">' + nodes.map(nodeHtml).join('') + '</ul>';
    return html;
  }

  function nodeHtml(n) {
    const spec = specOf(n);
    const expanded = ui.expanded.has(spec);
    const children = n.children || [];
    const canExpand = !n.resolved || children.length > 0;

    let html = '<li class="node"><div class="nrow">';
    html += canExpand
      ? '<button class="caret" data-action="toggle" data-spec="' + esc(spec) + '">' + (expanded ? '▾' : '▸') + '</button>'
      : '<span class="caret-space"></span>';
    html += '<span class="dot ' + (n.cached ? 'ok' : 'bad') + '"></span>';
    html += '<span class="nspec">' + esc(spec) + '</span>';
    html += '<span class="status muted">' + (n.cached ? 'cached' : 'missing') + '</span>';
    if (!n.cached) html += '<button class="mini" data-action="install" data-spec="' + esc(spec) + '">Install</button>';
    html += '</div>';

    if (expanded) {
      if (!n.resolved) html += '<div class="ind muted">Resolving…</div>';
      else if (!children.length) html += '<div class="ind muted">No dependencies.</div>';
      else html += '<ul>' + children.map(nodeHtml).join('') + '</ul>';
    }
    html += '</li>';
    return html;
  }

  // --- Cache ----------------------------------------------------------------

  function cacheTab() {
    const c = state.cache;
    let html = '<div class="toolbar"><button class="mini" data-action="refreshCache">Refresh</button>' +
      (c ? '<span class="muted">' + c.packages.length + ' packages</span>' : '') + '</div>';

    if (!c) return html + '<div class="muted">Loading…</div>';
    if (!c.packages.length) return html + '<div class="muted">No cached packages yet. Install one from the Search tab.</div>';

    const groups = {};
    for (const p of c.packages) {
      const ns = (groups[p.namespace] = groups[p.namespace] || {});
      (ns[p.name] = ns[p.name] || []).push(p);
    }

    for (const ns of Object.keys(groups).sort()) {
      const names = groups[ns];
      const nsOpen = ui.expandedNs.has(ns);
      const count = Object.keys(names).reduce((total, name) => total + names[name].length, 0);

      html += '<div class="group">' +
        '<button class="grouphead" data-action="toggleNamespace" data-ns="' + esc(ns) + '">' +
        '<span class="caret">' + (nsOpen ? '▾' : '▸') + '</span> ' + esc(ns) +
        ' <span class="muted">(' + count + ')</span></button>';

      if (nsOpen) {
        for (const name of Object.keys(names).sort()) {
          const versions = names[name].slice().sort((a, b) => a.version.localeCompare(b.version));
          const key = ns + '/' + name;
          const pkgOpen = ui.expandedPkgs.has(key);

          html += '<div class="pkggroup">' +
            '<button class="pkggrouphead" data-action="togglePackage" data-key="' + esc(key) + '">' +
            '<span class="caret">' + (pkgOpen ? '▾' : '▸') + '</span> ' + esc(name) +
            ' <span class="muted">(' + versions.length + ')</span></button>';

          if (pkgOpen) {
            html += '<ul class="cachelist">' + versions.map((p) => {
              const spec = '@' + p.namespace + '/' + p.name + ':' + p.version;
              return '<li><span class="ver">' + esc(p.version) + '</span>' +
                '<span class="rowactions">' +
                (p.path ? iconBtn('reveal', 'data-path="' + esc(p.path) + '"', 'Reveal in File Explorer', ICON.folder) : '') +
                iconBtn('remove', 'data-spec="' + esc(spec) + '"', 'Remove ' + spec, ICON.trash) +
                '</span></li>';
            }).join('') + '</ul>';
          }
          html += '</div>';
        }
      }
      html += '</div>';
    }
    return html;
  }

  // --- Activity -------------------------------------------------------------

  function activityTab() {
    let html = '<div class="toolbar"><strong>Activity</strong><button class="mini" data-action="clearActivity">Clear</button></div>';
    if (!state.activity || !state.activity.length) return html + '<div class="muted">No activity yet.</div>';
    return html + '<ul class="log">' + state.activity.map((e) =>
      '<li class="' + (e.level === 'error' ? 'err' : '') + '"><span class="muted">' + esc(e.time) + '</span> ' + esc(e.message) + '</li>').join('') + '</ul>';
  }

  // --- Events ---------------------------------------------------------------

  app.addEventListener('click', (event) => {
    const tabEl = event.target.closest('[data-tab]');
    if (tabEl) {
      ui.tab = tabEl.getAttribute('data-tab');
      render();
      return;
    }

    const el = event.target.closest('[data-action]');
    if (!el) return;

    const action = el.getAttribute('data-action');
    const spec = el.getAttribute('data-spec');
    const url = el.getAttribute('data-url');
    const path = el.getAttribute('data-path');
    const text = el.getAttribute('data-text');
    const nsAttr = el.getAttribute('data-ns');
    const keyAttr = el.getAttribute('data-key');

    switch (action) {
      case 'account': post({ type: state.account ? 'logout' : 'login' }); break;
      case 'detail': post({ type: 'showDetail', spec: spec }); break;
      case 'back': post({ type: 'clearDetail' }); break;
      case 'install': post({ type: 'install', spec: spec }); break;
      case 'copy': post({ type: 'copy', text: text }); break;
      case 'openExternal': post({ type: 'openExternal', url: url }); break;
      case 'refreshProject': post({ type: 'refreshProject' }); break;
      case 'fetchMissing': post({ type: 'fetchMissing' }); break;
      case 'refreshCache': post({ type: 'refreshCache' }); break;
      case 'remove': post({ type: 'removeCached', spec: spec }); break;
      case 'reveal': post({ type: 'reveal', path: path }); break;
      case 'clearActivity': post({ type: 'clearActivity' }); break;
      case 'toggle':
        if (ui.expanded.has(spec)) ui.expanded.delete(spec);
        else { ui.expanded.add(spec); post({ type: 'expandDependency', spec: spec }); }
        render();
        break;
      case 'toggleNamespace':
        if (ui.expandedNs.has(nsAttr)) ui.expandedNs.delete(nsAttr);
        else ui.expandedNs.add(nsAttr);
        render();
        break;
      case 'togglePackage':
        if (ui.expandedPkgs.has(keyAttr)) ui.expandedPkgs.delete(keyAttr);
        else ui.expandedPkgs.add(keyAttr);
        render();
        break;
    }
  });

  app.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-role="search"]')) return;
    event.preventDefault();
    const q = document.getElementById('q').value.trim();
    if (!q) return;
    ui.query = q;
    ui.kind = document.getElementById('kind').value;
    ui.tab = 'search';
    post({ type: 'search', query: q, kind: ui.kind });
  });

  post({ type: 'ready' });
  render();
})();
