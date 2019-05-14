import gdb
import tempfile
import os.path
import json

patchCmd = "patch file "

default_compile_args = "-O0 -gdwarf-4 -fPIE -Wall  -Wno-unused-but-set-variable -Wno-unused-variable -fno-stack-protector -w"
tracerConfig = "minitraceConfig.json"

def varFormat(location, varname):
    filename,line = location.split(':')
    names,variableTypes = varType(filename,line,varname)
    formatter = {
        gdb.TYPE_CODE_INT : "int",
        gdb.TYPE_CODE_ARRAY : "pointer",
        gdb.TYPE_CODE_PTR : "pointer",
        gdb.TYPE_CODE_FUNC : "pointer"
    }
    formats = []
    for typecode in variableTypes:
        formats.append(formatter.get(typecode))
    return names,formats

def varType(filename, line, varname):
    symtab = gdb.selected_frame().find_sal().symtab
    if (symtab.filename != os.path.basename(filename)):
        print("warning ! frame selected not correct "+ symtab.filename + " vs " + os.path.basename(filename))
        return [""],[gdb.TYPE_CODE_INT]
    linetable = symtab.linetable()
    trace_pc = linetable.line(int(line))[0].pc
    block = gdb.block_for_pc(trace_pc)
    symbol = gdb.lookup_symbol(varname,block)[0]
    if (symbol == None):
        return [""],[gdb.TYPE_CODE_INT]
    typeStruct = symbol.type
    types = []
    names = []
    if typeStruct.code == gdb.TYPE_CODE_STRUCT:
        fields = typeStruct.fields()
        for field in fields:
            types.append(field.type.code)
            names.append('.'+field.name)
    else :
        types = [typeStruct.code]
        names = [""]
    return names,types


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
        
        if (len(arg_split)<3):
            print("Missing arguments for log command")
            return

        tpType, location, varname = arg_split[0],arg_split[1],arg_split[2]
        # line = location.split(':')[-1]
        tpArgs = varname.split('__')
        if tpType == "count":
            names,varTypes = varFormat(location,tpArgs[0])
            if (varname.count('__')==1):
                tpType += "_secondary"
            else :
                tpType += "_primary"
            for index in range(len(varTypes)):
                structTpArgs = list(tpArgs)
                structTpArgs[0]+=names[index]
                varType = varTypes[index]
                command = ""
                for tracepoint in self.config["tracepoints"]:
                    if(tracepoint["varType"] == varType and tracepoint["tpType"] == tpType):
                        command = tracepoint["tp_trace"]["command"]
                        for index, arg in enumerate(tracepoint["tp_trace"]["args"]):
                            command = command.replace(arg,structTpArgs[index])
                if command == "":
                    continue
                tmp = open(tmpfile.name,"w")
                tmp.write(
                        "#include \""+ self.config["header"] +"\" \n \
                        " + command
                    )
                tmp.close()

                gdb.execute(patchCmd + location + " " + tmp.name)
        else:
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
            tmp = open(tmpfile.name,"w+")
            tmp.write(
                    "#include \""+ self.config["header"] +"\" \n \
                    " + command
                )

            tmp.close()

            gdb.execute(patchCmd + location + " " + tmp.name)
        tmpfile.close()

TraceCommand()

