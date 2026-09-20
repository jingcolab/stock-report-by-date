"""Publish a generated report on the latest remote branch without changing its source."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
import re
import subprocess
import tempfile


def _git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=check, capture_output=True, text=True,
    )


def publish_report(repo: Path, report_date: str, branch: str, attempts: int = 3) -> str:
    if date.fromisoformat(report_date).isoformat() != report_date:
        raise ValueError("报告日期必须是 YYYY-MM-DD")
    ref = f"refs/heads/{branch}"
    _git(repo, "check-ref-format", ref)
    relative = Path("reports") / f"{report_date}.html"
    snapshot = (repo / relative).read_bytes()
    if not snapshot or re.search(rb"(?m)^(<<<<<<< |=======\r?$|>>>>>>> )", snapshot):
        raise ValueError("HTML 报告为空或包含 Git 合并冲突标记，停止发布")

    for attempt in range(1, attempts + 1):
        _git(repo, "fetch", "--no-tags", "origin", ref)
        base = _git(repo, "rev-parse", "FETCH_HEAD").stdout.strip()
        with tempfile.TemporaryDirectory(prefix="stock-report-publish-") as temporary:
            worktree = Path(temporary) / "checkout"
            _git(repo, "worktree", "add", "--detach", str(worktree), base)
            try:
                destination = worktree / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(snapshot)
                _git(worktree, "add", "--", relative.as_posix())
                difference = _git(worktree, "diff", "--cached", "--quiet", check=False)
                if difference.returncode == 0:
                    print("报告没有变化，跳过提交。")
                    return base
                if difference.returncode != 1:
                    raise RuntimeError(difference.stderr or "无法检查报告差异")
                _git(
                    worktree,
                    "-c", "user.name=github-actions[bot]",
                    "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
                    "commit", "-m", f"report({report_date}): 指定日期报告",
                )
                pushed = _git(worktree, "push", "origin", f"HEAD:{ref}", check=False)
                if pushed.returncode == 0:
                    sha = _git(worktree, "rev-parse", "HEAD").stdout.strip()
                    print(f"HTML 报告已提交：{sha}")
                    return sha
                # Retry only when another writer actually advanced the remote branch.
                _git(repo, "fetch", "--no-tags", "origin", ref)
                advanced = _git(repo, "rev-parse", "FETCH_HEAD").stdout.strip() != base
                if not advanced or attempt == attempts:
                    raise RuntimeError(pushed.stderr or "HTML 报告推送失败")
            finally:
                _git(repo, "worktree", "remove", "--force", str(worktree))
        print(f"远端分支已更新，重试发布 HTML（{attempt}/{attempts}）。")
    raise RuntimeError("HTML 报告发布重试耗尽")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", required=True)
    parser.add_argument("--branch", required=True)
    args = parser.parse_args()
    try:
        publish_report(Path.cwd(), args.date, args.branch)
    except subprocess.CalledProcessError as error:
        parser.exit(1, error.stderr or str(error))
    except (ValueError, RuntimeError, OSError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
