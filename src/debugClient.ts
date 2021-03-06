import * as EE from 'events';
import {Socket} from 'net';

export enum State {
    Paused,
    Running
}

export class StatusNotification {
    private _state : State;
    private _fileName : string;
    private _functionName : string;
    private _line : number;
    private _pc : number;

    public constructor(state : State, fileName : string, functionName : string, line : number, pc : number) {
        this._state = state;
        this._fileName = fileName;
        this._functionName = functionName;
        this._line = line;
        this._pc = pc;
    }

    public get Line() : number {
        return this._line;
    }

    public get State() : State {
        return this._state;
    }
}

export class PrintNotification {
    private _message : string;

    public constructor(message : string) {
        this._message = message;
    }

    public get Message() : string {
        return this._message;
    }
}

export class DuktapeDebugClient extends EE.EventEmitter {
    private _socket : Socket;
    private _gotReply : boolean;
    private _logger : Function;

    public constructor(logger) {
        super();

        this._socket = new Socket();
        this._gotReply = false;
        this._logger = logger;
    }

    public connect(host : string, port : number) : void {
        this._socket.connect(port, host);
        this._socket.on("connect", () => this.emit("connect"));
        this._socket.on("data", (data) => {
            this._onData(data);
        })
    }

    public addBreakpoint(file : string, line : number) : void {
        var addBreak = {
            request: 0x18,
            args: [ file, line ]
        };
        
        this._socket.write(JSON.stringify(addBreak) + "\n");
    }

    public getCallstack() : void {
        var getStack = { request: 0x1c };
        this._socket.write(JSON.stringify(getStack) + "\n");
    }

    public getLocals(stackDepth : number = -1) : void {
        var locals = { request: 0x1d, args: [ stackDepth ] };
        this._socket.write(JSON.stringify(locals) + "\n");
    }

    public listBreakpoints() : void {
        var listBreak = { request: 0x17 };
        this._socket.write(JSON.stringify(listBreak) + "\n");
    }

    public resume() : void {
        var resume = { request: 0x13 };
        this._socket.write(JSON.stringify(resume) + "\n");
    }
    
    public stepIn() : void {
        var step = { request: 0x14 };
        this._socket.write(JSON.stringify(step) + "\n");
    }

    public stepOver() : void {
        var step = { request: 0x15 };
        this._socket.write(JSON.stringify(step) + "\n");
    }

    private _onData(data : any) : void {
        var input = JSON.parse(data);

        if (typeof input.reply === "boolean" && input.reply) {
            this.emit("reply", input.args);
        } else if (typeof input.notify === "string" && input.notify === "_TargetConnected") {
            this.emit("targetConnected");
        } else if (typeof input.notify === "boolean" && input.notify) {
            var cmdId = input.command;

            switch(cmdId) {
                case 0x01:
                    this.emit("statusNotification", new StatusNotification(
                        input.args[0] == 0 ? State.Running : State.Paused,
                        input.args[1],
                        input.args[2],
                        input.args[3],
                        input.args[4]));
                    break;

                case 0x02:
                    this.emit("printNotification", new PrintNotification(
                        input.args[0]));
                    break;
            }
        }
    }
}