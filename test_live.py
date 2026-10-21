from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()

    page.on("request", lambda request: print(f"REQUEST: {request.url}"))
    page.on("response", lambda response: print(f"RESPONSE {response.status}: {response.url}"))
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

    print("Navigating to live app...")
    page.goto("https://truckers-maps.onrender.com/")
    page.wait_for_timeout(5000)
    browser.close()
