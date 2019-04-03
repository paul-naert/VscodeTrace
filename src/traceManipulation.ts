import * as vscode from 'vscode';
import * as vscodelc from 'vscode-languageclient';
import * as fs  from 'fs';
import { GDB } from './gdb'
import { TraceCodeLensProvider } from './codelens';
import {linesFilePath } from './extension'


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
interface MapData{
    id : string
    varname : string
    lines : Tracepoint[]
}
export class tpMap{
    data : MapData[]
    constructor(data : MapData[]){
        this.data = data;
    }
    public get(name : string) : Tracepoint[]{
        for (let tracedVar of this.data){
            if (tracedVar.varname === name){
                return tracedVar.lines;
            }
        }
        return [];
    }
    public getName(id : string) : string{
        for (let tracedVar of this.data){
            if (tracedVar.id === id){
                return tracedVar.varname;
            }
        }
        return "";
    }
    public add(name : string, hash: string, line : Tracepoint){
        for (let tracedVar of this.data){
            if (tracedVar.varname === name){
                tracedVar.lines.push(line);
                return;
            }
        }
        this.data.push({id : hash, varname: name, lines: [line]});
        return;
    }
}
export class TraceMetaData{
    source : string
    binary : string
    varnames : tpMap

    constructor(source : string, binary : string){
        this.source = source;
        this.binary = binary;
        this.varnames = new tpMap([]);
    }
    populate(varname : string, hash: string, tpids : Map<number,TPID[]>){
        for (const lineNb of tpids.keys()){
            let line = {enabled : true, original: lineNb + 1};
            this.varnames.add(varname,hash,line);
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
        let line_after = loc.range.end.line + 1;
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
            for(let tpid of tpLines.get(tracedLine.original-1)){
                let new_line = tracedLine.corrected -1;
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
export function displayPossibleTracepoints(varname : string, refs : vscodelc.Location[], hash : string, metaData : TraceMetaData, gdb : GDB, uri : vscode.Uri) : TraceCodeLensProvider{
    var tpLines = filterLines(refs);
    if(metaData.varnames.get(varname).length == 0){
        metaData.populate(varname,hash,tpLines);
        fs.writeFileSync(linesFilePath,JSON.stringify(metaData)); 
        gdb.can_insert(linesFilePath);
        
        let linesFileContent = fs.readFileSync(linesFilePath).toString();
        metaData = JSON.parse(linesFileContent);
        metaData.varnames = new tpMap(metaData.varnames.data);
    }

    
    let lines = metaData.varnames.get(varname);
    tpLines = correctTPLines(tpLines,lines);
    let provider = new TraceCodeLensProvider(varname,tpLines,uri);
	return provider;
}

export function switchDisableTP(varname : string, tpLoc : number, metaData : TraceMetaData){

    metaData.varnames.data.forEach((traceData,traceIndex) => {
        if(traceData.varname==varname){
            traceData.lines.forEach((line,index)=> {
                if(line.corrected - 1 === tpLoc){
                    line.enabled = !line.enabled;
                }
                traceData.lines[index]= line;
            });
            metaData.varnames.data[traceIndex] = traceData;
        }
    });
    
    fs.writeFileSync(linesFilePath,JSON.stringify(metaData)); 
}
