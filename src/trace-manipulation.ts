import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient';
import * as fs  from 'fs';
import { GDB } from './gdb'
import { TraceCodeLensProvider } from './codelens';
import {filePattern, cwd, linesFilePath } from './extension'
import { Disposable } from 'vscode-languageclient';
import { equal } from 'assert';

export interface TPID{
    occurence : number
    before : boolean
}

export interface Tracepoint{
    enabled : boolean
    original : number
    corrected? : number
    modified? : boolean
}
export class TraceMetaData{
    source : string
    binary : string
    varname : string
    lines : Tracepoint[] = []

    constructor(source : string, binary : string, varname : string){
        this.source = source;
        this.binary = binary;
        this.varname = varname;
    }
    populate(tpids : Map<number,TPID[]>){
        for (const lineNb of tpids.keys()){
            this.lines.push({enabled : true, original: lineNb + 1});
        }
    }
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

function correctTPLines(tpLines : Map<number, TPID[]>,lines : Tracepoint[]) : Map<number, TPID[]> {
    let setDelete = true;
    let encountered :number[] = []
    for (let tracedLine of lines){
        encountered.push(tracedLine.corrected-1);
        if(tracedLine.corrected != null && tracedLine.modified != null){
            let new_line = tracedLine.corrected -1;
            for(let tpid of tpLines.get(tracedLine.original-1)){
                if (tpid.before){
                    new_line = where_before(tpid,tpLines,new_line);
                }
                if(tracedLine.original-1==new_line){
                    setDelete = false;
                    continue;
                }
                insert(tpid,tpLines,new_line);
                
            }
            if(setDelete){
                tpLines.delete(tracedLine.original-1);
            }
        }
        setDelete = true;
    }
    for (let tpLineIndex of tpLines.keys()){
        if(encountered.indexOf(tpLineIndex)==-1 ){
            tpLines.delete(tpLineIndex);
        }
    }
    return tpLines;
}
export function displayPossibleTracepoints(refs : vscodelc.Location[], metaData : TraceMetaData, gdb : GDB, uri : vscode.Uri) : TraceCodeLensProvider{
    var tpLines = filterLines(refs);
    metaData.populate(tpLines);
    
    fs.writeFileSync(linesFilePath,JSON.stringify(metaData)); 
	gdb.can_insert(linesFilePath);
    let linesFileContent = fs.readFileSync(linesFilePath).toString();
    
    let lines = JSON.parse(linesFileContent).lines;
    // lines = parse_new_lines(linesFilePath,lines);
    tpLines = correctTPLines(tpLines,lines);
    let provider = new TraceCodeLensProvider(tpLines,uri);
	return provider;
}

export function disableTP(tpLoc : number){
    let fileContent = fs.readFileSync(linesFilePath).toString();
    let metaData : TraceMetaData = JSON.parse(fileContent);
    metaData.lines.forEach((line,index)=> {
        if(line.corrected - 1 === tpLoc){
            line.enabled = false;
        }
        metaData.lines[index]= line;
    })
    fs.writeFileSync(linesFilePath,JSON.stringify(metaData)); 
}