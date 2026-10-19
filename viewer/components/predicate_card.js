export function mountPredicateCard(root, options = {}) {
  if (!root) return { handle() {}, reset() {} };
  const sourceLabel = options.sourceLabel;

  function reset() {
    root.replaceChildren(empty("The synthesized predicate will appear here."));
    if (sourceLabel) sourceLabel.textContent = "—";
  }

  function handle(event) {
    if (event.type !== "predicate.synthesized") return;
    if (sourceLabel) sourceLabel.textContent = event.source || "fallback";
    root.replaceChildren();
    const dsl = document.createElement("code");
    dsl.className = "predicate-dsl";
    dsl.textContent = event.dsl || "predicate unavailable";
    const rationale = document.createElement("p");
    rationale.className = "predicate-rationale";
    rationale.textContent = event.english || "Validated against the reduced trace.";
    root.append(dsl, rationale);
  }

  return { handle, reset };
}

function empty(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}
