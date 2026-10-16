"""Start the site:  python -m dgy [--port 8000] [--data-dir PATH] [--host 127.0.0.1]"""
import argparse
import os

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m dgy", description="大观园 · 数二刷题站")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址，局域网访问用 0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--data-dir", help="学习数据目录（默认 data\\）")
    parser.add_argument("--reload", action="store_true", help="改代码后自动重启（开发用）")
    args = parser.parse_args()
    if args.data_dir:
        os.environ["DGY_DATA_DIR"] = args.data_dir
    uvicorn.run("dgy.main:create_app", factory=True, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
