import * as child from 'child_process';
import * as fs  from 'fs';

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
        fs.writeFileSync(this.launchScript,"source gdblogger.py \n\
source trace-segfault.py\n\
start\n\
trace-segfault " + linesFile + '\nc')
        console.log(child.execSync("cd /home/pn/tests/c-lttng/gdb;" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
    }

    public can_insert(linesFile : string){
        fs.writeFileSync(this.launchScript,
            "source trace-segfault.py\n\
can_insert_file " + linesFile);
        console.log(child.execSync("cd /home/pn/tests/c-lttng/gdb;" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
    }
}