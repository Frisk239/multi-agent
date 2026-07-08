"""V2 module path smoke tests for Multica replica prototype."""
import contextlib
import http.server
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

PORT = 8766
PROTOTYPE_DIR = Path(__file__).resolve().parent


@contextlib.contextmanager
def with_server():
    import os

    handler = http.server.SimpleHTTPRequestHandler
    original_cwd = Path.cwd()
    os.chdir(PROTOTYPE_DIR)

    class ReuseHTTPServer(http.server.HTTPServer):
        allow_reuse_address = True

    httpd = ReuseHTTPServer(("127.0.0.1", PORT), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{PORT}"
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)
        os.chdir(original_cwd)


BASE = f"http://127.0.0.1:{PORT}"


def test_v2_paths():
    with with_server():
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_selector(".app-shell", timeout=15000)

            # Sidebar IA
            assert page.locator('[data-nav="inbox"]').count() >= 1
            assert page.locator('[data-nav="my-issues"]').count() >= 1
            assert page.locator('[data-nav="issues"]').count() >= 1
            assert page.locator('[data-nav="agents"]').count() >= 1
            assert page.locator('[data-nav="squads"]').count() >= 1
            assert page.locator('[data-nav="wiki"]').count() >= 1
            assert page.locator('[data-nav="runtime"]').count() >= 1
            assert page.locator('[data-nav="skills"]').count() >= 1
            assert page.locator('[data-nav="settings"]').count() >= 1
            assert page.locator(".kbd-hint:has-text('Ctrl+K')").count() >= 1
            assert page.locator(".working-counter").count() >= 1

            # Inbox 3-column + timeline
            assert page.locator(".inbox-layout").count() >= 1
            assert page.locator(".inbox-item").count() >= 1
            assert page.locator(".timeline-item").count() >= 2
            assert page.locator(".mention-pill").count() >= 1
            assert page.locator("text=FRI-11").count() >= 1

            # My Issues 5-col kanban
            page.locator('[data-nav="my-issues"]').click()
            page.wait_for_timeout(300)
            assert page.locator(".kanban-col").count() == 5
            assert page.locator('[data-col="in_review"] .issue-card:has-text("FRI-11")').count() >= 1
            cards = page.locator(".issue-card")
            count = cards.count()
            assert 6 <= count <= 10, f"Issue count {count} not in 6-10"

            # Workspace Issues board
            page.locator('[data-nav="issues"]').click()
            page.wait_for_timeout(300)
            assert page.locator(".kanban-col").count() == 5

            # Command palette Ctrl+K
            page.keyboard.press("Control+k")
            page.wait_for_timeout(200)
            assert page.locator(".command-palette").count() >= 1
            assert page.locator("#palette-new-issue").count() >= 1
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)

            # New issue modal (agent mode)
            page.locator("#btn-new-issue-sidebar").click()
            page.wait_for_timeout(200)
            assert page.locator(".issue-modal").count() >= 1
            assert page.locator("#btn-switch-mode:has-text('切换到手动')").count() >= 1
            page.locator("#btn-switch-mode").click()
            page.wait_for_timeout(200)
            assert page.locator("#issue-title").count() >= 1
            page.locator("#modal-close").click()
            page.wait_for_timeout(200)

            # Agents list table
            page.locator('[data-nav="agents"]').click()
            page.wait_for_timeout(300)
            assert page.locator(".data-table th:has-text('智能体')").count() >= 1
            assert page.locator(".data-table th:has-text('运行次数')").count() >= 1
            assert page.locator("text=产品·策划队长").count() >= 1

            # Agent detail + 8 tabs
            page.locator("tr[data-agent-id]").first.click()
            page.wait_for_timeout(300)
            assert page.locator(".agent-detail-layout").count() >= 1
            assert page.locator(".detail-tab").count() == 8
            page.locator('[data-agent-tab="instructions"]').click()
            page.wait_for_timeout(200)
            assert page.locator(".detail-tab-content").count() >= 1

            # Squads list + detail
            page.locator('[data-nav="squads"]').click()
            page.wait_for_timeout(300)
            assert page.locator("text=产品小队").count() >= 1
            page.locator("tr[data-squad-id]").first.click()
            page.wait_for_timeout(300)
            assert page.locator(".squad-detail-layout").count() >= 1
            assert page.locator("text=Operating Protocol").count() >= 1
            assert page.locator("text=Roster").count() >= 1

            # Skills table
            page.locator('[data-nav="skills"]').click()
            page.wait_for_timeout(300)
            assert page.locator("#skills-search").count() >= 1
            assert page.locator("#btn-new-skill").count() >= 1
            assert page.locator(".data-table th:has-text('被谁使用')").count() >= 1

            # Settings profile form
            page.locator('[data-nav="settings"]').click()
            page.wait_for_timeout(300)
            assert page.locator(".settings-layout").count() >= 1
            assert page.locator("#profile-name").count() >= 1
            assert page.locator('[data-settings="preferences"]').count() >= 1

            # Runtime machine + table
            page.locator('[data-nav="runtime"]').click()
            page.wait_for_timeout(300)
            assert page.locator(".runtime-layout").count() >= 1
            assert page.locator(".data-table th:has-text('健康度')").count() >= 1
            assert page.locator("text=Claude").count() >= 1

            # Wiki 5 pages
            page.locator('[data-nav="wiki"]').click()
            page.wait_for_timeout(300)
            for title in ["Home", "Architecture", "Synthesis", "Sprint Log", "Glossary"]:
                page.locator(f'button.wiki-node:has-text("{title}")').click()
                page.wait_for_timeout(100)
                assert page.locator(".wiki-article h2, .wiki-article p").count() >= 1, f"Wiki {title} empty"

            # Placeholder pages
            page.locator('[data-nav="projects"]').click()
            page.wait_for_timeout(200)
            assert page.locator("text=Phase 2").count() >= 1

            browser.close()
    print("ALL V2 PATH TESTS PASSED")


if __name__ == "__main__":
    test_v2_paths()
