import { mountTimeline } from "./components/timeline.js";
import { mountShrinkAnimation } from "./components/shrink_animation.js";
import { mountPredicateCard } from "./components/predicate_card.js";
import { mountGatePanel } from "./components/gate_panel.js";
import { mountPrComment } from "./components/pr_comment.js";
import { mountScarBrowser } from "./components/scar_browser.js";

const EVENT_TYPES = [
  "demo.started",
  "beat.started",
  "trace.step",
  "trace.outcome",
  "shrink.started",
  "shrink.attempt",
  "shrink.done",
  "predicate.synthesized",
  "admission.result",
  "gate.result",
  "regression.detected",
  "demo.finished",
];

const app = document.querySelector("#app");
const elements = {
  status: document.querySelector("#connection-status"),
  eventCount: document.querySelector("#event-count"),
  sequence: document.querySelector("#stream-seq"),
  beatTitle: document.querySelector("#beat-title"),
  beatIndicator: document.querySelector("#beat-indicator"),
  pause: document.querySelector("#pause-button"),
  replay: document.querySelector("#replay-button"),
  pausedBanner: document.querySelector("#paused-banner"),
};

const components = {
  timeline: mountTimeline(document.querySelector("#timeline")),
  shrink: mountShrinkAnimation(document.querySelector("#shrink-animation"), {
    sizeLabel: document.querySelector("#shrink-size"),
  }),
  predicate: mountPredicateCard(document.querySelector("#predicate-card"), {
    sourceLabel: document.querySelector("#predicate-source"),
  }),
  gates: mountGatePanel(document.querySelector("#gate-panel")),
  comment: mountPrComment(document.querySelector("#pr-comment")),
  scar: mountScarBrowser(document.querySelector("#scar-browser"), {
    statusLabel: document.querySelector("#scar-status"),
  }),
};

let source;
let paused = false;
let buffered = [];
let seenSequences = new Set();
let eventCount = 0;
let finished = false;

function setConnection(label, state) {
  if (!elements.status) return;
  elements.status.className = `status status--${state}`;
  elements.status.lastChild.textContent = ` ${label}`;
}

function setBeat(number, title) {
  if (elements.beatTitle) elements.beatTitle.textContent = title || `Beat ${number}`;
  elements.beatIndicator?.querySelectorAll("[data-beat]").forEach((item) => {
    const beat = Number(item.dataset.beat);
    item.classList.toggle("is-active", beat === number);
    item.classList.toggle("is-complete", beat < number);
  });
}

function resetView() {
  seenSequences = new Set();
  eventCount = 0;
  buffered = [];
  finished = false;
  components.timeline.reset();
  components.shrink.reset();
  components.predicate.reset();
  components.gates.reset();
  components.comment.reset();
  components.scar.reset();
  if (elements.eventCount) elements.eventCount.textContent = "0 events";
  if (elements.sequence) elements.sequence.textContent = "seq —";
  setBeat(0, "Waiting for the five-beat proof…");
}

function render(event) {
  if (!event || typeof event !== "object") return;
  if (Number.isInteger(event.seq)) seenSequences.add(event.seq);
  eventCount += 1;
  if (elements.eventCount) {
    elements.eventCount.textContent = `${eventCount} event${eventCount === 1 ? "" : "s"}`;
  }
  if (elements.sequence && Number.isInteger(event.seq)) {
    elements.sequence.textContent = `seq ${String(event.seq).padStart(3, "0")}`;
  }
  if (event.type === "beat.started") setBeat(event.n, event.title);
  if (event.type === "demo.finished") {
    finished = true;
    setConnection("Complete", "complete");
    elements.beatIndicator?.querySelectorAll("[data-beat]").forEach((item) => {
      item.classList.add("is-complete");
      item.classList.remove("is-active");
    });
  }
  Object.values(components).forEach((component) => component.handle(event));
}

function receive(event) {
  if (!event || typeof event !== "object") return;
  if (Number.isInteger(event.seq) && seenSequences.has(event.seq)) return;
  if (paused) {
    if (Number.isInteger(event.seq)) seenSequences.add(event.seq);
    buffered.push(event);
    return;
  }
  render(event);
}

function setPaused(value) {
  paused = value;
  elements.pause?.setAttribute("aria-pressed", String(paused));
  if (elements.pause) elements.pause.firstChild.textContent = paused ? "Resume " : "Pause ";
  if (elements.pausedBanner) elements.pausedBanner.hidden = !paused;
  if (!paused) {
    const pending = buffered;
    buffered = [];
    pending.forEach(render);
  }
}

function connect() {
  if (source) source.close();
  const suffix = `?viewer=${Date.now()}`;
  source = new EventSource(`/events${suffix}`);
  finished = false;
  setConnection("Connecting", "connecting");
  source.onopen = () => setConnection("Live", "live");
  source.onerror = () => {
    if (!finished) setConnection("Disconnected · retrying", "disconnected");
  };
  EVENT_TYPES.forEach((type) => {
    source.addEventListener(type, (message) => {
      try {
        receive(JSON.parse(message.data));
      } catch (_error) {
        // Ignore malformed frames; the stream remains available for later events.
      }
    });
  });
}

async function replay() {
  if (!elements.replay) return;
  elements.replay.disabled = true;
  elements.replay.textContent = "Restarting…";
  try {
    const response = await fetch("/restart", { method: "POST" });
    if (!response.ok) throw new Error(`restart failed (${response.status})`);
    resetView();
    connect();
  } catch (_error) {
    setConnection("Disconnected · replay failed", "disconnected");
  } finally {
    elements.replay.disabled = false;
    elements.replay.textContent = "Replay";
  }
}

elements.pause?.addEventListener("click", () => setPaused(!paused));
elements.replay?.addEventListener("click", replay);
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  event.preventDefault();
  setPaused(!paused);
});

if (app) {
  app.dataset.status = "ready";
  connect();
}
