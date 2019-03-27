import gdb
import tempfile
import os.path
default_compile_args = "-O0 -gdwarf-4 -fPIE -Wall  -Wno-unused-but-set-variable -Wno-unused-variable -fno-stack-protector"

def varFormat(filename, line, varname):
    variableType = varType(filename,line,varname)
    formatter = {
        gdb.TYPE_CODE_INT : "%d",
        gdb.TYPE_CODE_ARRAY : "%p",
        gdb.TYPE_CODE_PTR : "%p",
        gdb.TYPE_CODE_FUNC : "%p"
    }
    return '"' + formatter.get(variableType)+ "\\n\","+varname 

def varType(filename, line, varname):
    
    symtab = gdb.selected_frame().find_sal().symtab
    if (symtab.filename != os.path.basename(filename)):
        print("warning ! frame selected not correct "+ symtab.filename + " vs " + os.path.basename(filename))
        return gdb.TYPE_CODE_INT 
    linetable = symtab.linetable()
    trace_pc = linetable.line(int(line))[0].pc
    block = gdb.block_for_pc(trace_pc)
    symbol = gdb.lookup_symbol(varname,block)[0]
    if (symbol == None):
        return gdb.TYPE_CODE_INT 
    typeStruct = symbol.type
    return typeStruct.code
    
class LogCommand(gdb.Command):
    def __init__(self):
        new_compile_args = default_compile_args + " -Wno-unused-local-typedefs"
        gdb.execute("set compile-args "+ new_compile_args)
        super(LogCommand, self).__init__("log_var", gdb.COMMAND_DATA)

    def invoke(self, arg, from_tty):

        arg_split = arg.split(' ')
        tmpfile = tempfile.NamedTemporaryFile(suffix=".c")
        tmp = open(tmpfile.name,"w+")
        if (len(arg_split)<2):
            print("Missing arguments for log command")
            return
        if (len(arg_split)>2):
            log_file = arg_split[2]
        else:
            log_file = "log.txt"
        location, varname = arg_split[0],arg_split[1]
        split = location.split(':')
        filename = ""
        if(len(split)>1):
            filename = split[0]
        line = split[-1]
        traceFormat = varFormat(filename, line, varname)
        tmp.write(
        "static struct _IO_FILE *fd; \n \
        static int __once__ = 0; \n \
        if (__once__==0) { \n \
            fd = fopen(\"" + log_file + "\",\"w\"); \n \
            __once__ = 1; \n \
        } \n \
        fprintf(fd,"+ traceFormat + " );")
        tmp.close()

        gdb.execute("set compile-args -O0 -gdwarf-4 -fPIE  -Wno-unused-but-set-variable -Wno-unused-variable-fno-stack-protector -w")
    
        gdb.execute("fcompile file " + location + " " + tmp.name)
        tmpfile.close()

LogCommand()

