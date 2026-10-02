#!/usr/bin/env python3
"""
Monte Carlo uncertainty for ARBITER-MVP v2.1 (round 3).

This is the executable entry point named by the execution contract. All arithmetic lives in
`audit/harness/arbiter_engine.py` so that there is exactly ONE implementation of the penalty,
cap, band and Monte-Carlo formulas, which in turn makes `arbiter_engine.py cross-check` a real
independent recomputation rather than a copy of itself.

    python3 audit/mc_sim.py            # emit 00/01/02/03 and mc_out.txt, print the MC summary
    python3 audit/mc_sim.py --verify   # re-derive the published numbers and re-open the
                                       # seeded evidence spot-check; exit 0 only on PASS

Arithmetic determinism (fixed):
    N         = 10_000
    seed      = 424242
    sampler   = numpy.random.default_rng(424242) ; Triangular(min_d, mode_d, max_d)
    bias      = Normal(0, sigma = 3.0), one draw per iteration, added after the weighted sum
    R_i       = clamp(eps + sum_d (w_d/100) * v_{d,i}, 0, 100)
    R_point   = sum_d (w_d/100) * s_d
    P_GO_raw  = count(R_i >= 75.0) / 10_000

Reported as the "score-uncertainty likelihood of reaching the readiness threshold". It is NOT
the probability of a successful production launch, and it is not rounded for narrative use
inside the JSON artifacts.

If `numpy` is unavailable the engine falls back to an explicitly documented linear-congruential
generator seeded with 424242 plus an Irwin-Hall normal approximation; the fallback is recorded
in the `implementation` field of the output so a reader can always tell which one ran.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "harness"))

import arbiter_engine as engine  # noqa: E402


def main() -> int:
    if "--verify" in sys.argv:
        return engine.cmd_cross_check()
    engine.cmd_emit()
    out = Path(engine.AUDIT / "mc_out.txt").read_text()
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
