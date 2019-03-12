import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient';
import * as fs  from 'fs';
import { DefinitionLink, DefinitionRequest, TextDocument, TextDocumentPositionParams, TextDocumentIdentifier, LocationLink, DeclarationRequest, ReferencesRequest, ReferenceParams, ReferenceContext } from 'vscode-languageclient';
import * as child from 'child_process';

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
	constructor( path : string, script : string){
		this.gdbpath = path;
		this.launchScript = script;
	}
	public instantiate(){
		this.gdbProcess = child.exec(this.gdbpath + "-x " + this.launchScript);
	}
}

function filterLines (refs : vscodelc.Location[]) : [number[],number[]] {
	let lines : [number[],number[]]
	for (const loc of refs) {
		if (!(lines[0].includes(loc.range.start.line))){
			lines[0].push(loc.range.start.line);
		} 
		if (!(lines[1].includes(loc.range.end.line))){
			lines[1].push(loc.range.end.line);
		}
	}
	return lines.sort();
}
function displayPossibleTracepoints(refs : vscodelc.Location[]) : [number[],number[]]{
	var lines : [number[],number[]];
	lines = filterLines(refs);
	let gdbCommandFile = "segfault-commands.gdb"
	var command_base = "insert_possible "
	for (const line of lines){
		fs.appendFileSync(gdbCommandFile,command_base + line + '\n');
	}
	return lines;
}

function createTracepointsFile()
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

    const filePattern: string = '**/*.{' +
        ['cpp', 'c', 'cc', 'cxx', 'c++', 'm', 'mm', 'h', 'hh', 'hpp', 'hxx', 'inc'].join() + '}';
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
  const editor = vscode.window.activeTextEditor!;

  context.subscriptions.push(clangdClient.start());
//   context.subscriptions.push(vscode.commands.registerCommand(
//       'clangd-vscode', async () => {
//         const uri =
//             vscode.Uri.file(vscode.window.activeTextEditor.document.fileName);
//         if (!uri) {
//           return;
//         }
//         const docIdentifier =
//             vscodelc.TextDocumentIdentifier.create(uri.toString());
//         const sourceUri = await clangdClient.sendRequest(
//             SwitchSourceHeaderRequest.type, docIdentifier);
//         if (!sourceUri) {
//           return;
//         }
//         const doc = await vscode.workspace.openTextDocument(
//             vscode.Uri.parse(sourceUri));
//         vscode.window.showTextDocument(doc);
//       }));
	
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
            if (vscodelc.Location.is(a))
                vscode.window.showInformationMessage("Location[]");
            if (vscodelc.LocationLink.is(a))
                vscode.window.showInformationMessage("LocationLink[]");
        }
        vscode.window.showInformationMessage(typeof loc);
	}));

	
	context.subscriptions.push(vscode.commands.registerCommand('segfault-trace', async () =>{
		const uri =
        vscode.Uri.file(editor.document.fileName);
		var varname : string
		varname = editor.document.getText(editor.selection);
		var refp : ReferenceParams
		refp = new ReferenceParam(uri.toString(),false)

		const references = await clangdClient.sendRequest(ReferencesRequest.type,refp)
		
		let lines = displayPossibleTracepoints(references);
		let gdbpath = "gdb"
		let gdbScript = "launch-python.gdb"
		let gdb  = new GDB(gdbpath, gdbScript);
		gdb.instantiate();
		
		vscode.window.showInformationMessage(varname);
	}));
	


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
