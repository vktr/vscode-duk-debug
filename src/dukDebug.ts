"use strict";

import {DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles, Breakpoint} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {readFileSync, writeFileSync} from 'fs';
import {basename} from 'path';

/**
 * This interface should always match the schema found in the duk-debug extension manifest.
 */
export interface LaunchRequestArguments {
    /** An absolute path to the program to debug. */
    program: string;
}

class DuktapeDebugSession extends DebugSession {
    private static THREAD_ID = 1;

    public constructor() {
        super();
    }

    public log(message : string) : void {
        this.sendEvent(new OutputEvent(`${process.pid}: ${message}`));
    }

    protected initializeRequest(response : DebugProtocol.InitializeResponse, args : DebugProtocol.InitializeRequestArguments) : void {
        this.sendEvent(new InitializedEvent());

        response.body.supportsConfigurationDoneRequest = true;
        this.sendResponse(response);
    }
    
    protected launchRequest(response : DebugProtocol.LaunchResponse, args : LaunchRequestArguments) : void {
        this.log("Launching");
        this.continueRequest(response, { threadId: DuktapeDebugSession.THREAD_ID });        
    }
    
    protected setBreakpointsRequest(response : DebugProtocol.SetBreakpointsResponse, args : DebugProtocol.SetBreakpointsArguments) : void {
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
                new Thread(DuktapeDebugSession.THREAD_ID, "Duktape Thread #1")
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

DebugSession.run(DuktapeDebugSession);
