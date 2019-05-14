import json
import matplotlib.pyplot as plt
import math
data = json.load(open("correct-trace.json"))

total_duration = {}

for tphit in data["traceEvents"]:
    if (tphit["cat"]=="functionDuration"):
        name = tphit["name"]

        if (tphit["ph"]=="B"):
            if name in total_duration:
                total_duration[name][1]=tphit["ts"]
            else:
                total_duration[name]=[0,tphit["ts"]]
        if (tphit["ph"]=="E"):
            if name in total_duration and (total_duration[name][1] != 0):
                total_duration[name]=[total_duration[name][0] + tphit["ts"]-total_duration[name][1],0]
        # if(name == "line_32_to_34"):
        #     print(total_duration[name])

lines = []
values = []
for name, value in total_duration.items():
    strl = name[5:7]
    if strl[1]=='_':
        strl = strl[0:1]
    lines.append(float(strl))
    values.append(float(value[0]))

values = [v for _,v in sorted(zip(lines,values))]

norm = 0
for v in values:
    norm += v

normalisedValues = [v/norm for v in values]

c = []
scale=['g','y','y','r','r','r','r','b','b','b']
for nv in normalisedValues:
    c.append(scale[int(nv*len(scale))])



lines.sort()
plt.bar(lines,values,color = c)

plt.show()
