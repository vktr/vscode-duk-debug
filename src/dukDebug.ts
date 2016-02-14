"use strict";

import {DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles, Breakpoint} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {readFileSync} from 'fs';
import {basename} from 'path';

/**
 * This interface should always match the schema found in the duk-debug extension manifest.
 */
export interface LaunchRequestArguments {
    /** An absolute path to the program to debug. */
    program: string;
}

class DukDebugSession extends DebugSession {
    private static THREAD_ID = 1;
    
    private _breakpointId = 1000;
    private _currentLine = 0;

    private get currentLine() : number {
        return this._currentLine;
    }

    private set currentLine(line : number) {
        this._currentLine = line;
        this.sendEvent(new OutputEvent(`line: ${line}\n`));
    }

    private _sourceFile : string;
    private _sourceLines = new Array<string>();
    private _breakpoints = new Map<string, DebugProtocol.Breakpoint[]>();
    private _variableHandles = new Handles<string>();

    public constructor() {
        super();

        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);
    }

    protected initializeRequest(response : DebugProtocol.InitializeResponse, args : DebugProtocol.InitializeRequestArguments) : void {
        this.sendEvent(new InitializedEvent());

        response.body.supportsConfigurationDoneRequest = true;
        this.sendResponse(response);
    }
    
    protected launchRequest(response : DebugProtocol.LaunchResponse, args : LaunchRequestArguments) : void {
        this._sourceFile = args.program;
        this.continueRequest(response, { threadId: DukDebugSession.THREAD_ID });        
    }
    
    protected setBreakPointsRequest(response : DebugProtocol.SetBreakpointsResponse, args : DebugProtocol.SetBreakpointsArguments) : void {
        var path = args.source.path;
        var clientLines = args.lines;
        
        response.body = {
            breakpoints: []
        };
        
        this.sendResponse(response);
    }
    
    protected threadsRequest(response : DebugProtocol.ThreadsResponse) : void {
        response.body = {
            threads: [
                new Thread(DukDebugSession.THREAD_ID, "Duktape Thread #1")
            ]
        };
        
        this.sendResponse(response);
    }
    
    protected stackTraceRequest(response : DebugProtocol.StackTraceResponse, args : DebugProtocol.StackTraceArguments) : void {
        const frames = new Array<StackFrame>();
        
        response.body = {
            stackFrames: frames
        };
        
        this.sendResponse(response);
    }
    
    protected scopesRequest(response : DebugProtocol.ScopesResponse, args : DebugProtocol.ScopesArguments) : void {
        const frameReference = args.frameId;
        const scopes = new Array<Scope>();
        
        response.body = {
            scopes: scopes
        };
        
        this.sendResponse(response);
    }
    
    protected variablesRequest(response : DebugProtocol.VariablesResponse, args : DebugProtocol.VariablesArguments) : void {
        const variables = [];
        
        response.body = {
            variables: variables
        };
        
        this.sendResponse(response);
    }
    
    protected continueRequest(response : DebugProtocol.ContinueResponse, args : DebugProtocol.ContinueArguments) : void {
        this.sendResponse(response);
        this.sendEvent(new TerminatedEvent());
    }
    
    protected nextRequest(response : DebugProtocol.NextResponse, args : DebugProtocol.NextArguments) : void {
        this.sendResponse(response);
        this.sendEvent(new TerminatedEvent());
    }
    
    protected evaluateRequest(response : DebugProtocol.EvaluateResponse, args : DebugProtocol.EvaluateArguments) : void {
        response.body = {
            result: "Something evaluated",
            variablesReference: 0
        };
        
        this.sendResponse(response);
    }
}

DebugSession.run(DukDebugSession);
