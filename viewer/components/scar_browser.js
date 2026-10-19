export function mountScarBrowser(root, options = {}) {
  if (!root) return { handle() {}, reset() {} };
  const statusLabel = options.statusLabel;
  const state = { trace: 0, shrink: 0, predicate: "—", admitted: false, blocked: false };

  function reset() {
    state.trace = 0;
    state.shrink = 0;
    state.predicate = "—";
    state.admitted = false;
    state.blocked = false;
    if (statusLabel) statusLabel.textContent = "offline";
    root.replaceChildren(empty("The admitted evidence trail will appear here."));
  }

  function handle(event) {
    if (event.type === "trace.step") state.trace += 1;
    else if (event.type === "shrink.done") state.shrink = event.after;
    else if (event.type === "predicate.synthesized") state.predicate = event.dsl;
    else if (event.type === "admission.result") state.admitted = event.admitted;
    else if (event.type === "regression.detected") state.blocked = true;
    else return;
    if (statusLabel) statusLabel.textContent = state.admitted ? "admitted" : "building";
    draw();
  }

  function draw() {
    root.replaceChildren();
    const list = document.createElement("dl");
    list.className = "scar-facts";
    addFact(list, "Captured steps", String(state.trace));
    addFact(list, "Minimal entries", state.shrink ? String(state.shrink) : "pending");
    addFact(list, "Predicate", state.predicate);
    addFact(list, "Regression", state.blocked ? "blocked" : "armed");
    root.append(list);
  }

  return { handle, reset };
}

function addFact(list, label, value) {
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  list.append(term, detail);
}

function empty(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}
