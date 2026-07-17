#!/usr/bin/env python3
"""開發用的本機伺服器。

用法：  python3 serve.py

跟內建的 `python3 -m http.server` 只差一件事：這個會叫瀏覽器「不要快取」。
少了那個標頭，你改完 content.js 重新整理會看到「舊的」畫面，
然後開始懷疑是不是自己改錯了 —— 其實只是瀏覽器拿了舊檔案。

啟動後它會直接印出手機該連的網址。
"""

import http.server
import os
import socket
import socketserver

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


def lan_ip():
    """找出這台 Mac 在 Wi-Fi 上的位址，好讓 iPhone 連得到。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # UDP 的 connect 不會真的送出封包，只是讓系統挑一張網卡出來
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 不要洗版


socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    ip = lan_ip()
    print()
    print("  伺服器開好了，按 Ctrl+C 關掉")
    print()
    print(f"  這台電腦   →  http://localhost:{PORT}")
    print(f"  你的 iPhone →  http://{ip}:{PORT}      （要連同一個 Wi-Fi）")
    print(f"  數學驗算   →  http://localhost:{PORT}/test.html")
    print()
    httpd.serve_forever()
