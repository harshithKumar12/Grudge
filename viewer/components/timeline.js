const labels = {
  "demo.started": "Proof started",
  "beat.started": "Beat started",
  "trace.step": "Trace step",
  "trace.outcome": "Trace outcome",
  "shrink.started": "Shrink started",
  "shrink.attempt": "Shrink attempt",
  "shrink.done": "Shrink complete",
  "predicate.synthesized": "Predicate ready",
  "admission.result": "Admission proof",
  "gate.result": "Gate result",
  "regression.detected": "Regression blocked",
  "demo.finished": "Proof finished",
};

export function mountTimeline(root) {
  if (!root) return { handle() {}, reset() {} };
  let empty = root.querySelector(".empty-state");

  function reset() {
    root.replaceChildren();
    empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Waiting for the first event…";
    root.append(empty);
  }

  function handle(event) {
    empty?.remove();
    const row = document.createElement("div");
    row.className = "timeline-row";
    row.dataset.type = event.type || "event";
    const sequence = document.createElement("span");
    sequence.className = "timeline-seq";
    sequence.textContent = Number.isInteger(event.seq) ? String(event.seq).padStart(3, "0") : "—";
    const body = document.createElement("div");
    body.className = "timeline-body";
    const title = document.createElement("strong");
    title.textContent = labels[event.type] || event.type || "Event";
    const detail = document.createElement("span");
    detail.textContent = describe(event);
    body.append(title, detail);
    row.append(sequence, body);
    root.prepend(row);
  }

  return { handle, reset };
}

function describe(event) {
  switch (event.type) {
    case "beat.started": return event.title || `Beat ${event.n}`;
    case "trace.step": return `${event.kind}: ${event.summary}`;
    case "trace.outcome": return event.leaked ? "HTTP sink received leaked data" : "No leak detected";
    case "shrink.started": return `${event.total} cassette entries`;
    case "shrink.attempt": return `${event.kept ? "Kept" : "Rejected"} candidate · ${event.remaining} remain`;
    case "shrink.done": return `${event.before} → ${event.after} entries · ${event.bytes} bytes`;
    case "predicate.synthesized": return event.english || event.dsl;
    case "admission.result": return event.admitted ? "Scar admitted: red on bad, green on good" : "Scar rejected";
    case "gate.result": return `${event.agent}: ${event.passes}/${event.n} · ${(event.wilson * 100).toFixed(1)}% lower bound`;
    case "regression.detected": return "The vulnerable agent was blocked";
    default: return "";
  }
}
