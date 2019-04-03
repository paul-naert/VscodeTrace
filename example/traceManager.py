import gdb
from tempfile import mkstemp
from shutil import move
from os import fdopen, remove,path
import json

canCmd = "can_insert "

tracerConfig = "minitraceConfig.json"

def correct(line):
    last = line.split(' ')[-1]
    if(last[-1]=="\n"):
        last = last[:-1]
    return last 

def getEndLine():
    
    linetable = gdb.selected_frame().find_sal().symtab.linetable()
    block = gdb.selected_frame().block()
    endline = gdb.selected_frame().find_sal().line
    #Does not work if we add lines! 
    for endline in linetable.source_lines():
        if linetable.line(endline)[0].pc >= block.end:
            break
    return endline
    

class TraceManager(gdb.Command):
    config = {}
    logCmd = ""
    def __init__(self):
        super(TraceManager, self).__init__("traceFile", gdb.COMMAND_DATA)
        traceFile = open(tracerConfig)
        self.config = json.load(traceFile)        
        gdb.execute("set environment LD_PRELOAD "+ self.config["library"])
        self.logCmd = self.config["name"]
        
    def invoke(self, args, from_tty):
        #execute trace commands
        if (args == None):
            print("Argument missing for traceFile command")
            return
        linesFile = args
        finit, init_path = mkstemp()
        ffinal, final_path = mkstemp()


        with fdopen(ffinal,"w") as final:
            #finish tracer (before tracing so that it gets pushed back if other tracepoints are added)
            final.write("#include \""+ self.config["header"] +"\" \n ")
            final.write(self.config["global_finish"])
            linemax=getEndLine()

        gdb.execute("fcompile file "+ str(linemax) +" "+ final_path) 
        #call tracer for each traced line
        with open(linesFile) as fLines:

            data = json.load(fLines)
            sourceFile = data["source"]
            linemax = 0
            if "varnames" in data:
                varnames = data["varnames"]["data"]
                for varname in varnames:
                    lines = varname["lines"]
                    idField = varname["varname"]
                    if (idField == "__flush__"):
                        fflush, flush_path = mkstemp()
                        with fdopen(fflush,"w") as tmp:
                            tmp.write(
                                "#include \"" + self.config["header"] +"\" \n" + self.config["flush"] 
                            )
                        gdb.execute("fcompile file main "+ flush_path)
                    elif(idField[0:7]=="__fun__"):
                        begin = lines[0]["corrected"]
                        end = lines[1]["corrected"]
                        funname = idField.split('__')[2]
                        gdb.execute(self.logCmd + " duration_begin "+ sourceFile + ':' + str(begin) + ' ' + funname)
                        gdb.execute(self.logCmd + " duration_end "+ sourceFile + ':' + str(end) + ' ' + funname)
                    else:
                        for line in lines:
                            if (line["enabled"]):
                                gdb.execute(self.logCmd + " count " + sourceFile + ':' + str(line["corrected"]) + ' ' + idField)
                
                #add tp_finish here

            #initialize tracer (after tracing so that it pushes back other tracepoints at the same location)
            with fdopen(finit,"w") as tmp:
                tmp.write(
                    "#include \"" + self.config["header"] +"\" \n" + self.config["global_init"] 
                )
            gdb.execute("fcompile file main "+ init_path)
            
        


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

TraceManager()
TraceSegfaultCan()