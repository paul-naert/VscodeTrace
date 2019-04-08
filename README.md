# VscodeTrace
This VSCode extension is designed to take advantage of the modifications I added to gdb to allow dynamic tracing of a C/C++ program.
It adds a menu in the activity bar and several commands, to allow the addition of fast tracepoints on all the occurence of a variable in a compiled program (with debug symbols).

Currently, I use the minitrace tracing library that I modified a bit.
The configuration file can be changed to accomodate another tracing library.
