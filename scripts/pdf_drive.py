"""Generate PDF deliverables and archive them through the existing Drive gateway."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.apps_script_storage import AppsScriptDriveClient  # noqa: E402


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def _valid_pdf(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 5:
        return False
    with path.open("rb") as handle:
        return handle.read(5) == b"%PDF-"


def _parse_date(value: str) -> str:
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError
    return value


def _find_executable(env_name: str, candidates: tuple[str, ...]) -> str:
    configured = os.getenv(env_name, "").strip()
    if configured:
        resolved = shutil.which(configured) or configured
        if Path(resolved).is_file() or shutil.which(resolved):
            return resolved
        raise RuntimeError(f"{env_name} 指定的程序不存在：{configured}")
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise RuntimeError("未找到所需程序：" + "、".join(candidates))


def _run(command: list[str], label: str) -> None:
    result = subprocess.run(command, text=True, capture_output=True, check=False)
    if result.returncode:
        detail = (result.stderr or result.stdout or "").strip()[-2000:]
        raise RuntimeError(f"{label}失败（退出码 {result.returncode}）：{detail}")


def _require_chinese_font() -> None:
    """Linux Chrome otherwise silently renders Chinese as empty boxes."""
    if not sys.platform.startswith("linux"):
        return
    fontconfig = shutil.which("fc-list")
    if not fontconfig:
        raise RuntimeError("缺少 fontconfig，无法检查 PDF 中文字体；请先安装 fontconfig 和 fonts-noto-cjk")
    result = subprocess.run(
        [fontconfig, ":lang=zh-cn", "family"],
        text=True, capture_output=True, check=False,
    )
    if result.returncode or not result.stdout.strip():
        raise RuntimeError(
            "未找到简体中文字体，已停止生成 PDF，避免输出方框；"
            "请先安装 fonts-noto-cjk 并运行 fc-cache -f"
        )


def render_html_pdf(html_path: Path, pdf_path: Path) -> Path:
    html_path = html_path.resolve()
    pdf_path = pdf_path.resolve()
    if not html_path.is_file():
        raise FileNotFoundError(f"HTML 报告不存在：{html_path}")
    _require_chinese_font()
    browser = _find_executable(
        "CHROME_BIN",
        ("google-chrome-stable", "google-chrome", "chromium", "chromium-browser"),
    )
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.unlink(missing_ok=True)
    _run(
        [
            browser,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--lang=zh-CN",
            "--allow-file-access-from-files",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=10000",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            html_path.as_uri(),
        ],
        "HTML 转 PDF",
    )
    if not _valid_pdf(pdf_path):
        raise RuntimeError(f"浏览器未生成有效 PDF：{pdf_path}")
    return pdf_path



def run_report(args: argparse.Namespace) -> int:
    report_date = _parse_date(args.date)
    pdf_path = render_html_pdf(args.html, args.pdf)
    result: dict[str, Any] = {
        "date": report_date,
        "pdf": str(pdf_path),
        "size_bytes": pdf_path.stat().st_size,
        "sha256": _sha256(pdf_path),
        "drive_status": "not_requested",
        "drive_path": None,
    }
    if args.upload_drive:
        client = AppsScriptDriveClient()
        client.ping()
        upload = client.upload_run_file(
            pdf_path, f"{report_date.replace('-', '')}-stock-report"
        )
        result["drive_status"] = upload["status"]
        result["drive_path"] = upload.get("drive_path")
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="生成 PDF 并上传到 Google Drive")
    subparsers = parser.add_subparsers(dest="command", required=True)

    report = subparsers.add_parser("report", help="把 HTML 报告转为 PDF")
    report.add_argument("--html", type=Path, required=True)
    report.add_argument("--pdf", type=Path, required=True)
    report.add_argument("--date", required=True)
    report.add_argument("--upload-drive", action="store_true")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return run_report(args)


if __name__ == "__main__":
    raise SystemExit(main())
