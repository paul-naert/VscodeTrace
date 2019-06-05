import json
import sys
import os

traceFile = sys.argv[1]
data = json.load(open(traceFile))
new_data = {}
new_data["traceEvents"] = []
tp_states = {} #state of tracepoints of a particular name
pending ={} # Pending tracepoint for each thread
for tphit in data["traceEvents"]:
    if (tphit["cat"]=="functionDuration"):
        name = tphit["name"]
        tid = tphit["tid"]
        if (tphit["ph"]=="B"):
            #pending is a fix for end of loop tracepoints where we only hit the begin and not the end
            #We suppose that the end is at the beginning of the next instruction unless proven otherwise

            if (tid in pending and pending[tid] != {}):
                pdg = pending[tid]
                dataline={
                    "cat":"functionDuration",
                    "pid":pdg["pid"],
                    "tid":pdg["tid"],
                    "ts":tphit["ts"]-0.001,
                    "ph":"E",
                    "name":pdg["name"],
                    "args":{}
                }

                tp_states[(tid,pdg["name"])][2]=dataline
            if (tid,name) in tp_states and tp_states[(tid,name)][0]==1:
                if (tp_states[(tid,name)][2]=={}):
                    dataline={
                        "cat":"functionDuration",
                        "pid":tphit["pid"],
                        "tid":tid,
                        "ts":tphit["ts"]-0.001,
                        "ph":"E",
                        "name":name,
                        "args":{}
                    }
                else :
                    dataline = tp_states[(tid,name)][2]
                new_data["traceEvents"].append(tp_states[(tid,name)][1])
                new_data["traceEvents"].append(dataline)
                tp_states[(tid,name)]=[1,tphit,{}]

            else:
                tp_states[(tid,name)]=[1,tphit,{}]
            pending[tid] = tphit
        if (tphit["ph"]=="E"):
            if (tid,name) in tp_states and tp_states[(tid,name)][0]==1:
                new_data["traceEvents"].append(tp_states[(tid,name)][1])
                new_data["traceEvents"].append(tphit)
                tp_states[(tid,name)]=[0,{},{}]
                pending ={}
    else:
        new_data["traceEvents"].append(tphit)
correctedFilePath = os.path.join(os.path.dirname(traceFile),"correct-trace.json")
out = open(correctedFilePath, "w")
json.dump(new_data,out)