#include <sys/time.h>
#include <time.h>
#include <stdlib.h>
#include "stdio.h"

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
    int a[1000000];
    int i;
    struct timeval  tv;
    int count = 0;
    gettimeofday(&tv, NULL);

    double time_in_mill = 
         (tv.tv_sec) * 1000 + (tv.tv_usec) / 1000 ; // convert tv_sec & tv_usec to millisecond
    srand(time(NULL));
    printf("start time %f \n",time_in_mill);
    for (i=0; i< 1000;i++){
        a[i]=1;
        a[i]++;
        count= count+2;
    }
    for (i= 0; i<1000;i++){
        //printf("a[%d] : %d \n",i, a[i]);
        a[i]++;
    }
    aux();
    gettimeofday(&tv, NULL);
    double time_end = (tv.tv_sec) * 1000 + (tv.tv_usec) / 1000 ;
    printf("end time %f \n",time_end);
    printf("length in ms %f \n", time_end - time_in_mill );
    start();

}
