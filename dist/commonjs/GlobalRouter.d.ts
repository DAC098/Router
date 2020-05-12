/// <reference types="node" />
import { EventEmitter } from "events";
declare interface GlobalRouter extends EventEmitter {
}
declare class GlobalRouter extends EventEmitter {
    private id_count;
    constructor();
    getID(): number;
}
export default GlobalRouter;
