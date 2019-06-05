import * as child from 'child_process';
import * as fs  from 'fs';
import {cwd } from './extension'
const logger = "tracer.py"
const tracer = "traceManager.py"
const patchStorage = ".gdbpatchdata"
export class GDB {
	gdbpath : string
	launchScript : string
	attachScript : string
	detachScript : string
	gdbProcess : child.ChildProcess
	binary : string
	constructor( path : string, bin : string, launch : string, attach : string, detach : string){
		this.gdbpath = path;
		this.launchScript = launch;
		this.attachScript = attach;
		this.detachScript =detach;
		this.binary = bin;
	}
	public trace(linesFile : string){
        fs.writeFileSync(this.launchScript,"source "+logger+" \n\
source "+tracer+"\n\
start\n\
traceFile " + linesFile + '\nc')
		// console.log(child.execSync("cd "+ cwd+ ";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
		child.execSync("cd "+ cwd+ ";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript);	
	}

    public can_insert(linesFile : string){
        fs.writeFileSync(this.launchScript,
            "source "+tracer+"\n\
can_insert_file " + linesFile);
		// console.log(child.execSync("cd "+ cwd +";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
		child.execSync("cd "+ cwd +";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript);
	}
	

	public attach(pid:string, linesFile : string){
		fs.writeFileSync(this.attachScript,
"source "+logger+" \n\
source "+tracer+" \n\
attach " + pid +" \n\
load_libtrace \n\
traceFile "+ linesFile + "\n\
patch store "+ patchStorage +"\n\
q\n");
	fs.writeFileSync(this.detachScript,
"attach " + pid + " \n\
patch load " + patchStorage + " \n\
patch delete 0\n\
compile mtr_shutdown();\n\
q\n");

	child.execSync("cd "+ cwd +";" + this.gdbpath + " -x " + this.attachScript);
	}
	
	public detach(){
		child.execSync("cd "+ cwd +";" + this.gdbpath + " -x " + this.detachScript);
	}
}