import gdb

class TraceSegfault(gdb.Command):
    def __init__(self):
        super(TraceSegfault, self).__init__("recompile", gdb.COMMAND_DATA)
        
    def invoke(self, args, from_tty):
        #execute can_trace commands
        #execute trace commands
        
TraceSegfault()