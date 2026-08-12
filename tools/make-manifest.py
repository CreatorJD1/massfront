import hashlib,json,os,sys
root=sys.argv[1]; ver=sys.argv[2]
mf=json.load(open(os.path.join(root,'assets/data/manifest.json')))
files=[]
for p in mf['order']:
    fp=os.path.join(root,p)
    with open(fp,'rb') as src:
        digest=hashlib.sha256(src.read()).hexdigest()
    files.append({'path':'./'+p,'size':os.path.getsize(fp),'sha256':digest})
out={'version':ver,
     'notes':sys.argv[3] if len(sys.argv)>3 else '',
     'base':'', 'files':files}
json.dump(out,open(os.path.join(root,'update.json'),'w'),indent=2)
print('update.json ->',ver,sum(f['size'] for f in files)//1024,'KB')
