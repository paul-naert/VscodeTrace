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
        self.config = json.load(tracerConfig)        
        super(TraceCommand, self).__init__(self.config["name"], gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):

        arg_split = arg.split(' ')
        tmpfile = tempfile.NamedTemporaryFile(suffix=".c")
        tmp = open(tmpfile.name,"w+")
        if (len(arg_split)<2):
            print("Missing arguments for log command")
            return

        location, varname = arg_split[0],arg_split[1]
        # line = location.split(':')[-1]

        command = ""
        tpArgs = []
        if (varname.count('__')==1):
            varType = "int"
            tpType = "secondary"
            tpArgs = varname.split('__')
                    
        else :
            varType = "int"
            tpType = "primary"
            tpArgs = varname.split('__')
        for tracepoint in self.config["tracepoints"]:
            if(tracepoint["type"] == varType and tracepoint["when"] == tpType):
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

