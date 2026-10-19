"""Runs convert_to_glb.py once per job (a crash on one model cannot stop the rest) and is resumable:
python3 scripts/library/run_conversions.py jobs.json results.json [blender_path]"""
import json, os, subprocess, sys, tempfile, concurrent.futures as cf
jobs = json.load(open(sys.argv[1])); out = sys.argv[2]
blender = sys.argv[3] if len(sys.argv) > 3 else "/Applications/Blender.app/Contents/MacOS/Blender"
here = os.path.dirname(os.path.abspath(__file__))
done = json.load(open(out)) if os.path.exists(out) else {}
def run(job):
    key = job["dst"]
    if key in done and done[key].get("ok") and os.path.exists(key): return done[key]
    with tempfile.TemporaryDirectory() as t:
        jf, rf = os.path.join(t, "j.json"), os.path.join(t, "r.json")
        json.dump([job], open(jf, "w"))
        p = subprocess.run([blender, "-b", "--python", os.path.join(here, "convert_to_glb.py"), "--", jf, rf],
                           capture_output=True, text=True, timeout=900)
        if os.path.exists(rf): return json.load(open(rf))[0]
        return {"src": job["src"], "dst": key, "ok": False, "error": f"Blender exit {p.returncode} zonder resultaat"}
with cf.ThreadPoolExecutor(3) as ex:
    for r in ex.map(run, jobs):
        done[r["dst"]] = {k: v for k, v in r.items() if k != "trace"}
        json.dump(done, open(out, "w"), indent=1)
print("ok", sum(1 for v in done.values() if v["ok"]), "failed", [k.split("/")[-1] for k, v in done.items() if not v["ok"]])
