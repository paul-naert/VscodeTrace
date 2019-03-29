import gdb
from tempfile import mkstemp
from shutil import move
from os import fdopen, remove,path
import json

logCmd = "minitrace "
canCmd = "can_insert "

def correct(line):
    last = line.split(' ')[-1]
    if(last[-1]=="\n"):
        last = last[:-1]
    return last 

class TraceSegfault(gdb.Command):
    def __init__(self):
        super(TraceSegfault, self).__init__("trace-segfault", gdb.COMMAND_DATA)
        
    def invoke(self, args, from_tty):
        #execute trace commands
        if (args == None):
            print("Argument missing for trace-segfault command")
            return
        linesFile = args
        #fh, abs_path = mkstemp()
        abs_path = "/home/pn/tests/clangd/clangd-vscode/example/test0.c"
        gdb.execute("fcompile file main start-snippet.c")
        with open(linesFile) as fLines:
            with open(abs_path,"w") as final:
                final.write("#include \"/home/pn/tests/clangd/clangd-vscode/example/minitrace.h\" \n ")
                data = json.load(fLines)
                sourceFile = data["source"]
                varnames = data["varnames"]["data"]
                linemax = 0
                for varname in varnames:
                    lines = varname["lines"]
                    for line in lines:
                        if (line["enabled"]):
                            idField = varname["varname"]
                            # logFile = "log_"+ path.basename(sourceFile) +"_line_"+ str(line["corrected"])
                            print(logCmd + sourceFile + ':' + str(line["corrected"]) + ' ' + idField)
                            gdb.execute(logCmd + sourceFile + ':' + str(line["corrected"]) + ' ' + idField) 
                            linemax = 39 #max([linemax,line["corrected"]])
                            # final.write("MTR_FINISH(\"varTracking\", \""+idField+"\", 0);\n")                
                final.write("mtr_flush();\n")
                final.write("mtr_shutdown();\n ")
            #can trace linemax +1?
            linemax+=1
            gdb.execute("fcompile file "+ str(linemax) +" "+ abs_path) 
            
        


def parse_response(response):
    space_split = response.split(' ')
    return space_split[-1]

class TraceSegfaultCan(gdb.Command):
    def __init__(self):
        super(TraceSegfaultCan, self).__init__("can_insert_file", gdb.COMMAND_DATA)
        
    def invoke(self, args, from_tty):
        #execute can trace commands
        if (args == ""):
            print("Missing argument for can_insert_file command")
            return
        
        lineFile = args
        fh, abs_path = mkstemp()
        # log = open("log.txt","w")
        
        with fdopen(fh,'w') as new_file:
            with open(lineFile) as fLines:
                data = json.load(fLines)
                sourceFile = data["source"]
                varnames = data["varnames"]["data"]
                for varIndex,varname in enumerate(varnames):
                    lines = varname["lines"]
                    topop = []
                    for index, line in enumerate(lines):
                        response = gdb.execute(canCmd + sourceFile + ':' + str(line["original"]),False,True)
                        new_line = correct(response)
                        if (new_line == "jump"):
                            topop.append(index)
                            continue
                        if(len(response.split('\n'))>=3 or int(new_line)!=line["original"]):
                            line["modified"] = True
                        line["corrected"]= int(new_line) 
                        lines[index] = line
                    varname["lines"]=[lines[i] for i in range(len(lines)) if i not in topop]
                    varnames[varIndex]= varname
                data["varnames"]["data"]=varnames
                json.dump(data,new_file)
        #Remove original file
        remove(lineFile)
        #Move new file
        move(abs_path, lineFile)

TraceSegfault()
TraceSegfaultCan()