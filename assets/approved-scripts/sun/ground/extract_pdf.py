import base64
import html
import re


response = html.unescape(open("response.html", encoding="utf-8").read())
match = re.search(r'"data"\s*:\s*"([^"]+)"', response)

if not match:
    raise SystemExit("Could not find PDF data in response.html")

pdf_data = base64.b64decode(match.group(1))
open("report.pdf", "wb").write(pdf_data)
print("Wrote report.pdf")
