"""Generate the frontend catalog from the backend canonical catalog."""
import argparse
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument("--check",action="store_true");args=parser.parse_args()
text=json.dumps(json.loads((root/"backend/app/model_catalog.json").read_text(encoding="utf-8")),indent=2)+"\n"
output=root/"frontend/src/lib/model-catalog.json"
if args.check:
    if not output.exists() or output.read_text(encoding="utf-8")!=text: raise SystemExit("Model catalog is out of sync")
else: output.write_text(text, encoding="utf-8")
