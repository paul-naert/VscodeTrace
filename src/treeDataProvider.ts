import * as vscode from 'vscode';
import * as fs from 'fs';
import { getLinesFile} from './extension'
import { TraceMetaData } from './traceManipulation';

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

	iconPath = "icons/dep.svg";


}
export class TracedVar extends vscode.TreeItem {

	constructor(
        public readonly line: number,
		public readonly value: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
	) {
        super(value, collapsibleState);
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

	iconPath = "icons/dep.svg";
}


export class TraceDataProvider implements vscode.TreeDataProvider<TracedVar> {

	private _onDidChangeTreeData: vscode.EventEmitter<TracedVar | undefined> = new vscode.EventEmitter<TracedVar | undefined>();
	readonly onDidChangeTreeData: vscode.Event<TracedVar | undefined> = this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string) {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TracedVar): vscode.TreeItem {
		return element;
	}

    getChildren(element?: TracedVar): Thenable<TracedVar[]> {
		if (element){
            return Promise.resolve(this.getLines(element.value));
        } else {
            return Promise.resolve(this.getTrackedVars());
        }
    }
    
    getTrackedVars() : TracedVar[]{
        if (!fs.existsSync(getLinesFile())){
            return [];
        }
        let content = fs.readFileSync(getLinesFile()).toString();
        let metaData : TraceMetaData = JSON.parse(content);
        let valueArray: TracedVar[] = []
        for (let lines of metaData.varnames.data){
            valueArray.push(
                new TracedVar(
                    1,
                    lines.varname,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    {title: "display code lens", command: "refreshCodeLens", arguments : [lines.varname]}
                )
            );
        } 
        return valueArray;
    }

    getLines(varname : string) : TracedVar[]{
        if (!fs.existsSync(getLinesFile())){
            return [];
        }
        let content = fs.readFileSync(getLinesFile()).toString();
        let metaData : TraceMetaData = JSON.parse(content);
        let valueArray: TracedVar[] = [];
        let encountered : number[] = [];
        for (let lines of metaData.varnames.data){
            if(lines.varname == varname){
                for (let line of lines.lines){
                    if(encountered.indexOf(line.corrected)!=-1){
                        continue;
                    }
                    encountered.push(line.corrected);
                    if(line.enabled){
                        valueArray.push(
                            new TracedVar(
                                line.corrected,
                                "" + line.corrected,
                                vscode.TreeItemCollapsibleState.None
                            )
                        );
                    } else {
                        valueArray.push(
                            new TracedVar(
                                line.corrected,
                                "" + line.corrected + " (disabled)",
                                vscode.TreeItemCollapsibleState.None
                            )
                        );
                    }
                    
                }
            }
        } 
        return valueArray;
    }
	// getChildren2(element?: TracedLine): Thenable<TracedLine[]> {
	// 	if (element){
    //         if (element.contextValue == "logFile"){
    //             return Promise.resolve(this.getValues(element.line));
    //         }
    //         return Promise.resolve([]);
    //     } else {
    //         if(fs.existsSync(getLinesFile())){
    //             return Promise.resolve(this.getTrackedLines());
    //         }
    //         return Promise.resolve([]);
    //     }
    // }
    
    // getValues(line: number): TracedLine[] {
    //     let content = fs.readFileSync(toFile(line)).toString().split('\n');
    //     if(content.length > 1000){
    //         vscode.window.showWarningMessage("The log file has more than 1000 entries : this may take a while")
    //     }
    //     let valueArray: TracedLine[] = []
    //     for (let value of content) {
    //         if (value == "") {
    //             continue;
    //         }
    //         valueArray.push(
    //             new TracedLine(
    //                 "value",
    //                 line,
    //                 value,
    //                 vscode.TreeItemCollapsibleState.None
    //             )
    //         )
    //     }
    //     return valueArray;
    // }

    // getTrackedLines() : TracedLine[]{
    //     if (!fs.existsSync(getLinesFile())){
    //         return [];
    //     }
    //     let content = fs.readFileSync(getLinesFile()).toString();
    //     let metaData : TraceMetaData = JSON.parse(content);
    //     let valueArray: TracedLine[] = []
    //     for (let lines of metaData.varnames.data){
    //         let encountered : number[] = []
    //         for (let line of lines.lines) {
    //             let lineIndex = line.corrected;
    //             if (!line.enabled || encountered.indexOf(lineIndex)!= -1) {
    //                 continue;
    //             }
    //             encountered.push(lineIndex);
    //             valueArray.push(
    //                 new TracedLine(
    //                     "logFile",
    //                     lineIndex,
    //                     "Tracepoint :",
    //                     vscode.TreeItemCollapsibleState.Collapsed
    //                 )
    //             );
    //         }
    //     } 
    //     return valueArray;
    // }

}

