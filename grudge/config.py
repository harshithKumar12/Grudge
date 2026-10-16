"""Bootstrap configuration shared by every pipeline stage.

Phase 0 keeps defaults deterministic and offline-first; later phases may add
validated environment loading without changing these stable names.
"""

from dataclasses import dataclass
from pathlib import Path

N_RUNS: int = 20
WILSON_Z: float = 1.96
GATE_THRESHOLD: float = 0.80
OFFLINE: bool = True
DEFAULT_MODEL: str = "offline-scripted"

PACKAGE_DIR: Path = Path(__file__).resolve().parent
PROJECT_ROOT: Path = PACKAGE_DIR.parent
CACHE_DIR: Path = PROJECT_ROOT / ".grudge" / "cache"
SCARS_DIR: Path = PROJECT_ROOT / "scars"


@dataclass(frozen=True)
class Settings:
    """Immutable application defaults used by the Phase 0 command surface."""

    n_runs: int = N_RUNS
    wilson_z: float = WILSON_Z
    gate_threshold: float = GATE_THRESHOLD
    offline: bool = OFFLINE
    model: str = DEFAULT_MODEL
    cache_dir: Path = CACHE_DIR
    scars_dir: Path = SCARS_DIR


DEFAULTS = Settings()
