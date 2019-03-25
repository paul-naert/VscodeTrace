import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient';
import * as fs  from 'fs';
import { DefinitionLink, DefinitionRequest, TextDocument, TextDocumentPositionParams, TextDocumentIdentifier, LocationLink, DeclarationRequest, ReferencesRequest, ReferenceParams, ReferenceContext, CodeLens, TypeDefinitionRequest, RequestType } from 'vscode-languageclient';
import * as child from 'child_process';
import { TraceCodeLensProvider } from './codelens';
import {TraceDataProvider} from "./treeDataProvider"
import { dirname } from 'path';

const filePattern: string = '**/*.{' +
['cpp', 'c', 'cc', 'cxx', 'c++', 'm', 'mm', 'h', 'hh', 'hpp', 'hxx', 'inc'].join() + '}';

const cwd = "/home/pn/tests/c-lttng/gdb/";
const linesFileName = "lines.gdb";
const linesFilePath = cwd + linesFileName;
const gdbScript = cwd + "launch-python.gdb"

/**
 * Method to get workspace configuration option
 * @param option name of the option (e.g. for clangd.path should be path)
 * @param defaultValue default value to return if option is not set
 */
function getConfig<T>(option: string, defaultValue?: any): T {
    const config = vscode.workspace.getConfiguration('clangd');
    return config.get<T>(option, defaultValue);
}

namespace SwitchSourceHeaderRequest {
export const type =
    new vscodelc.RequestType<vscodelc.TextDocumentIdentifier, string|undefined,
                             void, void>('textDocument/switchSourceHeader');
}
// namespace RangeRequest {
//     export const type =
//         new vscodelc.RequestType<vscodelc.DefinitionRequest,  vscodelc.Location | vscodelc.Location[] | vscodelc.LocationLink[] |null,
//                                  void, void>('textDocument/definition');
//     }
class FileStatus {
    private statuses = new Map<string, any>();
    private readonly statusBarItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

    onFileUpdated(fileStatus: any) {
        const filePath = vscode.Uri.parse(fileStatus.uri);
        this.statuses.set(filePath.fsPath, fileStatus);
        this.updateStatus();
    }

    updateStatus() {
        const path = vscode.window.activeTextEditor.document.fileName;
        const status = this.statuses.get(path);
        if (!status) {
          this.statusBarItem.hide();
          return;
        }
        this.statusBarItem.text = `clangd: ` + status.state;
        this.statusBarItem.show();
    }

    clear() {
        this.statuses.clear();
        this.statusBarItem.hide();
    }

    dispose() {
        this.statusBarItem.dispose();
    }
}

class TextDocumentPosition implements TextDocumentPositionParams{
    position : vscode.Position
    textDocument : TextDocumentIdentifier
    constructor(uri : string){
        this.position = vscode.window.activeTextEditor.selection.active;
        this.textDocument = TextDocumentIdentifier.create(uri)
    }
}

class Context implements ReferenceContext{
	includeDeclaration : boolean
	constructor(includeDecl : boolean){
		this.includeDeclaration = includeDecl
	}
}
class ReferenceParam implements ReferenceParams{
    position : vscode.Position
    textDocument : TextDocumentIdentifier
	context : vscode.ReferenceContext
	constructor(uri : string, includeDecl : boolean){
        this.position = vscode.window.activeTextEditor.selection.active;
		this.textDocument = TextDocumentIdentifier.create(uri)
		this.context = new Context(includeDecl)
    }
}

