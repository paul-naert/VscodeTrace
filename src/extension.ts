import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient';
import * as fs from 'fs';
import { TextDocumentIdentifier, ReferencesRequest, ReferenceParams, Disposable } from 'vscode-languageclient';
import { TraceDataProvider } from "./treeDataProvider"
import { dirname, basename } from 'path';
import { GDB } from './gdb'
import { cleanFolder, findExecutables } from './FSutils'
import { TraceMetaData, displayPossibleTracepoints, tpMap } from './traceManipulation'
import { TraceCodeLensProvider } from './codelens';

export const filePattern: string = '**/*.{' +
    ['cpp', 'c', 'cc', 'cxx', 'c++', 'm', 'mm', 'h', 'hh', 'hpp', 'hxx', 'inc'].join() + '}';

export const cwd = vscode.workspace.workspaceFolders[0].uri.fsPath+'/';
export const linesFileName = "lines.json";
export const linesFilePath = cwd + linesFileName;
export const gdbScript = cwd + "launch-python.gdb"
var lensProviderDisposable : Disposable
var lensProviders = new  Map<string,TraceCodeLensProvider>();
var gdb : GDB
var metaData : TraceMetaData
var binary : string = ""
const gdbpath = "/home/pn/git/binutils-gdb/gdb/gdb"

/**
 * Method to get workspace configuration option
 * @param option name of the option (e.g. for clangd.path should be path)
 * @param defaultValue default value to return if option is not set
 */
function getConfig<T>(option: string, defaultValue?: any): T {
    const config = vscode.workspace.getConfiguration('clangd');
    return config.get<T>(option, defaultValue);
}

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

class ReferenceParam implements ReferenceParams {
    position: vscode.Position
    textDocument: TextDocumentIdentifier
    context: vscode.ReferenceContext

    constructor(uri: string, includeDecl: boolean = false) {
        this.position = vscode.window.activeTextEditor.selection.start;
        this.textDocument = TextDocumentIdentifier.create(uri)
        this.context = { includeDeclaration: includeDecl }
    }
}

