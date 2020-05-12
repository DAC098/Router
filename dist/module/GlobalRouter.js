import { EventEmitter } from "events";
class GlobalRouter extends EventEmitter {
    constructor() {
        super();
        this.id_count = 0;
    }
    getID() {
        return ++this.id_count;
    }
}
export default GlobalRouter;
//# sourceMappingURL=GlobalRouter.js.map