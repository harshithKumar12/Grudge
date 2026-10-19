export function mountGatePanel(root) {
  if (!root) return { handle() {}, reset() {} };
  const gates = new Map();
  let admission;

  function reset() {
    gates.clear();
    admission = undefined;
    root.replaceChildren(empty("Waiting for the proof gates."));
  }

  function handle(event) {
    if (event.type === "admission.result") admission = event;
    if (event.type === "gate.result") gates.set(`${event.agent}-${gates.size}`, event);
    if (event.type !== "admission.result" && event.type !== "gate.result") return;
    draw();
  }

  function draw() {
    root.replaceChildren();
    if (admission) {
      const proof = document.createElement("div");
      proof.className = `proof-chip ${admission.admitted ? "proof-chip--good" : "proof-chip--bad"}`;
      proof.textContent = admission.admitted ? "ADMITTED · RED / GREEN PROOF" : "REJECTED";
      root.append(proof);
    }
    const grid = document.createElement("div");
    grid.className = "gate-grid";
    [...gates.values()].forEach((gate) => {
      const card = document.createElement("div");
      card.className = `gate-card ${gate.passed ? "gate-card--pass" : "gate-card--fail"}`;
      const icon = document.createElement("span");
      icon.className = "gate-icon";
      icon.textContent = gate.passed ? "✓" : "×";
      const name = document.createElement("strong");
      name.textContent = gate.agent;
      const score = document.createElement("span");
      score.textContent = `${gate.passes}/${gate.n} passes`;
      const bound = document.createElement("small");
      bound.textContent = `Wilson ${(gate.wilson * 100).toFixed(1)}% · threshold ${(gate.threshold * 100).toFixed(1)}%`;
      card.append(icon, name, score, bound);
      grid.append(card);
    });
    root.append(grid);
  }

  return { handle, reset };
}

function empty(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}
