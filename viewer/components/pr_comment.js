export function mountPrComment(root) {
  if (!root) return { handle() {}, reset() {} };

  function reset() {
    root.replaceChildren(empty("A reviewer comment appears when the regression is blocked."));
  }

  function handle(event) {
    if (event.type !== "regression.detected") return;
    root.replaceChildren();
    const comment = document.createElement("pre");
    comment.className = "comment-markdown";
    comment.textContent = event.markdown || "Regression blocked by admitted Scar.";
    root.append(comment);
  }

  return { handle, reset };
}

function empty(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}
