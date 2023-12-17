import json
import sys

ary = []
for line in sys.stdin:
    ary.append(line)

parsed = json.loads("\n".join(ary))

for key,vale in parsed.items():
    for v in vale:
        print("icons/" + key + "/"+v)
