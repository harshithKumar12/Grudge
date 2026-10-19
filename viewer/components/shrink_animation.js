export function mountShrinkAnimation(root, options = {}) {
  if (!root) return { handle() {}, reset() {} };
  const sizeLabel = options.sizeLabel;
  let state = { total: 0, remaining: 0, attempts: 0, kept: 0, done: false };

  function reset() {
    state = { total: 0, remaining: 0, attempts: 0, kept: 0, done: false };
    root.replaceChildren(empty("Shrink evidence will appear here."));
    if (sizeLabel) sizeLabel.textContent = "—";
  }

  function handle(event) {
    if (event.type === "shrink.started") {
      state = { total: event.total, remaining: event.total, attempts: 0, kept: 0, done: false };
    } else if (event.type === "shrink.attempt") {
      state.attempts += 1;
      state.remaining = event.remaining;
      if (event.kept) state.kept += 1;
    } else if (event.type === "shrink.done") {
      state.remaining = event.after;
      state.total = event.before;
      state.done = true;
      if (sizeLabel) sizeLabel.textContent = `${event.before} → ${event.after}`;
    } else {
      return;
    }
    draw();
  }

  function draw() {
    const total = Math.max(state.total, 1);
    const progress = Math.max(0, Math.min(100, ((total - state.remaining) / total) * 100));
    root.replaceChildren();
    const metric = document.createElement("div");
    metric.className = "shrink-metric";
    metric.innerHTML = `<span class="shrink-number"></span><span class="shrink-caption">entries remaining</span>`;
    metric.querySelector(".shrink-number").textContent = String(state.remaining);
    const track = document.createElement("div");
    track.className = "progress-track";
    const bar = document.createElement("div");
    bar.className = "progress-bar";
    bar.style.width = `${progress}%`;
    track.append(bar);
    const stats = document.createElement("div");
    stats.className = "shrink-stats";
    stats.textContent = `${state.attempts} candidates · ${state.kept} kept${state.done ? " · minimal" : ""}`;
    root.append(metric, track, stats);
  }

  return { handle, reset };
}

function empty(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}
