"use strict";

import {DebugSession, InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent, Thread, StackFrame, Scope, Source, Handles, Breakpoint} from 'vscode-debugadapter';
import {DebugProtocol} from 'vscode-debugprotocol';
import {readFileSync, writeFileSync} from 'fs';
import {basename} from 'path';
import {DuktapeDebugClient, PrintNotification, StatusNotification, State} from './debugClient';

/**
 * This interface should always match the schema found in the duk-debug extension manifest.
 */
export interface LaunchRequestArguments {
    /** An absolute path to the program to debug. */
    program: string;
}

export interface AttachRequestArguments {
    host: string;
    port: number;
}

class DuktapeDebugSession extends DebugSession {
    private static THREAD_ID = 1;
    
    private _adapterId : String;
    private _duk : DuktapeDebugClient;
    private _firstStatus : boolean;
    private _frameHandles = new Handles<any>();
    private _variableHandles = new Handles<any>();
    private _attachMode : boolean;
    private _needContinue : boolean;
    private _stopOnEntry : boolean;

    public constructor() {
        super();
        
        this.setDebuggerLinesStartAt1(true);
        
        this._duk = new DuktapeDebugClient((d) => this.log(d));
        this._firstStatus = true;
    }

    public log(message : string) : void {
        this.sendEvent(new OutputEvent(`${process.pid}: ${message}\r\n`));
    }
    
    protected configurationDoneRequest(response : DebugProtocol.ConfigurationDoneResponse, args : DebugProtocol.ConfigurationDoneArguments) : void {
        this.log("configurationDoneRequest");
        
        if (this._needContinue) {
            this._needContinue = false;
            this._duk.resume();
            this._duk.once("reply", () => {});
        }
        
        this._duk.on("statusNotification", (s) => { this._onStatusNotification(s); });
        this.sendResponse(response);
    }

    protected initializeRequest(response : DebugProtocol.InitializeResponse, args : DebugProtocol.InitializeRequestArguments) : void {
        this.log(`initializeRequest: adapterId: ${args.adapterID}`);
        this._adapterId = args.adapterID;
        
        response.body.supportsConfigurationDoneRequest = true;        
        this.sendResponse(response);
    }

    protected launchRequest(response : DebugProtocol.LaunchResponse, args : LaunchRequestArguments) : void {
        this.log("launchRequest");
        this.sendErrorResponse(response, 1, "Launch not implemented.");
    }
    
    protected attachRequest(response : DebugProtocol.AttachResponse, args : AttachRequestArguments) : void {
        this.log(`attachRequest - host=${args.host}, port=${args.port}`);
        this._attachMode = true;
        this._attach(response, args.host, args.port);
    }
    
    private _attach(response : DebugProtocol.Response, host : string, port : number) : void {
        this.log(`_attach`);

        this._duk.connect(host, port);
        this._duk.on("printNotification", (printNotification : PrintNotification) => {
            this.log(`print: ${printNotification.Message}`);
        });

        this._duk.on("targetConnected", () => {
            this._initialize(response);
        })
    }
    
    private _initialize(response : DebugProtocol.Response) : void {
        this.log(`_initialize`);

        // Get the first status notification
        this._duk.once("statusNotification", (status : StatusNotification) => {
            this.log(`Got first StatusNotification`);
            this.sendResponse(response);
            this._startInitialize(status.State !== State.Running);
        });
    }
    
    private _startInitialize(stopped : boolean) : void {
        this.log(`_startInitialize: stopped=${stopped}`);
        this.sendEvent(new InitializedEvent());
        
        if (this._attachMode) {
            this._stopOnEntry = stopped;
        }
        
        if (this._stopOnEntry) {
            this.log("Sending stop-on-entry.");
            this.sendEvent(new StoppedEvent("Stop on entry", DuktapeDebugSession.THREAD_ID));
        } else {
            this._needContinue = true;
        }
    }
    
    private _onStatusNotification(status : StatusNotification) : void {
        this.log(`onStatusNotification: ${JSON.stringify(status)}`);

        switch (status.State) {
            case State.Paused:
                this.sendEvent(new StoppedEvent("step", DuktapeDebugSession.THREAD_ID));
                break;
        }
    }
    
