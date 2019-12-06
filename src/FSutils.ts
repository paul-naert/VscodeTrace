import * as fs  from 'fs';
// import {linesFileName, cwd, gdbLaunch, gdbAttach, gdbDetach} from './extension'

export function findExecutables(currentDirectory : string) : string[]{
    let executables : string[] = [];
    let files = fs.readdirSync(currentDirectory);
    for (let file of files){
        let stat = fs.lstatSync(currentDirectory + file);
        let mode = stat.mode.toString(8);
        if (mode.length==6 && mode[0]=="1" && +mode[4]%2 == 1){ // executable file
            executables.push(file)
        }
    }
    executables.push("other");
    return executables;
}
// export function cleanFolder(currentDirectory : string){
//     let files = fs.readdirSync(currentDirectory);
//     for (let file of files){
//         if(file.slice(0,4)=="log_"){
//             fs.unlinkSync(currentDirectory + file);
//         }
//         if(file == linesFileName || cwd+file == gdbLaunch || cwd+file == gdbDetach || cwd+file == gdbAttach){
//             fs.unlinkSync(currentDirectory + file);
//         }
//     }
// }