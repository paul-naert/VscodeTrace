import * as child from 'child_process';
import * as fs  from 'fs';
import {cwd, GDBModContent, GDBCommand } from './extension'
import * as vscode from 'vscode';
/* ADD a load library function AND a load python script routine */
const logger = "/home/pn/tests/VscodeTrace/example/tracer.py"
const tracer = "/home/pn/tests/VscodeTrace/example/traceManager.py"
const patchStorage = ".gdbpatchdata"
export class GDB {
	gdbpath : string
	launchScript : string
	attachScript : string
	detachScript : string
	gdbProcess : child.ChildProcess
	binary : string
	args : string
	constructor( path : string, bin : string, args : string, launch : string, attach : string, detach : string){
		this.gdbpath = path;
		this.launchScript = launch;
		this.attachScript = attach;
		this.detachScript =detach;
		this.binary = bin;
		this.args = args;
	}
// 	public trace(linesFile : string){
//         fs.writeFileSync(this.launchScript,"source "+logger+" \n\
// source "+tracer+"\n\
// start\n\
// traceFile " + linesFile + '\nc')
// 		// console.log(child.execSync("cd "+ cwd+ ";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
// 		child.execSync("cd "+ cwd+ ";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript);	
// 	}

//     public can_insert(linesFile : string){
//         fs.writeFileSync(this.launchScript,
//             "source "+tracer+"\n\
// can_insert_file " + linesFile);
// 		// console.log(child.execSync("cd "+ cwd +";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
// 		child.execSync("cd "+ cwd +";" + this.gdbpath + " " + this.binary + " -x " + this.launchScript);
// 	}
	public startGDB(module : GDBModContent, calledCmd : string[], args:string[]){
		fs.writeFileSync(this.launchScript,
			"#Automatic startup command file\n"+
			"set pagination off\n"+
			"file "+this.binary+"\n"+
			"set args "+this.args+"\n");

		this.preloadLibraries(module.libraries);
		fs.appendFileSync(this.launchScript,
			"start\n");
		this.loadPython(module.pythonScripts);
		this.executeCommands(module.commands, calledCmd, args);
		fs.appendFileSync(this.launchScript,
			"continue\n");
		fs.appendFileSync(this.launchScript,
			"quit\n");

		vscode.window.activeTerminal.sendText(
			"cd "+ cwd +";" + this.gdbpath + " -x " + this.launchScript+"\n");

	}
	public preloadLibraries(libraries : string[]){
		fs.appendFileSync(this.launchScript,
			"set environment LD_PRELOAD = ");
		libraries.forEach(library => {
			fs.appendFileSync(this.launchScript, library);
		});
		fs.appendFileSync(this.launchScript, "\n");
	}

	public loadPython(scripts : string[]){
		scripts.forEach(script => {
			fs.appendFileSync(this.launchScript,
				"source "+script+"\n");
		});           
	}
	public executeCommands(modCmds : GDBCommand[], calledCmd : string[], args : string[]) {
		let i = 0;
		calledCmd.forEach(cmd => {
			let newcmd = cmd.replace("$$", args[i]);
			fs.appendFileSync(this.launchScript, newcmd+"\n");
			i++;
		});
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
	/* Not tracer agnostic ! */
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