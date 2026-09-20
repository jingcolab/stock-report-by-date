import os
from pathlib import Path
import re
import shutil
import subprocess

import pytest

from scripts import pdf_drive


def test_missing_chinese_font_does_not_replace_existing_pdf(tmp_path, monkeypatch):
    html, pdf = tmp_path / "report.html", tmp_path / "report.pdf"
    html.write_text("<html><meta charset='utf-8'>每日行情</html>")
    pdf.write_bytes(b"%PDF-existing-report")
    monkeypatch.setattr(pdf_drive.sys, "platform", "linux")
    monkeypatch.setattr(pdf_drive.shutil, "which", lambda _: "/usr/bin/fc-list")
    monkeypatch.setattr(
        pdf_drive.subprocess, "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, stdout="", stderr=""),
    )
    with pytest.raises(RuntimeError, match="中文字体"):
        pdf_drive.render_html_pdf(html, pdf)
    assert pdf.read_bytes() == b"%PDF-existing-report"


def test_chrome_embeds_chinese_glyphs_in_text_and_svg(tmp_path):
    try:
        pdf_drive._find_executable("CHROME_BIN", ("google-chrome-stable", "google-chrome", "chromium", "chromium-browser"))
        pdf_drive._require_chinese_font()
        if not all(shutil.which(tool) for tool in ("pdffonts", "pdftotext")):
            raise RuntimeError("Poppler tools unavailable")
    except RuntimeError as error:
        if os.getenv("REQUIRE_PDF_FONT_TEST") == "1":
            pytest.fail(str(error))
        pytest.skip(str(error))

    html, pdf = tmp_path / "report.html", tmp_path / "report.pdf"
    html.write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
        <style>body {font-family:"Noto Sans CJK SC",sans-serif}</style>
        <h1>每日行情：涨幅前一百名</h1><p>交易日期：2026-09-18</p>
        <svg width="500" height="100"><text x="5" y="40" font-family="sans-serif">中文走势图：机构调研</text></svg>
        </html>''', encoding="utf-8")
    pdf_drive.render_html_pdf(html, pdf)
    fonts = subprocess.check_output(["pdffonts", str(pdf)], text=True)
    assert any(
        "NotoSansCJK" in line.replace("-", "") and re.search(r"\byes\s+yes\s+yes\b", line)
        for line in fonts.splitlines()
    ), fonts
    text = subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"], text=True)
    for expected in ("每日行情", "交易日期", "中文走势图", "机构调研"):
        assert expected in text, text
