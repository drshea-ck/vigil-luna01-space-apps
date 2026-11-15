"""Verify a public static build in isolated Chromium contexts and capture demo frames."""
import argparse
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


def run(base, frames):
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        desktop = browser.new_context(viewport={"width": 1280, "height": 720}, reduced_motion="reduce")
        page = desktop.new_page()
        failures = []
        calls = []
        page.on("response", lambda reply: failures.append(reply.url) if reply.status >= 400 else None)
        page.on("request", lambda request: calls.append(request.url))
        page.on("pageerror", lambda error: failures.append(str(error)))

        def capture(name):
            if frames:
                frames.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=frames / f"{name}.png", animations="disabled")

        assert page.goto(base).status == 200
        expect(page.get_by_role("heading", name="LUNA-01", exact=True)).to_be_visible()
        button = page.get_by_role("group", name="Inspect lander components").get_by_role("button").first
        expect(button).to_be_enabled(timeout=25_000)
        button.click()
        expect(button).to_have_attribute("aria-pressed", "true")
        capture("01-lander")
        page.get_by_role("checkbox", name="Simulate an Earth-link blackout").check()
        expect(page.get_by_text("Simulated offline", exact=False)).to_be_visible()
        for path, title in [
            ("crew", "Crew health"), ("trends", "Physiological trends"),
            ("history", "Event history"), ("crew-map", "Crew Health Map"),
        ]:
            assert page.goto(base + path).status == 200
            expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible()
            if path == "trends":
                page.get_by_role("button", name="7D").click()
                capture("02-trends")
            if path == "crew-map":
                capture("03-map")
        assert page.goto(base + "companion").status == 200
        for mode in ("Doctor", "Nurse", "Psychologist", "Pharmacist"):
            if mode != "Doctor":
                page.get_by_role("button", name="Change specialist").click()
                page.get_by_role("navigation", name="Specialists").get_by_role("button", name=f"{mode} support").click()
            page.get_by_role("button", name="Initialize companion").click()
            expect(page.get_by_role("heading", name=f"{mode} support", exact=True)).to_be_visible()
            expect(page.get_by_text("Deterministic educational demo", exact=False)).to_be_visible()
            expect(page.get_by_text("cannot diagnose, prescribe or give treatment instructions", exact=False)).to_be_visible()
            question = page.get_by_role("textbox", name="Medical question")
            question.fill("How does sleep change during spaceflight? Visitor-only example.")
            if mode == "Pharmacist":
                page.get_by_role("button", name="Record question").click()
                expect(page.get_by_text("abstains from medication guidance", exact=False)).to_be_visible()
            else:
                page.get_by_role("button", name="Ask Medical Companion").click()
                expect(page.get_by_text("NASA evidence selected", exact=True)).to_be_visible()
                if mode == "Doctor":
                    page.locator(".companion-reply details summary").first.click()
                    source = page.get_by_role("link", name="NASA original").first
                    expect(source).to_be_visible()
                    host = urlsplit(source.get_attribute("href")).hostname
                    assert host == "nasa.gov" or host.endswith(".nasa.gov")
                    capture("04-evidence")
        assert not desktop.cookies()
        assert not [url for url in calls if urlsplit(url).path.startswith("/api/")], calls
        assert not failures, failures

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
        fallback = mobile.new_page()
        fallback.add_init_script("""
            const context = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
                return kind.startsWith('webgl') ? null : context.call(this, kind, ...args);
            };
        """)
        assert fallback.goto(base).status == 200
        expect(fallback.get_by_text("Showing a still render.", exact=False)).to_be_visible()
        assert fallback.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert fallback.goto(base + "companion").status == 200
        fallback.get_by_role("button", name="Initialize companion").click()
        expect(fallback.get_by_role("heading", name="Doctor support", exact=True)).to_be_visible()
        expect(fallback.get_by_text("Visitor-only example.", exact=False)).to_have_count(0)
        assert not mobile.cookies()
        browser.close()
    print("PASS: six direct routes, 3D inspection, mobile fallback, four modes, NASA links, isolated browser state and zero API traffic.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("base")
    parser.add_argument("--frames", type=Path)
    args = parser.parse_args()
    run(args.base.rstrip("/") + "/", args.frames)