function updateLensProvider(lensProvider : TraceCodeLensProvider){
    lensProviderDisposable.dispose();
    lensProviderDisposable = vscode.languages.registerCodeLensProvider(
        [{ scheme: 'file', pattern: filePattern }],
        lensProvider
    );
}
export function toFile(line: number): string {
    let fileName = basename(vscode.window.activeTextEditor.document.fileName);
    return cwd + "log_" + fileName + "_line_" + (line);
}
export function getLinesFile(): string {
    return linesFilePath;
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
    
    cleanFolder(cwd);
    context.subscriptions.push(vscode.commands.registerCommand('void', async () => {}));

    context.subscriptions.push(vscode.commands.registerCommand('clear', async () => {
        binary = "";
        lensProviders = new Map<string, TraceCodeLensProvider>();
        if (lensProviderDisposable!=null){
            lensProviderDisposable.dispose();
        }
        gdb = null;
        metaData = null;
        cleanFolder(cwd);
        vscode.commands.executeCommand("refreshTreeView");
    }));

    context.subscriptions.push(vscode.commands.registerCommand('disableTP', async (varname : string, tpLine : number) => {

        lensProviders.get(varname).disableLine(tpLine, metaData);
        updateLensProvider(lensProviders.get(varname));
        vscode.commands.executeCommand("refreshTreeView");
    }));

    context.subscriptions.push(vscode.commands.registerCommand('refreshCodeLens', async (varname : string) => {
        lensProviderDisposable.dispose();
        let lensProvider = lensProviders.get(varname);
        lensProviderDisposable = vscode.languages.registerCodeLensProvider(
            [{ scheme: 'file', pattern: filePattern }],
            lensProvider
        );
    }));

    function resetMetaData(source : string, binary : string){
        metaData = new TraceMetaData(source,binary)
    }
    
    function readMetaData(){
        let linesFileContent = fs.readFileSync(linesFilePath).toString();

        let metaDatatext = JSON.parse(linesFileContent);
        metaData = new TraceMetaData(metaDatatext.source,metaDatatext.binary);
        metaData.varnames = new tpMap(metaDatatext.varnames.data);
    }

    function doDisplay(varname : string, references : vscodelc.Location[], hash : string, uri : vscode.Uri){
        gdb = new GDB(gdbpath, cwd + binary, gdbScript);
        if(metaData == null){
            resetMetaData (uri.fsPath,binary);
        }
        let lensProvider =  displayPossibleTracepoints(varname, references, hash, metaData, gdb, uri);
        lensProvider.setDisabled(metaData);
        lensProviders.set(varname,lensProvider);
        lensProviderDisposable = vscode.languages.registerCodeLensProvider(
            [{ scheme: 'file', pattern: filePattern }],
            lensProvider
        );
        readMetaData();
        vscode.commands.executeCommand("refreshTreeView");
    }


    function getVarname(hash : string) : string{
        let tmpVarname = editor.document.getText(editor.selection);
        if(metaData==null || metaData.varnames.get(tmpVarname).length == 0){
            return tmpVarname;
        }
        let varname = metaData.varnames.getName(hash);
        if (varname != ""){
            return varname;
        }
        let i = 2;
        varname = tmpVarname + "__" + i;
        let other = metaData.varnames.get(varname);
        while(metaData.varnames.get(varname).length > 0){
            i++;
            varname = tmpVarname + "__" + i;
        }
        return varname;
    }

    context.subscriptions.push(vscode.commands.registerCommand('man-tracepoint', async () => {
        editor = vscode.window.activeTextEditor!;
        const uri = vscode.Uri.file(editor.document.fileName);
        
        if(lensProviderDisposable != undefined){
            lensProviderDisposable.dispose();
        }

        let varnamePromise = vscode.window.showInputBox({prompt: "expression to track"});
        varnamePromise.then((varname : string)=>{
            let location : vscodelc.Location = {
                uri : uri.toString(), 
                range : editor.selection
            }
            if(varname[0]=='"'){
                varname = "__fun__"+varname.slice(1,varname.length-1);
            }
            let hash = require('crypto').createHash('sha1').update(JSON.stringify(location)+varname).digest('base64');
            if (binary == ""){
                let binaryPromise = vscode.window.showQuickPick(findExecutables(cwd), { canPickMany: false });
                binaryPromise.then((binaryPath: string) => {
                    if (binaryPath == "other") {
                        let otherBinary = vscode.window.showInputBox();
                        otherBinary.then((binaryPath: string) => {
                            binary = binaryPath;
                        })
                    } else {
                        binary = binaryPath;
                    }
                    doDisplay(varname,[location],hash,uri);
                });
            }
            else {
                doDisplay(varname,[location],hash,uri);
            }    
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('add-tracepoints', async () => {
        editor = vscode.window.activeTextEditor!;
        const uri = vscode.Uri.file(editor.document.fileName);
        var refp = new ReferenceParam(uri.toString(), false)
        
        if(lensProviderDisposable != undefined){
            lensProviderDisposable.dispose();
        }

        const references = await clangdClient.sendRequest(ReferencesRequest.type, refp)
        let jsonRefs = JSON.stringify(references);
        let hash = require('crypto').createHash('sha1').update(jsonRefs).digest('base64');
        var varname = getVarname(hash);
        if (binary == ""){
            let binaryPromise = vscode.window.showQuickPick(findExecutables(cwd), { canPickMany: false, placeHolder : "binary name"});
            // let binaryPromise = vscode.window.showOpenDialog({canSelectFolders : false, canSelectMany : false, openLabel : "Select binary"})
            // binaryPromise.then((binaryUri: vscode.Uri[]) => {
            binaryPromise.then((binaryPath: string) => {
                // let binaryPath = binaryUri[0].fsPath;
                if (binaryPath == "other") {
                    let otherBinary = vscode.window.showOpenDialog({canSelectFolders : false, canSelectMany : false, openLabel : "Select binary"});
                    otherBinary.then((binaryUri: vscode.Uri[]) => {
                        binary = binaryUri[0].fsPath;
                    })
                } else {
                    binary = binaryPath;
                }
                doDisplay(varname,references,hash,uri);
            });
        }
        else {
            doDisplay(varname,references,hash,uri);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('do-trace', async () => {
        if(gdb != undefined){
            gdb.trace(linesFilePath);
            vscode.commands.executeCommand("refreshTreeView");
        }
    }));

    

    let traceTreeViewProvider = new TraceDataProvider(dirname(editor.document.uri.fsPath))
    vscode.window.registerTreeDataProvider('varTracking', traceTreeViewProvider);
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
        }
    )
}
