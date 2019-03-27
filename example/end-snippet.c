#include "minitrace.h"
int long_running_thing_1;
int long_running_thing_2;

MTR_FINISH("background", "long_running", &long_running_thing_1);
MTR_FINISH("background", "long_running", &long_running_thing_2);

mtr_flush();
mtr_shutdown();