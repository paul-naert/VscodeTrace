import json

data = json.load(open("trace.json"))
new_data = {}
new_data["traceEvents"] = []
tp_states = {}
pending ={}
for tphit in data["traceEvents"]:
    if (tphit["cat"]=="functionDuration"):
        name = tphit["name"]
        if (tphit["ph"]=="B"):
            #pending is a fix for end of loop tracepoints where we only hit the begin and not the end
            #We suppose that the end is at the beginning of the next instruction unless proven otherwise

            if (pending != {}):

                dataline={
                    "cat":"functionDuration",
                    "pid":pending["pid"],
                    "tid":0,
                    "ts":tphit["ts"]-0.001,
                    "ph":"E",
                    "name":pending["name"],
                    "args":{}
                }

                tp_states[pending["name"]][2]=dataline
            if name in tp_states and tp_states[name][0]==1:
                if (tp_states[name][2]=={}):
                    dataline={
                        "cat":"functionDuration",
                        "pid":tphit["pid"],
                        "tid":0,
                        "ts":tphit["ts"]-0.001,
                        "ph":"E",
                        "name":name,
                        "args":{}
                    }
                else :
                    dataline = tp_states[name][2]
                new_data["traceEvents"].append(tp_states[name][1])
                new_data["traceEvents"].append(dataline)
                tp_states[name]=[1,tphit,{}]

            else:
                tp_states[name]=[1,tphit,{}]
            pending = tphit
        if (tphit["ph"]=="E"):
            if name in tp_states and tp_states[name][0]==1:
                new_data["traceEvents"].append(tp_states[name][1])
                new_data["traceEvents"].append(tphit)
                tp_states[name]=[0,{},{}]
                pending ={}
        if(name == "line_23_to_25"):
            print(tphit)
            print(tp_states[name])
out = open("correct-trace.json", "w")
json.dump(new_data,out)