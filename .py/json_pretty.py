import json
import sys

ary = []
for line in sys.stdin:
    ary.append(line)

print(json.dumps(json.loads("\n".join(ary)), indent=4, sort_keys=True))
