"""Enforce separate backend line and branch coverage minimums."""

import json
import sys
from pathlib import Path


def main() -> int:
    report = Path(sys.argv[1] if len(sys.argv) > 1 else "coverage.json")

    try:
        data = json.loads(report.read_text(encoding="utf-8"))
        totals = data["totals"]

        if data["meta"]["branch_coverage"] is not True:
            raise ValueError("Branch coverage must be enabled.")

        failed = False

        for label, covered_key, total_key, minimum in [
            ("Lines", "covered_lines", "num_statements", 90),
            ("Branches", "covered_branches", "num_branches", 80),
        ]:
            covered = totals[covered_key]
            total = totals[total_key]

            if (
                type(covered) is not int
                or type(total) is not int
                or total <= 0
                or not 0 <= covered <= total
            ):
                raise ValueError(f"Invalid {label.lower()} coverage counts.")

            percentage = covered / total * 100
            print(f"{label}: {percentage:.2f}% (minimum {minimum}%)")

            # Compare exact counts so rounding cannot hide a failure.
            if covered * 100 < minimum * total:
                failed = True

        return 1 if failed else 0

    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Cannot validate coverage: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())