import { EventEmitter } from "events";

declare interface GlobalRouter extends EventEmitter {

}

class GlobalRouter extends EventEmitter {
    
    private id_count: number = 0;
    
    constructor() {
        super();
    }

    getID() {
        return ++this.id_count;
    }
}

export default GlobalRouter;