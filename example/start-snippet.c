#include "minitrace.h"
const signed char traceFile[] = "trace.json";
int i;
mtr_init(traceFile);

MTR_META_PROCESS_NAME("minitrace_test");
MTR_META_THREAD_NAME("main thread");