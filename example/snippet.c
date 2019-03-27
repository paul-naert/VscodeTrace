#include "minitrace.h"
const signed char traceFile[] = "trace.json";
int i;
mtr_init(traceFile);

MTR_META_PROCESS_NAME("minitrace_test");
MTR_META_THREAD_NAME("main thread");

int long_running_thing_1;
int long_running_thing_2;

MTR_START("background", "long_running", &long_running_thing_1);
MTR_START("background", "long_running", &long_running_thing_2);

MTR_BEGIN("main", "outer");
usleep(80000);
for (i = 0; i < 3; i++) {
    MTR_BEGIN("main", "inner");
    usleep(40000);
    MTR_END("main", "inner");
    usleep(10000);
}
MTR_STEP("background", "long_running", &long_running_thing_1, "middle step");
usleep(80000);
MTR_END("main", "outer");

usleep(50000);
MTR_INSTANT("main", "the end");
usleep(10000);
MTR_FINISH("background", "long_running", &long_running_thing_1);
MTR_FINISH("background", "long_running", &long_running_thing_2);

mtr_flush();
mtr_shutdown();