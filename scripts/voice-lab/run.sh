#!/usr/bin/env bash
# Voice lab: every English Piper voice (medium/high), made the app's way, scored with UTMOS.
set -euo pipefail
OUT=${1:-voice-lab-out}; mkdir -p "$OUT" models
HF=https://huggingface.co/rhasspy/piper-voices/resolve/main
curl -sSfL -o voices.json "$HF/voices.json"
python3 - > keys.txt <<'PY'
import json
v = json.load(open("voices.json"))
for k, d in v.items():
    if d["language"]["family"] == "en" and d["quality"] in ("medium", "high") and d["num_speakers"] == 1:
        onnx = [f for f in d["files"] if f.endswith(".onnx")][0]
        print(k, onnx, round(d["files"][onnx]["size_bytes"] / 1e6))
PY
wc -l keys.txt
while read -r key path mb; do
  m="models/$key.onnx"
  curl -sSfL -o "$m" "$HF/$path" && curl -sSfL -o "$m.json" "$HF/$path.json" || { echo "skip $key"; continue; }
  if r=$(timeout 300 bun synth.mjs "$m" "$OUT/$key.wav"); then
    echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); d.update(key='$key', path='$path', mb=$mb); print(json.dumps(d))" > "$OUT/$key.json"
    echo "$key $r"
  else echo "failed $key"; fi
  rm -f "$m"
done < keys.txt
python3 score.py "$OUT"
