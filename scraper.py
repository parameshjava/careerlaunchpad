from playwright.sync_api import sync_playwright
import pandas as pd
from bs4 import BeautifulSoup
import json
import time
import os

LIST_URL = "https://oamdc-apsche.aptonline.in/OAMDC202425/Login/institutereport"
# Detail address comes from this AJAX endpoint (POST {'Code':'<code>'}), not a GET page.
# Response JSON -> Table1[0].ADDRESS1  (discovered from the page's GetDetails() handler).
DETAIL_URL = "https://oamdc-apsche.aptonline.in/OAMDC202425/login/BindData1"


def get_college_data():
    colleges = []

    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Loading college list...")
        page.goto(LIST_URL, wait_until="networkidle")
        time.sleep(3)

        # The list is DataTable #tblStudent. Max page size is 100 (no "All"),
        # so set 100 and paginate via the Next button until it's disabled.
        page.select_option("select[name='tblStudent_length']", "100")
        time.sleep(2)

        seen = set()
        page_num = 0
        while True:
            page_num += 1
            soup = BeautifulSoup(page.content(), 'html.parser')
            tbody = soup.select_one("#tblStudent tbody")
            for row in tbody.find_all('tr'):
                cols = row.find_all('td')
                if len(cols) < 3:
                    continue
                code = cols[1].text.strip()
                if not code or code in seen:
                    continue
                seen.add(code)
                colleges.append({
                    'S.No.': cols[0].text.strip(),
                    'Institute Code': code,
                    'Institute Name': cols[2].text.strip(),
                    'Place': cols[3].text.strip() if len(cols) > 3 else "",
                    'District': cols[4].text.strip() if len(cols) > 4 else "",
                    'Region': cols[5].text.strip() if len(cols) > 5 else "",
                    'Minority': cols[6].text.strip() if len(cols) > 6 else "",
                    'Inst.Type': cols[7].text.strip() if len(cols) > 7 else "",
                    'University Name': cols[8].text.strip() if len(cols) > 8 else "",
                    'Address': '',
                })
            print(f"  page {page_num}: total so far {len(colleges)}")

            next_btn = page.query_selector("#tblStudent_next")
            cls = (next_btn.get_attribute("class") or "") if next_btn else "disabled"
            if not next_btn or "disabled" in cls:
                break
            next_btn.click()
            time.sleep(1.5)

        print(f"Extracted {len(colleges)} colleges. Fetching addresses...")
        print("-" * 40)

        for i, college in enumerate(colleges):
            code = college['Institute Code']
            print(f"[{i + 1}/{len(colleges)}] address for {code}")
            try:
                res = page.request.post(
                    DETAIL_URL,
                    data=json.dumps({"Code": code}),
                    headers={"Content-Type": "application/json"},
                )
                obj = json.loads(res.text())
                if isinstance(obj, str):  # some ASP.NET handlers double-encode JSON
                    obj = json.loads(obj)
                t1 = obj.get("Table1") or []
                college['Address'] = ((t1[0].get("ADDRESS1") or "").strip() or "Not Found") if t1 else "Not Found"
            except Exception as e:
                print(f"  - failed: {e}")
                college['Address'] = "Failed"
            time.sleep(0.2)  # ponytail: gentle throttle; raise if the server 429s

        browser.close()

    if colleges:
        for n, c in enumerate(colleges, 1):
            c['S.No.'] = n
        out = 'college_data.csv'
        pd.DataFrame(colleges).to_csv(out, index=False, encoding='utf-8-sig')
        print("-" * 40)
        print(f"✅ Saved {len(colleges)} colleges to {os.path.abspath(out)}")


if __name__ == '__main__':
    get_college_data()
