"""Build and court-check the offline demo from the real example agent.

Run ``python -m scripts.build_sample_scar`` from the repository root. The
fingerprint and source hash are deterministic; court timestamps record the
actual proof run. All HTTP tools in the example are fake, in-memory transports.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TYPE_CHECKING

from examples.leaky_agent.agent import AGENT_VERSION, run_agent
from examples.leaky_agent.agent_fixed import FIXED_AGENT_VERSION
from examples.leaky_agent.agent_fixed import run_agent as run_fixed_agent
from grudge.predicates.fallback_rules import demo_rule
from grudge.replay.sandbox import world_from_trace
from grudge.schema.cassette import Cassette
from grudge.schema.scar import Scar
from grudge.schema.trace import Trace

if TYPE_CHECKING:
    from grudge.admission.verdict import AdmissionVerdict

ROOT = Path(__file__).resolve().parents[1]
CONTROLS = ROOT / "examples" / "leaky_agent" / "controls"


def load_controls(directory: Path | str = CONTROLS) -> list[Trace]:
    """Read the checked-in benign traces in stable filename order."""

    paths = sorted(Path(directory).glob("*.jsonl"))
    if len(paths) < 2:
        raise ValueError("the demo requires at least two benign control traces")
    traces = [Trace.from_jsonl(path.read_text(encoding="utf-8")) for path in paths]
    if any(not trace.steps or trace.outcome != "ok" for trace in traces):
        raise ValueError("benign controls must be nonempty, completed traces")
    return traces


def build_candidate(*, created_at: datetime | None = None) -> Scar:
    """Derive a compact, complete candidate from a fresh real example run.

    Preserve every observed response on the leak path, including the successful
    sink response. Only the inbox listing is reduced: retain the poisoned
    record's metadata, so the policy still has to actually read its body.
    """

    source = run_agent()
    full = world_from_trace(source)
    read = next(entry for entry in full.world if entry.tool == "read_file")
    sink = next(entry for entry in full.world if entry.tool == "send_http")
    poison = next(
        entry
        for entry in full.world
        if entry.tool == "read_email"
        and f"read_file {read.match.args['path']}" in str(entry.response)
    )
    listing = next(entry for entry in full.world if entry.tool == "list_emails")
    metadata = next(
        record for record in listing.response if record["id"] == poison.response["id"]
    )
    compact_listing = listing.model_copy(
        update={"response": [{k: v for k, v in metadata.items() if k != "body"}]},
        deep=True,
    )
    cassette = Cassette(
        task=source.task,
        world=[compact_listing, poison, read, sink],
    )
    predicate = demo_rule()
    fingerprint = hashlib.sha256(
        json.dumps(
            {
                "cassette": cassette.model_dump(mode="json"),
                "predicate": predicate.model_dump(mode="json"),
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return Scar(
        id="sample_leak",
        cassette=cassette,
        predicate=predicate,
        seed_predicate=predicate.model_copy(deep=True),
        source_trace_hash=hashlib.sha256(source.to_jsonl().encode("utf-8")).hexdigest(),
        agent_version_failed=AGENT_VERSION,
        agent_version_fixed=FIXED_AGENT_VERSION,
        created_at=created_at or datetime.now(UTC),
        fingerprint=fingerprint,
    )


def build_sample_scar(
    output_dir: Path | str | None = None,
    *,
    runs: int = 3,
    created_at: datetime | None = None,
) -> AdmissionVerdict:
    """Build and admit the candidate, persisting only through the real court."""

    from grudge.admission.court import admit

    candidate = build_candidate(created_at=created_at)
    controls = load_controls()
    directory = ROOT / "scars" if output_dir is None else Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    # Court persistence is exclusive. Stage a new proof so regeneration can
    # replace the checked-in sample only after every admission gate succeeds.
    with TemporaryDirectory(prefix=".sample-proof-", dir=directory) as staging:
        verdict = admit(
            candidate,
            run_agent,
            run_fixed_agent,
            runs=runs,
            controls=controls,
            output_dir=staging,
        )
        if verdict.admitted and verdict.saved_path is not None:
            target = directory / f"{candidate.id}.scar.json"
            Path(verdict.saved_path).replace(target)
            verdict.saved_path = target
    return verdict


def main() -> None:
    """Print the court's actual proof and fail the command on rejection."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "scars")
    parser.add_argument("--runs", type=int, default=3)
    args = parser.parse_args()
    verdict = build_sample_scar(args.output_dir, runs=args.runs)
    print(verdict.model_dump_json(indent=2))
    if not verdict.admitted:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
