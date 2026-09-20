from pathlib import Path
import subprocess

import pytest

from scripts import publish_report as publisher


REPORT = "reports/2026-09-18.html"


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True, text=True
    ).stdout.strip()


def commit_file(repo, path, content):
    destination = repo / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(content)
    git(repo, "add", "--", path)
    git(repo, "commit", "-m", "fixture update")
    git(repo, "push", "origin", "main")


@pytest.fixture
def repos(tmp_path):
    remote, seed, runner = (tmp_path / name for name in ("remote.git", "seed", "runner"))
    subprocess.run(["git", "init", "--bare", "--initial-branch=main", str(remote)], check=True, capture_output=True)
    subprocess.run(["git", "clone", str(remote), str(seed)], check=True, capture_output=True)
    git(seed, "config", "user.name", "Test")
    git(seed, "config", "user.email", "test@example.invalid")
    commit_file(seed, REPORT, "<html>old report</html>\n")
    subprocess.run(["git", "clone", str(remote), str(runner)], check=True, capture_output=True)
    git(runner, "checkout", "--detach")
    return remote, seed, runner


def test_old_checkout_publishes_fresh_report_without_rebasing_pdf_source(repos):
    remote, seed, runner = repos
    commit_file(seed, REPORT, "<html>previous successful report</html>\n")
    commit_file(seed, "keep.txt", "upstream changes must survive\n")
    snapshot = "<html>fresh report for PDF</html>\n"
    (runner / REPORT).write_text(snapshot)
    before = git(runner, "rev-parse", "HEAD")
    publisher.publish_report(runner, "2026-09-18", "main")
    assert git(remote, "show", "main:" + REPORT) == snapshot.strip()
    assert git(remote, "show", "main:keep.txt") == "upstream changes must survive"
    assert (runner / REPORT).read_text() == snapshot
    assert git(runner, "rev-parse", "HEAD") == before
    assert not (runner / ".git/rebase-merge").exists()
    assert git(runner, "worktree", "list", "--porcelain").count("worktree ") == 1
    # Publishing identical content does not add a second commit.
    published = git(remote, "rev-parse", "main")
    publisher.publish_report(runner, "2026-09-18", "main")
    assert git(remote, "rev-parse", "main") == published


def test_concurrent_remote_update_is_preserved_on_retry(repos, monkeypatch):
    remote, seed, runner = repos
    (runner / REPORT).write_text("<html>fresh</html>\n")
    original_git = publisher._git
    pushes = []

    def race(repo, *args, **kwargs):
        if args[0] == "push":
            pushes.append(args)
            if len(pushes) == 1:
                commit_file(seed, "concurrent.txt", "another writer\n")
        return original_git(repo, *args, **kwargs)

    monkeypatch.setattr(publisher, "_git", race)
    publisher.publish_report(runner, "2026-09-18", "main")
    assert len(pushes) == 2
    assert git(remote, "show", "main:concurrent.txt") == "another writer"
    assert git(remote, "show", "main:" + REPORT) == "<html>fresh</html>"
    assert (runner / REPORT).read_text() == "<html>fresh</html>\n"


def test_push_rejection_leaves_original_html_intact(repos):
    remote, seed, runner = repos
    hook = remote / "hooks/pre-receive"
    hook.write_text("#!/bin/sh\nexit 1\n")
    hook.chmod(0o755)
    snapshot = "<html>preserve this PDF source</html>\n"
    (runner / REPORT).write_text(snapshot)
    with pytest.raises(RuntimeError, match="rejected"):
        publisher.publish_report(runner, "2026-09-18", "main")
    assert (runner / REPORT).read_text() == snapshot
    assert git(remote, "show", "main:" + REPORT) == "<html>old report</html>"
    assert git(runner, "worktree", "list", "--porcelain").count("worktree ") == 1


def test_conflicted_html_is_never_published(repos):
    remote, seed, runner = repos
    before = git(remote, "rev-parse", "main")
    (runner / REPORT).write_text("<<<<<<< HEAD\nold\n=======\nnew\n>>>>>>> report\n")
    with pytest.raises(ValueError, match="冲突"):
        publisher.publish_report(runner, "2026-09-18", "main")
    assert git(remote, "rev-parse", "main") == before
