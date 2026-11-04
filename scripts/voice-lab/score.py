"""Scores every take of each voice with UTMOS (predicted listener rating of naturalness, 1-5), averages the takes
(Piper adds randomness, so one take is not enough) and prints a ranked table."""
import json, sys, glob, os, statistics
import wave
import numpy as np
import torch, torchaudio


def load(path):
    with wave.open(path) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        return torch.from_numpy(x).unsqueeze(0), w.getframerate()


predictor = torch.hub.load("tarepan/SpeechMOS:v1.2.0", "utmos22_strong", trust_repo=True, verbose=False)


def score(path):
    wav, sr = load(path)
    wav = torchaudio.functional.resample(wav, sr, 16000)
    with torch.no_grad():
        return float(predictor(wav, 16000)[0])


rows = []
for meta_path in sorted(glob.glob(os.path.join(sys.argv[1], "*.json"))):
    if meta_path.endswith("results.json"):
        continue
    meta = json.load(open(meta_path))
    base = meta_path[:-5]
    polished = [score(p) for p in sorted(glob.glob(base + "*.wav")) if not p.endswith(".raw.wav")]
    raw = [score(p) for p in sorted(glob.glob(base + "*.raw.wav"))]
    meta["utmos"] = round(statistics.mean(polished), 3)
    meta["utmos_sd"] = round(statistics.pstdev(polished), 3)
    meta["raw"] = round(statistics.mean(raw), 3)
    meta["n"] = len(polished)
    rows.append(meta)
rows.sort(key=lambda r: -r["utmos"])
print(f"{'voice':42} {'UTMOS':>6} {'±':>5} {'raw':>6} {'n':>2} {'speed':>6} {'MB':>5}")
for r in rows:
    print(f"{r['key']:42} {r['utmos']:6.2f} {r['utmos_sd']:5.2f} {r['raw']:6.2f} {r['n']:2} {r['speed']:5.1f}x {r['mb']:5.0f}")
print(f"average: polished {statistics.mean(r['utmos'] for r in rows):.3f}, raw {statistics.mean(r['raw'] for r in rows):.3f} over {len(rows)} voices")
json.dump(rows, open(os.path.join(sys.argv[1], "results.json"), "w"), indent=1)
