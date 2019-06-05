#include <sys/time.h>
#include <time.h>
#include <stdlib.h>
#include "stdio.h"
#include "unistd.h"

int aux(){
    int a = 1;
    int c = 0;
    for (a = 1; a< 12;a++){
        c+=2;
        printf("c %d \n", c);
    }
    printf("c %d \n", c);
    return 0;
}
int start();

int main(){    
    int a[100000];
    int i;
    struct timeval  tv;
    int count22 = 0;
    gettimeofday(&tv, NULL);
    getchar();

    double time_in_micros = 
         (tv.tv_sec) * 1000*1000 + (tv.tv_usec); // convert tv_sec & tv_usec to millisecond
    srand(time(NULL));
    printf("start time %f \n",time_in_micros);
    for (i=0; i< 100;i++){ // loop 1
        a[i]=1;
        a[i]++;
        count22= count22+2;
    }
    // sleep(15);
    getchar();

    for (i= 0; i<100;i++){
        //loop 2
        a[i%1000]++;
    }
    aux();
    
    gettimeofday(&tv, NULL);
    double time_end = (tv.tv_sec) * 1000*1000 + (tv.tv_usec);
    printf("end time %f \n",time_end);
    printf("length in us %f \n", time_end - time_in_micros );
    start();

}
