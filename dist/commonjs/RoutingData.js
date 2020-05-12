"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class RoutingData {
    constructor(router_list, url_list) {
        this.prev_routers = [];
        this.prev_urls = [];
        this.params = {};
        this.prev_routers = router_list;
        this.prev_urls = url_list;
    }
    getRouter() {
        return this.prev_routers[this.prev_routers.length - 1];
    }
    getURL() {
        return this.prev_urls[this.prev_urls.length - 1];
    }
}
exports.default = RoutingData;
//# sourceMappingURL=RoutingData.js.map