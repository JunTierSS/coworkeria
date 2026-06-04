"""Captura screenshots automáticos de la UI para el README."""
import sys
from playwright.sync_api import sync_playwright
from pathlib import Path
import time

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

URL = "http://localhost:3000"


def shot(page, name: str, force_dark: bool = False):
    page.wait_for_load_state("networkidle")
    if force_dark:
        page.evaluate("document.documentElement.classList.add('dark')")
    else:
        page.evaluate("document.documentElement.classList.remove('dark')")
    time.sleep(0.8)
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"  + {path.relative_to(OUT.parent)}")


def get_theme(page):
    return page.evaluate("document.documentElement.classList.contains('dark') ? 'dark' : 'light'")


def ensure_theme(page, target: str):
    """Click el toggle hasta que el theme coincida (usa el aria-label del boton)."""
    for _ in range(3):
        if get_theme(page) == target:
            return
        page.locator('[aria-label="Cambiar tema"]').click()
        time.sleep(0.4)


def ask_and_wait(page, pregunta: str):
    page.fill("textarea", pregunta)
    page.locator("textarea").press("Enter")
    page.wait_for_selector("details summary", timeout=90000)
    time.sleep(2)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()

        # --- LIGHT MODE ---
        page.goto(URL + "/")
        page.wait_for_load_state("networkidle")
        ensure_theme(page, "light")
        time.sleep(1.5)
        shot(page, "01-documentos-light", force_dark=False)

        page.goto(URL + "/chat")
        page.wait_for_load_state("networkidle")
        ensure_theme(page, "light")
        time.sleep(0.5)
        ask_and_wait(page, "Cuales son los principios de diseno del producto?")
        ensure_theme(page, "light")
        shot(page, "02-chat-light", force_dark=False)

        # --- DARK MODE ---
        ensure_theme(page, "dark")
        # Volver a documentos en dark
        page.goto(URL + "/")
        page.wait_for_load_state("networkidle")
        ensure_theme(page, "dark")
        time.sleep(1.5)
        shot(page, "03-documentos-dark", force_dark=True)

        page.goto(URL + "/chat")
        page.wait_for_load_state("networkidle")
        ensure_theme(page, "dark")
        time.sleep(0.5)
        ask_and_wait(page, "Que garantias de privacidad ofrece el sistema?")
        ensure_theme(page, "dark")
        shot(page, "04-chat-dark", force_dark=True)

        # --- MOBILE ---
        ctx_mobile = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        )
        page_m = ctx_mobile.new_page()
        page_m.goto(URL + "/chat")
        page_m.wait_for_load_state("networkidle")
        time.sleep(1)
        ask_and_wait(page_m, "Que es CoWorkerIA?")
        shot(page_m, "05-chat-mobile")

        browser.close()
        print(f"\nOK {len(list(OUT.glob('*.png')))} screenshots en docs/screenshots/")


if __name__ == "__main__":
    main()