class GDB {
	gdbpath : string
	launchScript : string
	gdbProcess : child.ChildProcess
	binary : string
	constructor( path : string, bin : string, script : string){
		this.gdbpath = path;
		this.launchScript = script;
		this.binary = bin;
	}
	public instantiate(linesFile : string, varname : string){
        fs.writeFileSync(this.launchScript,"source gdblogger.py \n\
source trace-segfault.py\n\
start\n\
trace-segfault " + varname + ' ' + linesFile + '\nc')
        console.log(child.execSync("cd /home/pn/tests/c-lttng/gdb;" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
    }
    public can_insert(linesFile : string){
        fs.writeFileSync(this.launchScript,
            "source trace-segfault.py\n\
can_insert_file " + linesFile);
        console.log(child.execSync("cd /home/pn/tests/c-lttng/gdb;" + this.gdbpath + " " + this.binary + " -x " + this.launchScript).toString());
        
        
    }
}
export interface TPID{
    occurence : number
    before : boolean
}


export function toFile(line : number) : string {
    return  cwd + "log_line_"+(line);
}
export function getLinesFile() :string {
    return linesFilePath;
}
function filterLines (refs : vscodelc.Location[]) : Map<number,TPID[]> {
    var tplines = new Map<number,TPID[]>()
    
	// +1 is because refs lines start at 0
	for (const loc of refs) {
        let line_before = loc.range.start.line;
        if (tplines.has(line_before)){
            tplines.get(line_before).push(
                {occurence : line_before,before : true}
           )
        }
        else{
            tplines.set(line_before,[{occurence : line_before,before : true}])
        }
        let line_after = loc.range.start.line + 1;
        if (tplines.has(line_after)){
            tplines.get(line_after).push(
                {occurence : line_before,before : false}
           )
        }
        else{
            tplines.set(line_after,[{occurence : line_before,before : false}])
        }
	}
	return tplines;
}
function insert(tpid : TPID ,lines : Map<number,TPID[]>, new_line :number){

    if(lines.has(new_line)){
        lines.get(new_line).push(tpid);
    }
    else{
        lines.set(new_line,[tpid]);
    }
}
function where_before(tpid : TPID ,lines : Map<number,TPID[]>, backup :number) : number{
    let bestLine = -1;
    for(let lineWithTP of lines.keys()){
        if (lineWithTP<tpid.occurence && lineWithTP>bestLine){
            bestLine = lineWithTP;
        }
    }
    if (bestLine == -1){
        bestLine = backup
    }
    return bestLine;
}
function parse_new_lines(linesFile : string, lines : Map<number,TPID[]>) : Map<number,TPID[]>{
    let file_content = fs.readFileSync(linesFile)
    let string_content = file_content.toString().split('\n')
    let setDelete = true;
    for (let line of string_content){
        let lineSplit = line.split(' ') // line cannot be traced at the start
        if(lineSplit.length>1){
            for(let tpid of lines.get(+lineSplit[0]-1)){
                let new_line = +lineSplit[1]-1;
                if (tpid.before){
                    new_line = where_before(tpid,lines,new_line);
                }
                if(+lineSplit[0]-1==new_line){
                    setDelete = false;
                    continue;
                }
                insert(tpid,lines,new_line);
                
            }
            if(setDelete){
                lines.delete(+lineSplit[0]-1);
            }
            setDelete = true;
        }
    }
    return lines
}
function displayPossibleTracepoints(refs : vscodelc.Location[], gdbLinesFile : string, gdb : GDB) : number[]{
    var lines = filterLines(refs);
    fs.writeFileSync(gdbLinesFile,""); //clear file
	for (const line of lines.keys()){
		fs.appendFileSync(gdbLinesFile,(line+1) + '\n');
    }
    gdb.can_insert(gdbLinesFile);
    lines = parse_new_lines(gdbLinesFile,lines);

    vscode.languages.registerCodeLensProvider(
            [{ scheme: 'file', pattern: filePattern }]
            ,new TraceCodeLensProvider(lines)
        );

	return [];
}
function findExecutables(currentDirectory : string) : string[]{
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
function cleanFolder(currentDirectory : string){
    let files = fs.readdirSync(currentDirectory);
    for (let file of files){
        if(file.slice(0,4)=="log_"){
            fs.unlinkSync(currentDirectory + file);
        }
        if(file == linesFileName || cwd+file == gdbScript){
            fs.unlinkSync(currentDirectory + file);
        }
    }
}
/**
 *  this method is called when your extension is activate
 *  your extension is activated the very first time the command is executed
 */
export function activate(context: vscode.ExtensionContext) {
    const syncFileEvents = getConfig<boolean>('syncFileEvents', true);

    const clangd: vscodelc.Executable = {
        command: getConfig<string>('path'),
        args: getConfig<string[]>('arguments')
    };
    const traceFile = getConfig<string>('trace');
    if (!!traceFile) {
        const trace = { CLANGD_TRACE: traceFile };
        clangd.options = { env: { ...process.env, ...trace } };
    }
    const serverOptions: vscodelc.ServerOptions = clangd;

    const clientOptions: vscodelc.LanguageClientOptions = {
        // Register the server for C/C++ files
        documentSelector: [{ scheme: 'file', pattern: filePattern }],
        synchronize: !syncFileEvents ? undefined : {
            fileEvents: vscode.workspace.createFileSystemWatcher(filePattern)
        },
        initializationOptions: { clangdFileStatus: true },
        // Resolve symlinks for all files provided by clangd.
        // This is a workaround for a bazel + clangd issue - bazel produces a symlink tree to build in,
        // and when navigating to the included file, clangd passes its path inside the symlink tree
        // rather than its filesystem path.
        // FIXME: remove this once clangd knows enough about bazel to resolve the
        // symlinks where needed (or if this causes problems for other workflows).
        uriConverters: {
            code2Protocol: (value: vscode.Uri) => value.toString(),
            protocol2Code: (value: string) =>
                vscode.Uri.file(fs.realpathSync(vscode.Uri.parse(value).fsPath))
        },
        // Do not switch to output window when clangd returns output
        revealOutputChannelOn: vscodelc.RevealOutputChannelOn.Info
    };


    const clangdClient = new vscodelc.LanguageClient('Clang Language Server', serverOptions, clientOptions);
    console.log('Clang Language Server is now active!');
    var editor = vscode.window.activeTextEditor!;

    context.subscriptions.push(clangdClient.start());

    context.subscriptions.push(vscode.commands.registerCommand('define', async () =>{
        const uri =
        vscode.Uri.file(vscode.window.activeTextEditor.document.fileName);
        if (!uri) {
        return;
		}
        var tdpp = new TextDocumentPosition(uri.toString());
        const loc = await clangdClient.sendRequest(DeclarationRequest.type,tdpp);
        if (loc instanceof vscode.Location){
            vscode.window.showInformationMessage("Location");
        }
        
        if (LocationLink.is(loc)){
            vscode.window.showInformationMessage("Location");
        }
        var a : DefinitionLink 
        if (loc instanceof Array){
            let a = loc[0]
            if (vscodelc.Location.is(a)){
				vscode.window.showInformationMessage("Location[]");
			}
            if (vscodelc.LocationLink.is(a))
                vscode.window.showInformationMessage("LocationLink[]");
        }
        vscode.window.showInformationMessage(typeof loc);
    }));
    
    cleanFolder(cwd);
    
	context.subscriptions.push(vscode.commands.registerCommand('codelens', async (before : number, after:number) =>{
        let beforelog = toFile(before +1);
        let afterlog = toFile(after +1);
        let beforeValue = +fs.readFileSync(beforelog).toString().split('\n')[0]
        let test2 = fs.readFileSync(afterlog).toString().split('\n')
        let afterValue = +test2[test2.length-2]
        vscode.window.showInformationMessage("First value before : "+ beforeValue+ "\nLast value after : "+afterValue);
    }));
    
	context.subscriptions.push(vscode.commands.registerCommand('segfault-trace', async () =>{
        editor = vscode.window.activeTextEditor!;
        const uri =
            vscode.Uri.file(editor.document.fileName);
		var varname : string
		varname = editor.document.getText(editor.selection);
		var refp : ReferenceParams
		refp = new ReferenceParam(uri.toString(),false)

		const references = await clangdClient.sendRequest(ReferencesRequest.type,refp)
		let gdbpath = "/home/pn/git/binutils-gdb/gdb/gdb"
		let lineFile = linesFilePath
        let binaryPromise = vscode.window.showQuickPick(findExecutables(cwd),{canPickMany:false});
		// let binaryPromise = vscode.window.showInputBox();
		binaryPromise.then((binaryPath : string) => {
            if (binaryPath == "other"){
                let otherBinary = vscode.window.showInputBox();
                otherBinary.then((binaryPath : string) => {
                    let gdb = new GDB(gdbpath, binaryPath, gdbScript);
                    let lines = displayPossibleTracepoints(references, lineFile, gdb);
                    gdb.instantiate(lineFile,varname);
                })
            } else {
                let gdb = new GDB(gdbpath, cwd + binaryPath, gdbScript);
                let lines = displayPossibleTracepoints(references, lineFile, gdb);
                gdb.instantiate(lineFile,varname);
            }
        })
        vscode.commands.executeCommand("refreshTreeView");
    }));
    
    let traceTreeViewProvider = new TraceDataProvider(dirname(editor.document.uri.fsPath))
	vscode.window.registerTreeDataProvider('varTracking', traceTreeViewProvider );
	context.subscriptions.push(vscode.commands.registerCommand('refreshTreeView', () => traceTreeViewProvider.refresh()));

    const status = new FileStatus();
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        status.updateStatus();
    }));
    clangdClient.onDidChangeState(
        ({ newState }) => {
            if (newState == vscodelc.State.Running) {
                // clangd starts or restarts after crash.
                clangdClient.onNotification(
                    'textDocument/clangd.fileStatus',
                    (fileStatus) => { status.onFileUpdated(fileStatus); });
            } else if (newState == vscodelc.State.Stopped) {
                // Clear all cached statuses when clangd crashes.
                status.clear();
            }
        })
}
