#include "/home/pn/tests/clangd/clangd-vscode/example/minitrace.h"
const signed char traceFile[] = "trace.json";

mtr_init(traceFile);

MTR_META_PROCESS_NAME("minitrace_test");
MTR_META_THREAD_NAME("main thread");