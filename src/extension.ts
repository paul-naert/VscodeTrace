import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient';
// import * as crypto from 'crypto';
// import { TextDocumentIdentifier, ReferencesRequest, ReferenceParams, Disposable } from 'vscode-languageclient';
// import { TraceDataProvider } from "./treeDataProvider";
// import { dirname, basename } from 'path';
import { GDB } from './gdb';
import { Command } from 'vscode-languageclient';
import { findExecutables } from './FSutils';
// import { cleanFolder, findExecutables } from './FSutils';
// import { TraceMetaData, displayPossibleTracepoints, tpMap, listTracableLines } from './traceManipulation';
// import { TraceCodeLensProvider } from './codelens';
// import * as child from 'child_process';

var fs = require('fs');
var ps = require('ps-node');
var util = require('util');

export const filePattern: string = '**/*.{' +
    ['cpp', 'c', 'cc', 'cxx', 'c++', 'm', 'mm', 'h', 'hh', 'hpp', 'hxx', 'inc'].join() + '}';

export const cwd = vscode.workspace.workspaceFolders[0].uri.fsPath+'/';
export const gdbLaunch = cwd + "launch-python.gdb";
export const gdbAttach = cwd + "attach.gdb";
export const gdbDetach = cwd + "detach.gdb";

var gdb : GDB
var mod : GDBModule

var binary = "";
const gdbpath = "/usr/bin/time /home/pn/git/wip/binutils-gdb/gdb/gdb";
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

enum cmdType {
    genericCMD,
    lineCMD
}
export class GDBCommand{
    public type : cmdType;
    public name : string;
    public cmd : string;
}
export class GDBModContent{
    public commands : GDBCommand[];
    public pythonScripts : string[];
    public libraries : string[];
}
class GDBModule {
    private content : GDBModContent;
    constructor (jsonPath : vscode.Uri){
        this.content = JSON.parse(fs.readFileSync(jsonPath.fsPath).toString());
    }
    
    public startGDB(calledCmd : string[], args:string[]) {
        gdb.startGDB(this.content, calledCmd, args);
    }

    public cmdList() : string[]{
        let cmdlist : string[] = [];
        this.content.commands.forEach((command) => {
            cmdlist.push(command.name);
        });
        return cmdlist;
    }

    public runCmd(cmdName : string){
        let cmd : GDBCommand
        let args : string[] = [];
        for (let command of this.content.commands){
            if(command.name == cmdName){
                cmd = command;
                break;
            }
        }
        args.push(vscode.window.activeTextEditor!.document.fileName)
        if(cmd.type == cmdType.lineCMD){
            let editor = vscode.window.activeTextEditor!;
            if(!editor.selection.isSingleLine){
                /* Throw error message ? Or select multiple lines */
                return;
            }
            let line = (editor.selection.start.line + 1).toString();
            args.push(line);
        }
        
        mod.startGDB([cmd.cmd], args);
    }
}
/**
 *  this method is called when your extension is activated
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

    const status = new FileStatus();
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        status.updateStatus();
    }));
    const clangdClient = new vscodelc.LanguageClient('Clang Language Server', serverOptions, clientOptions);
    console.log('Clang Language Server is now active!');

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
    context.subscriptions.push(vscode.commands.registerCommand('detach', async () => {
        if(gdb != undefined)
        {
            gdb.detach();
        }
    }));
    /* MODULAR APP */
    context.subscriptions.push(vscode.commands.registerCommand('load-module', async () => {
        let binaryPromise = vscode.window.showQuickPick(findExecutables(cwd), { canPickMany: false, placeHolder : "binary name"});
        binaryPromise.then(async (binaryPath: string) => {
            if (binaryPath == "other") {
                let otherBinary = vscode.window.showOpenDialog({canSelectFolders : false, canSelectMany : false, openLabel : "Select binary",defaultUri : vscode.Uri.file(cwd)});
                otherBinary.then((binaryUri: vscode.Uri[]) => {
                    binary = binaryUri[0].fsPath;
                })
                await otherBinary;
            } else {
                binary = binaryPath;
            }
            let call_args ="";
            let argsPromise = vscode.window.showInputBox();
            argsPromise.then((args: string) => {
                call_args= args;
                });
            await argsPromise;

            let modulePathPromise = vscode.window.showOpenDialog({canSelectMany : false, defaultUri : vscode.Uri.file(cwd)});
            modulePathPromise.then((modulePaths : vscode.Uri[])=> {
                // vscode.commands.executeCommand("clear");
                gdb = new GDB(gdbpath, binary, call_args, gdbLaunch, gdbAttach, gdbDetach);
                mod = new GDBModule(modulePaths[0]);
            });
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('modCmd', async () => {
        if(mod==undefined){
            return;
        }
        let cmdPromise = vscode.window.showQuickPick(mod.cmdList(), { canPickMany: false, placeHolder : "GDB module command"});
        cmdPromise.then((cmdName)=>{
            mod.runCmd(cmdName);
        });
    }));

    console.log('Clang Language Server is now active!');
    vscode.window.createTerminal();
}
