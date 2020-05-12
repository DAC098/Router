"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
class GlobalRouter extends events_1.EventEmitter {
    constructor() {
        super();
        this.id_count = 0;
    }
    getID() {
        return ++this.id_count;
    }
}
exports.default = GlobalRouter;
//# sourceMappingURL=GlobalRouter.js.map