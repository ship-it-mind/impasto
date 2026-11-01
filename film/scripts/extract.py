# /// script
# dependencies = ["numpy", "pillow", "opencv-python-headless"]
# ///
"""Pulls the real run off the database, read-only, into public/stills and src/data.json. Nothing here is made up."""
import io, json, sqlite3, sys
from pathlib import Path
import cv2, numpy as np
from PIL import Image
ROOT = Path(__file__).parent.parent
DB = ROOT.parent / "backend/output/impasto.db"
PIECE, RUN = "10c01e4a55da4d779608161a7786d83d", "concepts-b70a0698"
c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
img = lambda o, n: c.execute("select data from images where owner=? and name=?", (o, n)).fetchone()[0]
out = ROOT / "public/stills"
for n, f in [("concept-1-muse.png","c1.jpg"),("concept-2-muse.png","c2.jpg"),("concept-3-muse.png","c3.jpg"),("concept-4-edit.png","v2.jpg"),("concept-5-edit.png","v3.jpg")]:
    Image.open(io.BytesIO(img(RUN,n))).convert("RGB").save(out/f, quality=95)
open(out/"wall.jpg","wb").write(img(PIECE,"wall.jpg"))
open(out/"bowl.jpg","wb").write(img("20261031T224517Z-40aa","photo.jpg"))
rec = json.loads(c.execute("select record,mockup,chosen from pieces where id=?",(PIECE,)).fetchone()[0])
mock = json.loads(c.execute("select mockup from pieces where id=?",(PIECE,)).fetchone()[0])
run = json.loads(c.execute("select record from runs where id=?",(RUN,)).fetchone()[0])
recipe = json.loads(c.execute("select record from recipes where run=?",(RUN,)).fetchone()[0])
guide = json.loads(c.execute("select record from guides where run=?",(RUN,)).fetchone()[0])
bands = recipe["bands"]
lab = np.array(Image.open(io.BytesIO(img(RUN,"concept-3-layout.png"))).convert("RGB"))[:,:,0]
H,W = lab.shape
pal = np.array([[int(b["mix_hex"][j:j+2],16) for j in (1,3,5)] for b in bands],np.uint8)
Image.fromarray(pal[lab]).save(out/"bandmap.png")
paint = np.array(Image.open(io.BytesIO(img(RUN,"concept-3-muse.png"))).convert("RGB").resize((W,H),Image.LANCZOS))
for i in range(len(bands)):
    m=(lab==i).astype(np.uint8)*255
    Image.fromarray(np.dstack([paint,m])).save(out/f"band-{i}.png")
# The segments really tapped in the run, as a mask.
edit = run["concepts"][3]["edit"]
n,comps = cv2.connectedComponents((lab==lab[int(edit["segments"][0][1]*H),int(edit["segments"][0][0]*W)]).astype(np.uint8))
sel=np.zeros((H,W),bool)
for x,y in edit["segments"]:
    l=lab[int(y*H),int(x*W)]; n,comps=cv2.connectedComponents((lab==l).astype(np.uint8)); sel|=comps==comps[int(y*H),int(x*W)]
sel_u=(cv2.GaussianBlur(sel.astype(np.uint8)*255,(0,0),1.2))
Image.fromarray(np.dstack([np.full((H,W,3),255,np.uint8),sel_u])).save(out/"segment.png")
v2=np.array(Image.open(out/"v2.jpg").convert("RGB").resize((W,H),Image.LANCZOS))
Image.fromarray(np.dstack([v2,sel_u])).save(out/"v2-seg.png")
# tube colours
inv = None
sys.path.insert(0,str(ROOT.parent/"backend"))
from_mix = {}
try:
    from impasto.mixing import PLACEHOLDER_INVENTORY as I
    from_mix={t["name"]:t["hex"] for t in I["tubes"]}
except Exception as e: print("tubes",e)
data = {
 "request": rec["transcript"], "summary": rec["brief"]["summary"], "size": rec["brief"]["piece"], "palette": rec["brief"]["palette"]["colors"],
 "wallFit": rec["brief"].get("wall_fit"), "mockup": mock, "wallSize": list(Image.open(out/"wall.jpg").size),
 "canvasPx": [W,H],
 "concepts":[{"title":x["title"],"idea":x.get("idea") or x.get("composition"),"edit":x.get("edit")} for x in run["concepts"]],
 "totals": recipe["totals"], "materials":{k:recipe["materials"][k] for k in ("buffer_pct",) if k in recipe["materials"]},
 "shopping": recipe["shopping"],
 "bands":[{"name":b["name"],"hex":b["mix_hex"],"target":b["target_hex"],"area":b["area_cm2"],"paint":b["paint_g"],"paste":b["paste_g"],"de":b["delta_e"],"line":b["card"]["recipe_line"],"tubes":[{"name":t["name"],"parts":t["parts"],"grams":t["grams"]} for t in b["tubes"]]} for b in bands],
 "guide":{"overview":guide["overview"],"steps":[{"title":s["title"],"wait":s.get("wait"),"do":s["do"]} for s in guide["steps"]]},
 "tubes": from_mix,
}
(ROOT/"src/data.json").write_text(json.dumps(data,indent=1,ensure_ascii=False))
print(json.dumps({k:data[k] for k in ("request","summary","size","palette","wallFit","mockup","wallSize","totals","tubes")},indent=0,ensure_ascii=False)[:1500])
print([x["title"] for x in data["concepts"]]); print(data["guide"]["overview"]); print(data["shopping"] if not isinstance(data["shopping"],list) else data["shopping"][:3])
# real check-ins
for id,run_,con,rec_ in c.execute("select id,run,concept,record from checkins"):
    r=json.loads(rec_); print(id,run_,{k:r[k] for k in r if k not in("bands","lines")}.keys(), r.get("corners_source"), r.get("corners"), r.get("source"), r.get("lines"))
print(c.execute("select record from questions").fetchall())
