import * as vscode from 'vscode';
import * as fs from 'fs';
import {toFile, getLinesFile} from './extension'
import { Tracepoint } from './trace-manipulation';

export class TraceDataProvider implements vscode.TreeDataProvider<TracedLine> {

	private _onDidChangeTreeData: vscode.EventEmitter<TracedLine | undefined> = new vscode.EventEmitter<TracedLine | undefined>();
	readonly onDidChangeTreeData: vscode.Event<TracedLine | undefined> = this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string) {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TracedLine): vscode.TreeItem {
		return element;
	}

	getChildren(element?: TracedLine): Thenable<TracedLine[]> {
		if (element){
            if (element.contextValue == "logFile"){
                return Promise.resolve(this.getValues(element.line));
            }
            return Promise.resolve([]);
        } else {
            if(fs.existsSync(getLinesFile())){
                return Promise.resolve(this.getTrackedLines());
            }
            return Promise.resolve([]);
        }
    }
    
    getValues(line: number): TracedLine[] {
        let a = toFile(line)
        let content = fs.readFileSync(toFile(line)).toString().split('\n');
        if(content.length > 1000){
            vscode.window.showWarningMessage("The log file has more than 1000 entries : this may take a while")
        }
        let valueArray: TracedLine[] = []
        for (let value of content) {
            if (value == "") {
                continue;
            }
            valueArray.push(
                new TracedLine(
                    "value",
                    line,
                    value,
                    vscode.TreeItemCollapsibleState.None
                )
            )
        }
        return valueArray;
    }

    getTrackedLines() : TracedLine[]{
        if (!fs.existsSync(getLinesFile())){
            return [];
        }
        let content = fs.readFileSync(getLinesFile()).toString();
        let lines : Tracepoint[] = JSON.parse(content).lines;
        let valueArray: TracedLine[] = []
        let encountered : number[] = []
        for (let line of lines) {
            let lineIndex = line.corrected;
            if (!line.enabled || encountered.indexOf(lineIndex)!= -1) {
                continue;
            }
            encountered.push(lineIndex);
            valueArray.push(
                new TracedLine(
                    "logFile",
                    lineIndex,
                    "Tracepoint :",
                    vscode.TreeItemCollapsibleState.Collapsed
                )
            );
        }
        return valueArray;
    }

}

export class TracedLine extends vscode.TreeItem {

	constructor(
        type : string,
		public readonly line: number,
		private value: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
	) {
        super(value, collapsibleState);
        this.contextValue = type;
	}

	get tooltip(): string {
        if (this.contextValue == "logFile"){
            return "Traced variable states on line "+this.line;
        }
		return `Value at line ${this.line}: `+ this.value;
	}

	get description(): string {
        if (this.contextValue == "logFile"){
            return this.line.toString();
        }
        return "";
	}

	iconPath = "dep.svg";


}