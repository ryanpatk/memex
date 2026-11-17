import sys,glob,os
from PIL import Image, ImageDraw, ImageFont
files=sys.argv[2:]; out=sys.argv[1]
cols=2; W=900
tiles=[]
for f in files:
    im=Image.open(f).convert('RGB'); h=int(im.height*W/im.width) if im.width>1000 else int(im.height*(W*0.62)/im.width)
    w=W if im.width>1000 else int(W*0.62)
    tiles.append((os.path.basename(f),im.resize((w,h))))
rows=(len(tiles)+cols-1)//cols; th=max(t[1].height for t in tiles)+30
sheet=Image.new('RGB',(cols*(W+20)+20,rows*th+20),'white'); d=ImageDraw.Draw(sheet)
for i,(n,t) in enumerate(tiles):
    x=20+(i%cols)*(W+20); y=20+(i//cols)*th
    sheet.paste(t,(x,y+24)); d.text((x,y+4),n,fill='black')
sheet.save(out)
