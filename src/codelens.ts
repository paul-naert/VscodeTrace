import * as vscode from "vscode";
import {TPID, disableTP} from "./trace-manipulation"

interface Traced{
    before : number;
    after : number;
}
function equals(tp1 : TPID, tp2 : TPID){
    return tp1.occurence===tp2.occurence && tp1.before === tp2.before
}
function find_equal(tp : TPID){
    return (x: TPID)=> {return equals(x,tp)}
}
export class TraceCodeLensProvider implements vscode.CodeLensProvider{
    uri : vscode.Uri 
    tracedEvents = new Map<number,Traced>();
    disabled : TPID[] = []

    constructor(lines : Map<number,TPID[]>, uri : vscode.Uri){
        this.uri = uri;
        for (let line of lines){
            for (let tpid of line[1]){
                if (this.tracedEvents.has(tpid.occurence)){
                    if (tpid.before){
                        this.tracedEvents.set(tpid.occurence,{before : line[0], after : this.tracedEvents.get(tpid.occurence).after})
                    } 
                    else{
                        this.tracedEvents.set(tpid.occurence,{before : this.tracedEvents.get(tpid.occurence).before,  after : line[0]})
                    } 
                }else{
                    if (tpid.before){
                        this.tracedEvents.set(tpid.occurence,{before : line[0], after : -1})
                    } 
                    else{
                        this.tracedEvents.set(tpid.occurence,{before : -1,  after : line[0]})
                    } 
                }
            }
        }
    }
    
    public disable(tracepoint : TPID){
        if(this.disabled.findIndex(find_equal(tracepoint)) != -1){
            this.disabled.splice(this.disabled.findIndex(find_equal(tracepoint)),1);
        }else{
            this.disabled.push(tracepoint);
            if(tracepoint.before){
                disableTP(this.tracedEvents.get(tracepoint.occurence).before);
            }
            else{
                disableTP(this.tracedEvents.get(tracepoint.occurence).after);
            }
        }
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]>{
        const lenses : vscode.CodeLens[] = []
        if (this.uri.fsPath != document.uri.fsPath){
            return lenses;
        }
        for (let event of this.tracedEvents){
            let tpidBefore = {occurence : event[0], before: true}
            if(this.disabled.findIndex(find_equal(tpidBefore)) != -1){
                lenses.push(
                    new vscode.CodeLens(
                        new vscode.Range(
                            new vscode.Position(event[0],1),
                            new vscode.Position(event[0],2)
                        ),
                        ({ title: "before : "+ (event[1].before+1) + "(disabled)", command: "codelens", arguments: [tpidBefore] } as vscode.Command)
                    )
                );
            } else {
                lenses.push(
                    new vscode.CodeLens(
                        new vscode.Range(
                            new vscode.Position(event[0],1),
                            new vscode.Position(event[0],2)
                        ),
                        ({ title: "before : "+ (event[1].before+1), command: "codelens", arguments: [tpidBefore] } as vscode.Command)
                    )
                );
            }
            let tpidAfter = {occurence : event[0], before: false}
            if(this.disabled.findIndex(find_equal(tpidAfter)) != -1){
                lenses.push(
                    new vscode.CodeLens(
                        new vscode.Range(
                            new vscode.Position(event[0],1),
                            new vscode.Position(event[0],2)
                        ),
                        ({ title: "after : "+ (event[1].after+1)+"(disabled)", command: "codelens", arguments: [tpidAfter] } as vscode.Command)
                    )
                );
            } else {
                lenses.push(
                    new vscode.CodeLens(
                        new vscode.Range(
                            new vscode.Position(event[0],1),
                            new vscode.Position(event[0],2)
                        ),
                        ({ title: "after : "+ (event[1].after+1), command: "codelens", arguments: [tpidAfter] } as vscode.Command)
                    )
                );
            }
        }

        return lenses;
    }
}

