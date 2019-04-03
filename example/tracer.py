import gdb
import tempfile
import os.path
import json

default_compile_args = "-O0 -gdwarf-4 -fPIE -Wall  -Wno-unused-but-set-variable -Wno-unused-variable -fno-stack-protector -w"
tracerConfig = "minitraceConfig.json"

class TraceCommand(gdb.Command):
    config = {}
    def __init__(self):
        new_compile_args = default_compile_args + " -Wno-unused-local-typedefs"
        gdb.execute("set compile-args "+ new_compile_args)
        traceFile = open(tracerConfig)
        self.config = json.load(traceFile)        
        super(TraceCommand, self).__init__(self.config["name"], gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):

        arg_split = arg.split(' ')
        tmpfile = tempfile.NamedTemporaryFile(suffix=".c")
        tmp = open(tmpfile.name,"w+")
        if (len(arg_split)<3):
            print("Missing arguments for log command")
            return

        tpType, location, varname = arg_split[0],arg_split[1],arg_split[2]
        # line = location.split(':')[-1]
        tpArgs = varname.split('__')
        if tpType == "count":
            varType = "int"
            if (varname.count('__')==1):
                tpType += "_secondary"
                # tpArgs.append(location.split(':')[-1])
            else :
                tpType += "_primary"

        if tpType == "duration_begin":
            varType = "none"
        if tpType == "duration_end":
            varType = "none"
        command = ""
        for tracepoint in self.config["tracepoints"]:
            if(tracepoint["varType"] == varType and tracepoint["tpType"] == tpType):
                command = tracepoint["tp_trace"]["command"]
                for index, arg in enumerate(tracepoint["tp_trace"]["args"]):
                    command = command.replace(arg,tpArgs[index])
        tmp.write(
                "#include \""+ self.config["header"] +"\" \n \
                " + command
            )

        # tmp.write(
        # "#include \"/home/pn/tests/clangd/clangd-vscode/example/minitrace.h\" \n \
        # static int __once__ = 0; \n \
        # if (__once__==0) { \n \
        #     MTR_START(\"varTracking\", "+idField+", 0); \n \
        #     __once__ = 1; \n \
        # } \n \
        # char itostr[15]; \n \
        # MTR_STEP(\"varTracking\"," +idField+", 0, "+varname+");")

        tmp.close()

        gdb.execute("fcompile file " + location + " " + tmp.name)
        tmpfile.close()

TraceCommand()