    protected setBreakPointsRequest(response : DebugProtocol.SetBreakpointsResponse, args : DebugProtocol.SetBreakpointsArguments) : void {
        this.log(`setBreakPointsRequest: ${JSON.stringify(args.source)} ${JSON.stringify(args.breakpoints)}`);

        this._duk.listBreakpoints();
        this._duk.once("reply", (dukArgs) => {
            this.log(`Duktape breakpoints: ${JSON.stringify(dukArgs)}`);
            
            for (let b of args.breakpoints) {
                b.line = this.convertClientLineToDebugger(b.line);
                b.column = typeof b.column === 'number' ? this.convertClientColumnToDebugger(b.column) : 0;
            }
            
            const source = args.source;
            
            if (source.path) {
                source.path = this.convertClientPathToDebugger(source.path);
            }

            response.body = {
                breakpoints: []
            };

            var breakpointsAdded = 0;
            
            var addBreakpoint = (i : number) => {
                var sourceBreakpoint = args.breakpoints[i];

                this._duk.addBreakpoint("project/index.js", sourceBreakpoint.line);
                this._duk.once("reply", () => {
                    breakpointsAdded += 1;

                    var bp = new Breakpoint(
                        true,
                        sourceBreakpoint.line);

                    response.body.breakpoints.push(bp);
                    
                    if (args.breakpoints.length === breakpointsAdded) {
                        this.log("all breakpoints added");
                        this.sendResponse(response);
                    } else {
                        addBreakpoint(breakpointsAdded);
                    }
                });
                
            };

            try {
                addBreakpoint(breakpointsAdded);                
            } catch (error) {
                this.log(`Error when adding breakpoint: ${error}`);
            }
        });
    }
    
    protected threadsRequest(response : DebugProtocol.ThreadsResponse) : void {
        this.log("threadsRequest");

        response.body = {
            threads: [
                new Thread(DuktapeDebugSession.THREAD_ID, "Duktape Thread #1")
            ]
        };
        
        this.sendResponse(response);
    }
    
    protected stackTraceRequest(response : DebugProtocol.StackTraceResponse, args : DebugProtocol.StackTraceArguments) : void {
        this.log("stackTraceRequest");
        
        const threadId = args.threadId;
        
        if (threadId !== DuktapeDebugSession.THREAD_ID) {
            this.sendErrorResponse(response, 2014, "Unexpected thread identifier.");
            return;
        }

        this._duk.getCallstack();
        this._duk.once("reply", (callstack) => {
            this.log(`Duk stack: ${JSON.stringify(callstack)}`);
            
            try {
                var dukFrames = Math.ceil(callstack.length / 4);
                const frames = new Array<StackFrame>();
                
                this.log(`Parsing ${dukFrames} Duktape frames. Callstack length ${callstack.length}`);
                
                for (var i = 0; i < dukFrames; i++) {
                    var offset = i*4;
                    
                    this.log(`offset=${offset}`);
                    
                    const fileName = callstack[offset + 0];
                    const funcName = callstack[offset + 1];
                    const lineNumber = callstack[offset + 2];
                    
                    this.log(`frame - fileName=${fileName}, funcName=${funcName}, lineNumber=${lineNumber}`);

                    var frame = new StackFrame(
                        i,
                        funcName,
                        new Source(basename(fileName), "C:\\Code\\duk-debug-test\\project\\index.js"),
                        this.convertDebuggerLineToClient(lineNumber),
                        0);

                    frames.push(frame);
                }
                
                this.log(`Sending ${frames.length} frames.`);

                response.body = {
                    stackFrames: frames
                };

                this.sendResponse(response);
            } catch (error) {
                this.log(`Error: ${error}`);
            }
        });
    }
    
    protected scopesRequest(response : DebugProtocol.ScopesResponse, args : DebugProtocol.ScopesArguments) : void {
        this.log("scopesRequest");

        const frameReference = args.frameId;
        const scopes = new Array<Scope>();
        
        response.body = {
            scopes: [
                new Scope("Locals", this._variableHandles.create("local_" + frameReference), false)
            ]
        };

        this.sendResponse(response);
    }
    
    protected variablesRequest(response : DebugProtocol.VariablesResponse, args : DebugProtocol.VariablesArguments) : void {
        this.log("variablesRequest");

        this._duk.getLocals();
        this._duk.once("reply", (locals) => {
            this.log(`locals=${JSON.stringify(locals)}`);

            const variables = [];
        
            response.body = {
                variables: variables
            };
            
            this.sendResponse(response);
        });
    }
    
    protected continueRequest(response : DebugProtocol.ContinueResponse, args : DebugProtocol.ContinueArguments) : void {
        this.log("continueRequest");

        this._duk.resume();
    }
    
    protected stepInRequest(response : DebugProtocol.StepInResponse, args : DebugProtocol.StepInArguments) : void {
        this.log("stepInRequest");
        
        this._duk.stepIn();
        this._duk.once("reply", () => {
            this.sendResponse(response);
        });
    }
    
    protected nextRequest(response : DebugProtocol.NextResponse, args : DebugProtocol.NextArguments) : void {
        this.log("nextRequest");
        
        this._duk.stepOver();
        this._duk.once("reply", () => {
            this.sendResponse(response);
        });
    }
    
    protected evaluateRequest(response : DebugProtocol.EvaluateResponse, args : DebugProtocol.EvaluateArguments) : void {
        this.log("evaluateRequest");

        response.body = {
            result: "Something evaluated",
            variablesReference: 0
        };
        
        this.sendResponse(response);
    }
}

DebugSession.run(DuktapeDebugSession);
