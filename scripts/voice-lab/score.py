"""Scores each WAV with UTMOS (predicted listener rating of naturalness, 1-5) and prints a ranked table."""
import json, sys, glob, os
import torch, torchaudio

predictor = torch.hub.load("tarepan/SpeechMOS:v1.2.0", "utmos22_strong", trust_repo=True)
rows = []
for meta_path in sorted(glob.glob(os.path.join(sys.argv[1], "*.json"))):
    meta = json.load(open(meta_path))
    wav, sr = torchaudio.load(meta_path[:-5] + ".wav")
    wav = torchaudio.functional.resample(wav, sr, 16000)
    with torch.no_grad():
        meta["utmos"] = round(float(predictor(wav, 16000)[0]), 3)
    rows.append(meta)
rows.sort(key=lambda r: -r["utmos"])
print(f"{'voice':42} {'UTMOS':>6} {'speed':>6} {'start s':>7} {'MB':>5}")
for r in rows:
    print(f"{r['key']:42} {r['utmos']:6.2f} {r['speed']:5.1f}x {r['startS']:7.1f} {r['mb']:5.0f}")
json.dump(rows, open(os.path.join(sys.argv[1], "results.json"), "w"), indent=1)
