"""
Quick test: open a browser, navigate to a URL, capture a screenshot, save it.
No LLM involved. Run from backend/:

    source venv/bin/activate
    python test_screenshot.py
"""

import asyncio
import uuid
from pathlib import Path

from playwright.async_api import async_playwright

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=False)  # system Chrome
        page = await browser.new_page()

        print("Navigating...")
        await page.goto("https://example.com")
        await page.wait_for_load_state("networkidle")

        filename = f"{uuid.uuid4()}.png"
        path = UPLOAD_DIR / filename
        await page.screenshot(path=str(path))

        await browser.close()

    print(f"Saved: {path}")
    print(f"URL:   http://localhost:8000/uploads/{filename}")


asyncio.run(test())
