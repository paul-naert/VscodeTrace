import gdb
import tempfile

class LogCommand(gdb.Command):
    def __init__(self):

        super(LogCommand, self).__init__("log_int", gdb.COMMAND_DATA)

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
        tmp.write(
        "static struct _IO_FILE *fd; \n \
        static int __once__ = 0; \n \
        if (__once__==0) { \n \
            fd = fopen(\"" + log_file + "\",\"w\"); \n \
            __once__ = 1; \n \
        } \n \
        fprintf(fd,\"%d \\n\"," + arg_split[1] + " );")
        tmp.close()

        gdb.execute("set compile-args -O0 -gdwarf-4 -fPIE  -Wno-unused-but-set-variable -Wno-unused-variable-fno-stack-protector -w")
        gdb.execute("break main")
        gdb.execute("run")
    
        gdb.execute("fcompile file " + arg_split[0] + " " + tmp.name)
        tmpfile.close()
        
        

LogCommand()

