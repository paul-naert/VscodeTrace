import * as child from 'child_process';
import * as fs  from 'fs';
import {cwd } from './extension'
const logger = "minitracer.py"
const tracer = "trace-segfault.py"
export class GDB {
	gdbpath : string
	launchScript : string
	gdbProcess : child.ChildProcess
	binary : string
	constructor( path : string, bin : string, script : string){
		this.gdbpath = path;
		this.launchScript = script;
		this.binary = bin;
	}
	public trace(linesFile : string){
        fs.writeFileSync(this.launchScript,"source "+logger+" \n\
source "+tracer+"\n\
start\n\
trace-segfault " + linesFile + '\nc')
        console.log(child.execSync("cd "+ cwd+ ";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
    }

    public can_insert(linesFile : string){
        fs.writeFileSync(this.launchScript,
            "source trace-segfault.py\n\
can_insert_file " + linesFile);
        console.log(child.execSync("cd "+ cwd +";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
    }
}